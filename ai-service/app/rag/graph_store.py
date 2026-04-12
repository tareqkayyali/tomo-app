"""
Tomo AI Service — PostgreSQL Graph Store
CRUD operations and traversal queries for the knowledge graph.

All operations use the shared psycopg3 async pool from app.db.supabase.
Consistent with the existing DB patterns in context_assembly.py.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from app.db.supabase import get_pool
from app.rag.models import (
    ChunkResult,
    EntityType,
    GraphTraversalResult,
    KnowledgeEntity,
    KnowledgeRelationship,
    RelationType,
)

logger = logging.getLogger("tomo-ai.rag.graph_store")


# ── Entity Operations ─────────────────────────────────────────────────────────

async def upsert_entity(
    entity_type: str,
    name: str,
    display_name: str,
    description: str,
    properties: dict = None,
    embedding: list[float] = None,
    source_chunk_ids: list[str] = None,
) -> str:
    """
    Insert or update a knowledge entity. Returns the entity ID.

    Uses ON CONFLICT on (entity_type, name) to upsert.
    """
    pool = get_pool()
    props = json.dumps(properties or {})
    chunks = source_chunk_ids or []
    emb_str = _format_embedding(embedding) if embedding else None

    async with pool.connection() as conn:
        result = await conn.execute(
            """
            INSERT INTO knowledge_entities
                (entity_type, name, display_name, description, properties, embedding, source_chunk_ids)
            VALUES (%s, %s, %s, %s, %s::jsonb, %s::vector, %s)
            ON CONFLICT (entity_type, name) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                description = EXCLUDED.description,
                properties = EXCLUDED.properties,
                embedding = EXCLUDED.embedding,
                source_chunk_ids = EXCLUDED.source_chunk_ids
            RETURNING id
            """,
            (entity_type, name, display_name, description, props, emb_str, chunks),
        )
        row = await result.fetchone()
        return str(row[0])


async def bulk_upsert_entities(
    entities: list[dict],
) -> dict[str, str]:
    """
    Bulk upsert entities. Returns name → id mapping.

    Each dict must have: entity_type, name, display_name, description.
    Optional: properties, embedding, source_chunk_ids.
    """
    name_to_id: dict[str, str] = {}
    pool = get_pool()

    async with pool.connection() as conn:
        for ent in entities:
            props = json.dumps(ent.get("properties", {}))
            chunks = ent.get("source_chunk_ids", [])
            emb_str = _format_embedding(ent.get("embedding")) if ent.get("embedding") else None

            result = await conn.execute(
                """
                INSERT INTO knowledge_entities
                    (entity_type, name, display_name, description, properties, embedding, source_chunk_ids)
                VALUES (%s, %s, %s, %s, %s::jsonb, %s::vector, %s)
                ON CONFLICT (entity_type, name) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    description = EXCLUDED.description,
                    properties = EXCLUDED.properties,
                    embedding = EXCLUDED.embedding,
                    source_chunk_ids = EXCLUDED.source_chunk_ids
                RETURNING id
                """,
                (
                    ent["entity_type"],
                    ent["name"],
                    ent["display_name"],
                    ent["description"],
                    props,
                    emb_str,
                    chunks,
                ),
            )
            row = await result.fetchone()
            name_to_id[ent["name"]] = str(row[0])

    logger.info(f"Bulk upserted {len(name_to_id)} entities")
    return name_to_id


async def bulk_upsert_relationships(
    relationships: list[dict],
) -> int:
    """
    Bulk upsert relationships. Returns count of upserted rows.

    Each dict must have: source_entity_id, target_entity_id, relation_type.
    Optional: properties, source_chunk_ids, weight.
    """
    count = 0
    pool = get_pool()

    async with pool.connection() as conn:
        for rel in relationships:
            props = json.dumps(rel.get("properties", {}))
            chunks = rel.get("source_chunk_ids", [])
            weight = rel.get("weight", 1.0)

            await conn.execute(
                """
                INSERT INTO knowledge_relationships
                    (source_entity_id, target_entity_id, relation_type, properties, source_chunk_ids, weight)
                VALUES (%s, %s, %s, %s::jsonb, %s, %s)
                ON CONFLICT (source_entity_id, target_entity_id, relation_type) DO UPDATE SET
                    properties = EXCLUDED.properties,
                    source_chunk_ids = EXCLUDED.source_chunk_ids,
                    weight = EXCLUDED.weight
                """,
                (
                    rel["source_entity_id"],
                    rel["target_entity_id"],
                    rel["relation_type"],
                    props,
                    chunks,
                    weight,
                ),
            )
            count += 1

    logger.info(f"Bulk upserted {count} relationships")
    return count


# ── Search Operations ─────────────────────────────────────────────────────────

async def search_entities_by_vector(
    embedding: list[float],
    entity_types: list[str] = None,
    limit: int = 10,
    threshold: float = 0.60,
) -> list[KnowledgeEntity]:
    """
    Vector similarity search on entity embeddings.
    Uses the match_knowledge_entities RPC.
    """
    pool = get_pool()
    if not pool:
        logger.warning("DB pool not available for entity vector search")
        return []
    emb_str = _format_embedding(embedding)

    async with pool.connection() as conn:
        result = await conn.execute(
            "SELECT * FROM match_knowledge_entities(%s::vector, %s, %s, %s)",
            (emb_str, entity_types, limit, threshold),
        )
        rows = await result.fetchall()
        cols = [desc.name for desc in result.description]

    return [
        KnowledgeEntity(
            id=str(row[cols.index("id")]),
            entity_type=EntityType(row[cols.index("entity_type")]),
            name=row[cols.index("name")],
            display_name=row[cols.index("display_name")],
            description=row[cols.index("description")],
            properties=row[cols.index("properties")] or {},
            similarity=float(row[cols.index("similarity")]),
        )
        for row in rows
    ]


async def search_entities_by_text(
    query: str,
    entity_types: list[str] = None,
    limit: int = 10,
) -> list[KnowledgeEntity]:
    """
    Full-text search on entity name + description using tsvector.
    PostgreSQL built-in text search (ts_rank_cd for relevance scoring).
    """
    pool = get_pool()
    if not pool:
        logger.warning("DB pool not available for entity text search")
        return []

    # Build tsquery from user input — split on whitespace, join with | for OR matching
    words = [w for w in query.strip().split() if len(w) > 2]
    if not words:
        return []
    tsquery = " | ".join(words)

    if entity_types:
        async with pool.connection() as conn:
            result = await conn.execute(
                """
                SELECT id, entity_type, name, display_name, description, properties,
                       ts_rank_cd(search_vector, to_tsquery('english', %s)) AS rank
                FROM knowledge_entities
                WHERE search_vector @@ to_tsquery('english', %s)
                AND entity_type = ANY(%s)
                ORDER BY rank DESC
                LIMIT %s
                """,
                (tsquery, tsquery, entity_types, limit),
            )
            rows = await result.fetchall()
            cols = [desc.name for desc in result.description]
    else:
        async with pool.connection() as conn:
            result = await conn.execute(
                """
                SELECT id, entity_type, name, display_name, description, properties,
                       ts_rank_cd(search_vector, to_tsquery('english', %s)) AS rank
                FROM knowledge_entities
                WHERE search_vector @@ to_tsquery('english', %s)
                ORDER BY rank DESC
                LIMIT %s
                """,
                (tsquery, tsquery, limit),
            )
            rows = await result.fetchall()
            cols = [desc.name for desc in result.description]

    return [
        KnowledgeEntity(
            id=str(row[cols.index("id")]),
            entity_type=EntityType(row[cols.index("entity_type")]),
            name=row[cols.index("name")],
            display_name=row[cols.index("display_name")],
            description=row[cols.index("description")],
            properties=row[cols.index("properties")] or {},
            similarity=float(row[cols.index("rank")]),
        )
        for row in rows
    ]


async def search_chunks_by_vector(
    embedding: list[float],
    rec_types: list[str] = None,
    phv_stages: list[str] = None,
    age_groups: list[str] = None,
    limit: int = 5,
    threshold: float = 0.40,
) -> list[ChunkResult]:
    """
    Vector search on existing rag_knowledge_chunks table.
    Direct SQL query with pgvector cosine distance.
    Threshold 0.40 tuned for Voyage-3-lite 512-dim embeddings (typical top hit ~0.5-0.6).
    """
    pool = get_pool()
    if not pool:
        logger.warning("DB pool not available for chunk vector search")
        return []
    emb_str = _format_embedding(embedding)

    # Default filters (broad match if not specified)
    _rec = rec_types or ["READINESS", "RECOVERY", "DEVELOPMENT", "LOAD_WARNING",
                          "ACADEMIC", "MOTIVATION", "INJURY_PREVENTION", "NUTRITION",
                          "CV_OPPORTUNITY", "LOAD_MANAGEMENT", "PHV", "AGE_BAND",
                          "WELLBEING", "TRAINING_PLANNING", "SAFETY", "TESTING"]
    _phv = phv_stages or ["PRE", "CIRCA", "POST"]
    _age = age_groups or ["U13", "U15", "U17", "U19", "ADULT"]

    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT
                chunk_id, domain, title, content, athlete_summary,
                evidence_grade,
                1 - (embedding <=> %s::vector) AS similarity
            FROM rag_knowledge_chunks
            WHERE
                rec_types && %s::text[]
                AND phv_stages && %s::text[]
                AND age_groups && %s::text[]
                AND 1 - (embedding <=> %s::vector) > %s
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (emb_str, _rec, _phv, _age, emb_str, threshold, emb_str, limit),
        )
        rows = await result.fetchall()
        cols = [desc.name for desc in result.description]

    return [
        ChunkResult(
            chunk_id=str(row[cols.index("chunk_id")]),
            domain=row[cols.index("domain")],
            title=row[cols.index("title")],
            content=row[cols.index("content")],
            athlete_summary=row[cols.index("athlete_summary")],
            evidence_grade=row[cols.index("evidence_grade")],
            similarity=float(row[cols.index("similarity")]),
        )
        for row in rows
    ]


async def search_chunks_by_text(
    query: str,
    rec_types: list[str] = None,
    phv_stages: list[str] = None,
    age_groups: list[str] = None,
    limit: int = 5,
) -> list[ChunkResult]:
    """
    BM25-style text search on rag_knowledge_chunks via PostgreSQL tsvector.
    Uses ts_rank_cd with normalization=32 (length normalization) to approximate BM25.

    Requires migration 043 (search_vector column + match_knowledge_chunks_text RPC).
    Graceful fallback: returns empty list if tsvector column doesn't exist yet.
    """
    pool = get_pool()
    if not pool:
        logger.warning("DB pool not available for chunk text search")
        return []

    try:
        async with pool.connection() as conn:
            result = await conn.execute(
                "SELECT * FROM match_knowledge_chunks_text(%s, %s, %s, %s, %s)",
                (query, rec_types, phv_stages, age_groups, limit),
            )
            rows = await result.fetchall()
            cols = [desc.name for desc in result.description]

        return [
            ChunkResult(
                chunk_id=str(row[cols.index("chunk_id")]),
                domain=row[cols.index("domain")],
                title=row[cols.index("title")],
                content=row[cols.index("content")],
                athlete_summary=row[cols.index("athlete_summary")],
                evidence_grade=row[cols.index("evidence_grade")],
                similarity=float(row[cols.index("rank")]),
            )
            for row in rows
        ]
    except Exception as e:
        # Graceful fallback if migration 043 hasn't been applied yet
        logger.warning(f"Chunk text search unavailable (migration 043 pending?): {e}")
        return []


# ── Graph Traversal ───────────────────────────────────────────────────────────

async def traverse_from_entity(
    entity_id: str,
    relation_types: list[str] = None,
    direction: str = "outgoing",
    limit: int = 20,
) -> list[GraphTraversalResult]:
    """
    1-hop graph traversal from a starting entity.
    Uses the traverse_knowledge_graph RPC.
    """
    pool = get_pool()
    if not pool:
        logger.warning("DB pool not available for graph traversal")
        return []

    async with pool.connection() as conn:
        result = await conn.execute(
            "SELECT * FROM traverse_knowledge_graph(%s, %s, %s, %s)",
            (entity_id, relation_types, direction, limit),
        )
        rows = await result.fetchall()
        cols = [desc.name for desc in result.description]

    return [
        GraphTraversalResult(
            relationship_id=str(row[cols.index("relationship_id")]),
            relation_type=row[cols.index("relation_type")],
            related_entity=KnowledgeEntity(
                id=str(row[cols.index("related_entity_id")]),
                entity_type=EntityType(row[cols.index("related_type")]),
                name=row[cols.index("related_name")],
                display_name=row[cols.index("related_display")],
                description=row[cols.index("related_desc")],
            ),
            weight=float(row[cols.index("rel_weight")]),
        )
        for row in rows
    ]


async def traverse_2hop(
    entity_id: str,
    hop1_relations: list[str] = None,
    hop2_relations: list[str] = None,
    limit: int = 20,
) -> list[dict]:
    """
    2-hop traversal for multi-hop knowledge queries.
    E.g., Mid_PHV → CONTRAINDICATED_FOR → Exercise → SAFE_ALTERNATIVE_TO → Exercise
    """
    pool = get_pool()
    if not pool:
        logger.warning("DB pool not available for 2-hop graph traversal")
        return []

    async with pool.connection() as conn:
        result = await conn.execute(
            "SELECT * FROM traverse_knowledge_graph_2hop(%s, %s, %s, %s)",
            (entity_id, hop1_relations, hop2_relations, limit),
        )
        rows = await result.fetchall()
        cols = [desc.name for desc in result.description]

    return [
        {
            "hop1_relation": row[cols.index("hop1_relation")],
            "hop1_entity_id": str(row[cols.index("hop1_entity_id")]),
            "hop1_entity_name": row[cols.index("hop1_entity_name")],
            "hop1_entity_type": row[cols.index("hop1_entity_type")],
            "hop2_relation": row[cols.index("hop2_relation")],
            "hop2_entity_id": str(row[cols.index("hop2_entity_id")]),
            "hop2_entity_name": row[cols.index("hop2_entity_name")],
            "hop2_entity_type": row[cols.index("hop2_entity_type")],
            "hop2_description": row[cols.index("hop2_description")],
            "total_weight": float(row[cols.index("total_weight")]),
        }
        for row in rows
    ]


async def get_entity_by_name(name: str) -> Optional[KnowledgeEntity]:
    """Look up an entity by its machine name."""
    pool = get_pool()

    async with pool.connection() as conn:
        result = await conn.execute(
            "SELECT id, entity_type, name, display_name, description, properties FROM knowledge_entities WHERE name = %s",
            (name,),
        )
        row = await result.fetchone()
        if not row:
            return None
        cols = [desc.name for desc in result.description]

    return KnowledgeEntity(
        id=str(row[cols.index("id")]),
        entity_type=EntityType(row[cols.index("entity_type")]),
        name=row[cols.index("name")],
        display_name=row[cols.index("display_name")],
        description=row[cols.index("description")],
        properties=row[cols.index("properties")] or {},
    )


async def get_contraindication_chain(condition_name: str) -> dict:
    """
    Get the full PHV contraindication chain:
    condition → CONTRAINDICATED_FOR → exercises → SAFE_ALTERNATIVE_TO → alternatives

    This is the key gate requirement for Phase 5.

    Returns:
        {
            "condition": KnowledgeEntity,
            "contraindicated": [
                {
                    "exercise": KnowledgeEntity,
                    "alternatives": [KnowledgeEntity, ...]
                }
            ],
            "affected_body_regions": [KnowledgeEntity, ...]
        }
    """
    entity = await get_entity_by_name(condition_name)
    if not entity or not entity.id:
        return {"condition": None, "contraindicated": [], "affected_body_regions": []}

    # 1-hop: condition → CONTRAINDICATED_FOR → exercises
    contraindicated = await traverse_from_entity(
        entity.id,
        relation_types=["CONTRAINDICATED_FOR"],
        direction="outgoing",
    )

    # 1-hop: condition → AFFECTS → body regions
    body_regions = await traverse_from_entity(
        entity.id,
        relation_types=["AFFECTS"],
        direction="outgoing",
    )

    # For each contraindicated exercise, find safe alternatives
    results = []
    for item in contraindicated:
        if item.related_entity.id:
            alternatives = await traverse_from_entity(
                item.related_entity.id,
                relation_types=["SAFE_ALTERNATIVE_TO"],
                direction="incoming",  # alternative → SAFE_ALTERNATIVE_TO → this exercise
            )
            results.append({
                "exercise": item.related_entity,
                "alternatives": [a.related_entity for a in alternatives],
            })
        else:
            results.append({"exercise": item.related_entity, "alternatives": []})

    return {
        "condition": entity,
        "contraindicated": results,
        "affected_body_regions": [r.related_entity for r in body_regions],
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _format_embedding(embedding: list[float] | None) -> str | None:
    """Format embedding as PostgreSQL vector literal: '[0.1,0.2,...]'"""
    if not embedding:
        return None
    return "[" + ",".join(str(f) for f in embedding) + "]"
