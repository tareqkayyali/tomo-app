"""
Tomo AI Service — Hybrid Retriever
Combines 5 retrieval signals for maximum recall + precision:

  1. Vector search on knowledge entities (Voyage AI embeddings)
  2. Vector search on knowledge chunks (existing rag_knowledge_chunks)
  3. Full-text search on entities (PostgreSQL tsvector)
  4. BM25-style text search on knowledge chunks (ts_rank_cd)
  5. Graph traversal from top-scoring entities (1-hop + 2-hop for conditions)

Then feeds all results through the 2-stage reranker (Cohere v3.5 + state-aware).

For complex queries, uses SubQuestionEngine to decompose into sub-questions,
retrieves for each, and merges before reranking.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from app.models.context import PlayerContext
from app.rag.embedder import embed_query
from app.rag.graph_store import (
    search_chunks_by_text,
    search_chunks_by_vector,
    search_entities_by_text,
    search_entities_by_vector,
    traverse_2hop,
    traverse_from_entity,
)
from app.rag.models import (
    ChunkResult,
    GraphRAGContext,
    GraphTraversalResult,
    KnowledgeEntity,
    RetrievalResult,
)
from app.rag.reranker import rerank_results
from app.rag.sub_question import decompose_query, should_decompose

logger = logging.getLogger("tomo-ai.rag.retriever")

# Maximum chunks for prompt injection (token budget ~900 tokens)
# Increased from 4 to 6 to improve grounding depth — insights showed
# avg 1.5 chunks per high-stakes query (recovery agent at 0.3).
MAX_PROMPT_CHUNKS = 6
MAX_PROMPT_TOKENS = 900  # ~4 chars per token

# `rag_knowledge_chunks` use controlled vocabularies (see sports-science-base.md).
# Athlete snapshot fields may use different strings; narrow filters with no DB overlap
# produce zero vector/BM25 hits (insights: "RAG runs, avg_chunks=0").
_CHUNK_CANON_AGE = frozenset({"U13", "U15", "U17", "U19", "ADULT"})


def _normalize_phv_stages_for_chunk_filter(raw: str | None) -> list[str] | None:
    """
    Map snapshot PHV labels to tags stored on rag_knowledge_chunks: PRE, CIRCA, POST.
    Unknown values return None so graph_store uses broad defaults (all stages).
    """
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip().upper().replace(" ", "_").replace("-", "_")
    if s in ("PRE", "EARLY", "BEFORE_PHV"):
        return ["PRE"]
    if s in ("POST", "LATE", "AFTER_PHV"):
        return ["POST"]
    if s in (
        "CIRCA", "CIRCA_PHV", "MID", "MID_PHV", "PEAK", "AT_PHV",
        "DURING_PHV", "GROWTH", "GROWTH_SPURT",
    ) or "CIRCA" in s or "MID_PHV" in s:
        return ["CIRCA"]
    return None


def _normalize_age_groups_for_chunk_filter(raw: str | None) -> list[str] | None:
    """
    Chunks are tagged with U13–U19 + ADULT (no U21/SEN/VET). A strict filter on
    U21 with no array overlap on any row returns zero results — map to nearest tags.
    """
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip().upper()
    if s in _CHUNK_CANON_AGE:
        return [s]
    if s == "U12":
        return ["U13"]
    if s == "U14":
        return ["U13", "U15"]
    if s == "U16":
        return ["U15", "U17"]
    if s == "U18":
        return ["U17", "U19"]
    if s == "U20":
        return ["U19", "ADULT"]
    if s == "U21":
        return ["U19", "ADULT"]
    if s in ("SEN", "VET", "SENIOR", "VETERAN", "MASTERS"):
        return ["ADULT"]
    return None


async def retrieve(
    query: str,
    player_context: Optional[PlayerContext] = None,
    top_k: int = MAX_PROMPT_CHUNKS,
) -> GraphRAGContext:
    """
    Main retrieval entry point.

    1. Optionally decompose complex queries into sub-questions
    2. For each (sub-)question: parallel vector + text + graph search
    3. Merge + deduplicate results
    4. Rerank with Cohere + state-aware boosts
    5. Format top results for prompt injection

    Args:
        query: User's message text.
        player_context: Athlete context for state-aware boosting + metadata filters.
        top_k: Max results to inject into prompt.

    Returns:
        GraphRAGContext with formatted text + metadata.
    """
    t0 = time.monotonic()
    total_cost = 0.0

    # Step 1: Decide on sub-question decomposition
    sub_questions = [query]
    if should_decompose(query):
        sub_questions = await decompose_query(query)
        # Cost: ~$0.0001 for Haiku decomposition
        total_cost += 0.0001

    # Step 2: Retrieve for each sub-question in parallel
    all_results: list[RetrievalResult] = []
    tasks = [_retrieve_single(q, player_context) for q in sub_questions]
    sub_results = await asyncio.gather(*tasks, return_exceptions=True)

    for i, res in enumerate(sub_results):
        if isinstance(res, Exception):
            logger.warning(f"Sub-question retrieval failed for '{sub_questions[i]}': {res}")
            continue
        results, cost = res
        all_results.extend(results)
        total_cost += cost

    # Step 3: Deduplicate
    deduped = _deduplicate(all_results)

    # Step 4: Rerank
    ranked = await rerank_results(query, deduped, player_context, top_k=top_k)
    # Cost: ~$0.002 per Cohere rerank call
    total_cost += 0.002

    # Step 5: Format for prompt injection
    formatted = _format_for_prompt(ranked, max_tokens=MAX_PROMPT_TOKENS)

    elapsed = (time.monotonic() - t0) * 1000
    logger.info(
        f"RAG retrieve: {len(ranked)} results from {len(deduped)} candidates, "
        f"{len(sub_questions)} sub-questions, {elapsed:.0f}ms, ${total_cost:.5f}"
    )

    return GraphRAGContext(
        formatted_text=formatted,
        entity_count=sum(1 for r in ranked if r.result.entity),
        chunk_count=sum(1 for r in ranked if r.result.chunk),
        graph_hops=sum(len(r.result.graph_path) for r in ranked),
        sub_questions=sub_questions if len(sub_questions) > 1 else [],
        retrieval_cost_usd=total_cost,
    )


async def _retrieve_single(
    query: str,
    context: Optional[PlayerContext],
) -> tuple[list[RetrievalResult], float]:
    """
    Retrieve for a single query using all 4 signals in parallel.

    Returns (results, cost).
    """
    cost = 0.0

    # Embed the query
    embedding = await embed_query(query)
    cost += 0.0001  # ~$0.0001 per Voyage embedding

    # Build metadata filters from context
    phv_stages = None
    age_groups = None
    entity_types = None  # Search all entity types

    if context and context.snapshot_enrichment:
        se = context.snapshot_enrichment
        if se and se.phv_stage:
            phv_stages = _normalize_phv_stages_for_chunk_filter(se.phv_stage)
            if phv_stages is None and str(se.phv_stage).strip():
                logger.info(
                    "RAG: unknown phv_stage=%r — using default PRE|CIRCA|POST filter",
                    se.phv_stage,
                )
        if context and context.age_band:
            age_groups = _normalize_age_groups_for_chunk_filter(context.age_band)
            if age_groups is None and str(context.age_band).strip():
                logger.info(
                    "RAG: non-canonical age_band=%r — using default U13–ADULT filter",
                    context.age_band,
                )

    # Run 4 search strategies in parallel (5th signal: BM25 chunk text search)
    vector_entities_task = search_entities_by_vector(
        embedding, entity_types=entity_types, limit=8, threshold=0.40
        # Lowered from 0.55 to 0.40 — insights showed entities found but
        # chunks missed at higher thresholds (52.2% entity-only rate).
    )
    chunk_vector_task = search_chunks_by_vector(
        embedding,
        phv_stages=phv_stages,
        age_groups=age_groups,
        limit=8,  # Increased from 5 to feed more candidates to reranker
        threshold=0.28,
        # Lowered from 0.40 to 0.28 — Voyage-3-lite 512-dim typical top
        # hit ~0.5-0.6 but plain-language athlete queries score lower.
        # Recovery queries averaged 0.3 chunks at 0.40 threshold.
        # Reranker + state-aware boosts handle precision after recall.
    )
    text_search_task = search_entities_by_text(
        query, entity_types=entity_types, limit=5
    )
    chunk_text_task = search_chunks_by_text(
        query,
        phv_stages=phv_stages,
        age_groups=age_groups,
        limit=6,  # Increased from 4 for better BM25 recall on casual language
    )

    vector_entities, chunks, text_entities, text_chunks = await asyncio.gather(
        vector_entities_task,
        chunk_vector_task,
        text_search_task,
        chunk_text_task,
        return_exceptions=True,
    )

    # ── Diagnostic logging: per-signal results ───────────────────
    ve_count = len(vector_entities) if isinstance(vector_entities, list) else "ERROR"
    ch_count = len(chunks) if isinstance(chunks, list) else "ERROR"
    te_count = len(text_entities) if isinstance(text_entities, list) else "ERROR"
    tc_count = len(text_chunks) if isinstance(text_chunks, list) else "ERROR"
    logger.info(
        f"RAG signals: vector_entities={ve_count}, chunk_vector={ch_count}, "
        f"text_entities={te_count}, chunk_text={tc_count}"
    )
    # Log actual errors for debugging
    for label, res in [
        ("vector_entities", vector_entities),
        ("chunk_vector", chunks),
        ("text_entities", text_entities),
        ("chunk_text", text_chunks),
    ]:
        if isinstance(res, Exception):
            logger.error(f"RAG signal {label} failed: {res}")

    results: list[RetrievalResult] = []

    # Process vector entity results
    if isinstance(vector_entities, list):
        for ent in vector_entities:
            results.append(RetrievalResult(
                source="vector_entity",
                entity=ent,
                score=ent.similarity or 0.0,
                text_for_rerank=f"{ent.display_name}: {ent.description}",
            ))

    # Process chunk vector results
    if isinstance(chunks, list):
        for chunk in chunks:
            results.append(RetrievalResult(
                source="chunk_vector",
                chunk=chunk,
                score=chunk.similarity,
                text_for_rerank=f"{chunk.title}: {chunk.content[:300]}",
            ))

    # Process text search results (entities)
    if isinstance(text_entities, list):
        for ent in text_entities:
            results.append(RetrievalResult(
                source="text_search",
                entity=ent,
                score=ent.similarity or 0.0,
                text_for_rerank=f"{ent.display_name}: {ent.description}",
            ))

    # Process BM25 text search results (chunks) — 5th signal
    if isinstance(text_chunks, list):
        for chunk in text_chunks:
            results.append(RetrievalResult(
                source="chunk_text",
                chunk=chunk,
                score=chunk.similarity,
                text_for_rerank=f"{chunk.title}: {chunk.content[:300]}",
            ))

    # Graph traversal from top 3 vector entities
    if isinstance(vector_entities, list) and vector_entities:
        graph_results = await _graph_expand(vector_entities[:3])
        results.extend(graph_results)

    return results, cost


async def _expand_one_entity(
    ent: KnowledgeEntity,
) -> list[RetrievalResult]:
    """Expand a single entity via 1-hop (always) + 2-hop (condition/concept only).

    Runs per-entity 1-hop and 2-hop concurrently via asyncio.gather so each
    entity's DB round-trips overlap instead of blocking sequentially.
    """
    results: list[RetrievalResult] = []
    if not ent.id:
        return results

    is_deep = ent.entity_type.value in ("condition", "concept")

    async def _one_hop() -> list[RetrievalResult]:
        try:
            neighbors = await traverse_from_entity(ent.id, direction="both", limit=8)
            return [
                RetrievalResult(
                    source="graph_traversal",
                    entity=n.related_entity,
                    graph_path=[n],
                    score=n.weight * (ent.similarity or 0.5),
                    text_for_rerank=f"{n.relation_type}: {ent.display_name} → {n.related_entity.display_name}. {n.related_entity.description}",
                )
                for n in neighbors
            ]
        except Exception as e:
            logger.warning(f"Graph traversal failed for {ent.name}: {e}")
            return []

    async def _two_hop() -> list[RetrievalResult]:
        if not is_deep:
            return []
        try:
            hops = await traverse_2hop(
                ent.id,
                hop1_relations=["CONTRAINDICATED_FOR", "RECOMMENDED_FOR", "TRIGGERS"],
                hop2_relations=["SAFE_ALTERNATIVE_TO", "RECOMMENDED_FOR", "AFFECTS"],
                limit=10,
            )
            return [
                RetrievalResult(
                    source="graph_traversal",
                    entity=KnowledgeEntity(
                        id=hop["hop2_entity_id"],
                        entity_type=hop["hop2_entity_type"],
                        name=hop["hop2_entity_name"],
                        display_name=hop["hop2_entity_name"],
                        description=hop.get("hop2_description", ""),
                    ),
                    graph_path=[],
                    score=hop["total_weight"] * (ent.similarity or 0.5),
                    text_for_rerank=(
                        f"Chain: {ent.display_name} → {hop['hop1_relation']} → "
                        f"{hop['hop1_entity_name']} → {hop['hop2_relation']} → "
                        f"{hop['hop2_entity_name']}. {hop.get('hop2_description', '')}"
                    ),
                )
                for hop in hops
            ]
        except Exception as e:
            logger.warning(f"2-hop traversal failed for {ent.name}: {e}")
            return []

    one_hop_res, two_hop_res = await asyncio.gather(_one_hop(), _two_hop())
    results.extend(one_hop_res)
    results.extend(two_hop_res)
    return results


async def _graph_expand(
    entities: list[KnowledgeEntity],
) -> list[RetrievalResult]:
    """
    Expand top entities via 1-hop graph traversal.
    For condition/concept entities, also do 2-hop for multi-hop chains.

    All entities expand concurrently via asyncio.gather — previously this ran
    sequentially which added ~150–300ms per call (3 entities × ~50–100ms each).
    """
    if not entities:
        return []

    per_entity = await asyncio.gather(
        *(_expand_one_entity(ent) for ent in entities),
        return_exceptions=False,
    )
    flat: list[RetrievalResult] = []
    for chunk in per_entity:
        flat.extend(chunk)
    return flat


def _deduplicate(results: list[RetrievalResult]) -> list[RetrievalResult]:
    """
    Deduplicate results by entity name or chunk ID.
    Keeps the highest-scoring version of each unique result.
    """
    seen: dict[str, RetrievalResult] = {}

    for r in results:
        key = ""
        if r.entity:
            key = f"entity:{r.entity.name}"
        elif r.chunk:
            key = f"chunk:{r.chunk.chunk_id}"
        else:
            continue

        if key not in seen or r.score > seen[key].score:
            seen[key] = r

    return list(seen.values())


def _format_for_prompt(
    ranked: list,  # list[RankedResult]
    max_tokens: int = MAX_PROMPT_TOKENS,
) -> str:
    """
    Format ranked results into a prompt-injectable text block.

    Output format matches the TS RAG injection style:
    ```
    SPORTS SCIENCE KNOWLEDGE GRAPH (evidence-grounded — cite naturally, don't force):
    ---
    [Entity/Chunk] Title (Evidence: Grade)
    Content/Description
    Graph path: A → RELATION → B → RELATION → C
    ---
    ```
    """
    if not ranked:
        return ""

    lines = [
        "SPORTS SCIENCE KNOWLEDGE GRAPH (evidence-grounded — cite naturally when relevant, don't force):"
    ]

    char_budget = max_tokens * 4  # ~4 chars per token
    chars_used = len(lines[0])

    for item in ranked:
        r = item.result
        block_lines = ["---"]

        if r.entity:
            grade = r.entity.properties.get("evidence_grade", "")
            grade_str = f" (Evidence: {grade})" if grade else ""
            block_lines.append(f"[{r.entity.entity_type.value}] {r.entity.display_name}{grade_str}")
            if r.entity.description:
                desc = r.entity.description[:250]
                block_lines.append(desc)

        elif r.chunk:
            grade_str = f" (Evidence: {r.chunk.evidence_grade})" if r.chunk.evidence_grade else ""
            block_lines.append(f"[{r.chunk.domain}] {r.chunk.title}{grade_str}")
            summary = r.chunk.athlete_summary or r.chunk.content[:250]
            block_lines.append(summary)

        # Add graph path info if present
        if r.graph_path:
            path_parts = []
            for hop in r.graph_path:
                path_parts.append(f"{hop.relation_type} → {hop.related_entity.display_name}")
            if path_parts:
                block_lines.append(f"Graph: {' → '.join(path_parts)}")

        block = "\n".join(block_lines)
        if chars_used + len(block) > char_budget:
            break

        lines.append(block)
        chars_used += len(block)

    lines.append("---")
    return "\n".join(lines)
