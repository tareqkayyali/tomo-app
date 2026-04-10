"""
Tomo AI Service — Knowledge Hierarchy Resolver
Resolves knowledge items (chunks, protocols, planning protocols) through the
multi-tenant hierarchy: Global → Institution → Group → Individual.

Resolution rules:
  - Global items (institution_id = NULL) are always included unless BLOCKed
  - Institution items are included if the tenant is in the ancestry chain
  - MANDATORY severity protocols cannot be overridden or blocked at any tier
  - Override types: inherit (pass-through), extend (add), override (replace), block (hide)
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.db.supabase import get_pool
from app.models.tenant import (
    GLOBAL_TENANT_ID,
    KnowledgeOverrideType,
    ResolvedKnowledgeChunk,
    ResolvedProtocol,
    TenantContext,
)

logger = logging.getLogger("tomo-ai.knowledge_resolver")


# ── Protocol Resolution ──────────────────────────────────────────────────────

async def resolve_protocols(
    tenant_ctx: TenantContext,
    category: Optional[str] = None,
    sport_filter: Optional[str] = None,
    phv_filter: Optional[str] = None,
) -> list[ResolvedProtocol]:
    """
    Resolve protocols for a tenant through the hierarchy.

    Uses the SQL function resolve_protocols_for_tenant() for the heavy lifting,
    then applies optional Python-side filters.

    MANDATORY global protocols are ALWAYS included — cannot be blocked.
    """
    pool = get_pool()
    if not pool:
        logger.warning("DB pool not available for protocol resolution")
        return []

    async with pool.connection() as conn:
        result = await conn.execute(
            "SELECT * FROM resolve_protocols_for_tenant(%s)",
            (tenant_ctx.tenant_id,),
        )
        rows = await result.fetchall()

        protocols = []
        for row in rows:
            cols = [desc[0] for desc in result.description]
            d = dict(zip(cols, row))

            # Optional Python-side filters
            if category and d.get("category") != category:
                continue

            protocols.append(ResolvedProtocol(
                protocol_id=str(d["protocol_id"]),
                name=d["name"],
                category=d["category"],
                safety_critical=bool(d.get("safety_critical", False)),
                is_built_in=bool(d.get("is_built_in", False)),
                priority=int(d.get("priority", 100)),
                institution_id=str(d["institution_id"]) if d.get("institution_id") else None,
                source_tier=d.get("source_tier", "global"),
            ))

        mandatory_count = len([p for p in protocols if p.is_mandatory])
        logger.info(
            f"Resolved {len(protocols)} protocols for tenant {tenant_ctx.tenant_name} "
            f"({mandatory_count} mandatory)"
        )
        return protocols


async def resolve_protocols_for_agent(
    tenant_ctx: TenantContext,
    sport: Optional[str] = None,
    phv_stage: Optional[str] = None,
) -> str:
    """
    Resolve protocols and format as a text block for agent system prompt injection.
    Returns a formatted string ready to append to the agent's dynamic block.
    """
    protocols = await resolve_protocols(tenant_ctx)
    if not protocols:
        return ""

    mandatory = [p for p in protocols if p.safety_critical and p.is_built_in]
    advisory = [p for p in protocols if not (p.safety_critical and p.is_built_in)]

    lines = ["## Active Protocols"]

    if mandatory:
        lines.append("\n### MANDATORY (built-in safety — cannot be overridden)")
        for p in mandatory:
            lines.append(f"- **{p.name}** [{p.category}] P{p.priority}")

    if advisory:
        lines.append("\n### Advisory")
        for p in advisory[:10]:  # Limit to avoid token bloat
            lines.append(f"- {p.name} [{p.category}] P{p.priority} (from {p.source_tier})")

    return "\n".join(lines)


# ── Knowledge Chunk Resolution ───────────────────────────────────────────────

async def resolve_knowledge_chunks(
    tenant_ctx: TenantContext,
    query_embedding: list[float],
    match_threshold: float = 0.7,
    match_count: int = 10,
) -> list[ResolvedKnowledgeChunk]:
    """
    Resolve knowledge chunks through the tenant hierarchy using vector similarity.
    Uses the SQL function resolve_knowledge_for_tenant().
    """
    pool = get_pool()
    if not pool:
        return []

    # Format embedding as PostgreSQL vector literal
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    async with pool.connection() as conn:
        result = await conn.execute(
            "SELECT * FROM resolve_knowledge_for_tenant(%s, %s::vector, %s, %s)",
            (tenant_ctx.tenant_id, embedding_str, match_threshold, match_count),
        )
        rows = await result.fetchall()

        chunks = []
        for row in rows:
            cols = [desc[0] for desc in result.description]
            d = dict(zip(cols, row))
            chunks.append(ResolvedKnowledgeChunk(
                chunk_id=str(d["chunk_id"]),
                domain=d["domain"],
                title=d["title"],
                content=d["content"],
                similarity=float(d.get("similarity", 0)),
                source_tier=d.get("source_tier", "global"),
            ))

        logger.info(
            f"Resolved {len(chunks)} knowledge chunks for tenant {tenant_ctx.tenant_name}"
        )
        return chunks


# ── Planning Protocol Resolution ─────────────────────────────────────────────

async def resolve_planning_protocols(
    tenant_ctx: TenantContext,
    category: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Resolve planning protocols through the tenant hierarchy.
    Similar to protocol resolution but for planning_protocols table.
    """
    pool = get_pool()
    if not pool:
        return []

    ancestry = tenant_ctx.ancestry
    if not ancestry:
        ancestry = [tenant_ctx.tenant_id, GLOBAL_TENANT_ID]

    # Build placeholders for ancestry IN clause
    placeholders = ",".join([f"%s" for _ in ancestry])

    query = f"""
        WITH ranked AS (
            SELECT
                pp.*,
                CASE
                    WHEN pp.institution_id IS NULL THEN 'global'
                    ELSE 'institution'
                END AS source_tier,
                ROW_NUMBER() OVER (
                    PARTITION BY pp.name
                    ORDER BY
                        CASE WHEN pp.severity = 'MANDATORY' THEN 0 ELSE 1 END,
                        CASE
                            WHEN pp.institution_id = %s THEN 0
                            WHEN pp.institution_id IS NULL THEN 2
                            ELSE 1
                        END
                ) AS rn
            FROM planning_protocols pp
            WHERE pp.is_enabled = true
              AND (pp.institution_id IS NULL OR pp.institution_id IN ({placeholders}))
              AND NOT EXISTS (
                  SELECT 1 FROM cms_knowledge_inheritance ki
                  WHERE ki.tenant_id = %s
                    AND ki.knowledge_type = 'planning_protocol'
                    AND ki.knowledge_id = pp.id
                    AND ki.override_type = 'block'
              )
        )
        SELECT * FROM ranked WHERE rn = 1 OR severity = 'MANDATORY'
    """

    params = [tenant_ctx.tenant_id] + ancestry + [tenant_ctx.tenant_id]

    async with pool.connection() as conn:
        result = await conn.execute(query, params)
        rows = await result.fetchall()
        cols = [desc[0] for desc in result.description]

        protocols = []
        for row in rows:
            d = dict(zip(cols, row))
            if category and d.get("category") != category:
                continue
            protocols.append(d)

        return protocols


# ── Tenant-Scoped RAG Integration ────────────────────────────────────────────

async def get_tenant_scoped_entities(
    tenant_ctx: TenantContext,
    entity_type: Optional[str] = None,
    limit: int = 50,
) -> list[dict]:
    """
    Get knowledge graph entities scoped to a tenant's hierarchy.
    Used by the RAG retriever to scope graph traversal.
    """
    pool = get_pool()
    if not pool:
        return []

    ancestry = tenant_ctx.ancestry
    if not ancestry:
        ancestry = [tenant_ctx.tenant_id, GLOBAL_TENANT_ID]

    placeholders = ",".join(["%s" for _ in ancestry])

    conditions = [f"(institution_id IS NULL OR institution_id IN ({placeholders}))"]
    params: list = list(ancestry)

    if entity_type:
        conditions.append("entity_type = %s")
        params.append(entity_type)

    where = " AND ".join(conditions)

    async with pool.connection() as conn:
        result = await conn.execute(
            f"SELECT * FROM knowledge_entities WHERE {where} ORDER BY name LIMIT %s",
            params + [limit],
        )
        rows = await result.fetchall()
        cols = [desc[0] for desc in result.description]
        return [dict(zip(cols, row)) for row in rows]
