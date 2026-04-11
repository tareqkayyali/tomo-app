"""
Tomo AI Service — Cohere Reranker + State-Aware Scoring
Two-stage reranking pipeline:
  1. Cohere Rerank v3.5 — semantic relevance scoring
  2. State-aware boosts — athlete context multipliers (PHV, DLI, sport, readiness)

Ported from TypeScript ragChatRetriever.ts state-aware reranking logic.
"""

from __future__ import annotations

import logging
from typing import Optional

import cohere

from app.config import get_settings
from app.models.context import PlayerContext
from app.rag.models import RankedResult, RetrievalResult

logger = logging.getLogger("tomo-ai.rag.reranker")

# Cohere Rerank pricing: $2.00 per 1K search queries
COHERE_COST_PER_QUERY = 0.002

# Module-level client
_cohere_client: Optional[cohere.Client] = None


def _get_cohere() -> cohere.Client:
    """Get or create the Cohere client."""
    global _cohere_client
    if _cohere_client is None:
        settings = get_settings()
        _cohere_client = cohere.Client(api_key=settings.cohere_api_key)
    return _cohere_client


async def rerank_results(
    query: str,
    results: list[RetrievalResult],
    player_context: Optional[PlayerContext],
    top_k: int = 5,
) -> list[RankedResult]:
    """
    Two-stage reranking:
      1. Cohere Rerank (semantic relevance)
      2. State-aware boosts (athlete context multipliers)

    Args:
        query: User's original message.
        results: Unranked retrieval results.
        player_context: Athlete context for state-aware boosting.
        top_k: Number of results to return.

    Returns:
        Sorted list of RankedResults (highest final_score first).
    """
    if not results:
        return []

    # Extract text for Cohere reranking
    texts = [r.text_for_rerank for r in results if r.text_for_rerank]
    if not texts:
        # Fallback: use initial scores without Cohere
        return _apply_state_boosts(
            [RankedResult(result=r, cohere_score=r.score, final_score=r.score) for r in results],
            player_context,
            top_k,
        )

    # Stage 1: Cohere Rerank
    cohere_scores = await _cohere_rerank(query, texts)

    # Map Cohere scores back to results
    text_to_score = dict(zip(texts, cohere_scores))
    ranked = []
    for r in results:
        cscore = text_to_score.get(r.text_for_rerank, 0.0)
        ranked.append(RankedResult(
            result=r,
            cohere_score=cscore,
            final_score=cscore,
        ))

    # Stage 2: State-aware boosts
    return _apply_state_boosts(ranked, player_context, top_k)


async def _cohere_rerank(query: str, documents: list[str]) -> list[float]:
    """
    Call Cohere Rerank API.

    Returns a list of relevance scores (0.0-1.0), one per document,
    in the same order as the input documents.
    """
    try:
        co = _get_cohere()
        response = co.rerank(
            model="rerank-v3.5",
            query=query,
            documents=documents,
            top_n=len(documents),  # Score all documents
        )

        # Build score map by original index
        scores = [0.0] * len(documents)
        for item in response.results:
            scores[item.index] = item.relevance_score

        logger.info(f"Cohere rerank: {len(documents)} docs, cost ~${COHERE_COST_PER_QUERY:.4f}")
        return scores

    except Exception as e:
        logger.warning(f"Cohere rerank failed, using fallback scores: {e}")
        # Graceful fallback: return original similarity scores
        return [0.5] * len(documents)


def _apply_state_boosts(
    ranked: list[RankedResult],
    context: Optional[PlayerContext],
    top_k: int,
) -> list[RankedResult]:
    """
    Apply athlete state-aware multipliers to the reranked results.

    Boosts (ported from TypeScript ragChatRetriever.ts):
      - PHV boost: 1.5× for growth/PHV-related content if athlete is mid-PHV
      - DLI boost: 1.3× for load/recovery content if DLI > 60
      - Sport boost: 1.2× for content matching athlete's sport
      - Readiness boost: 1.3× for recovery content if readiness is RED
      - Age boost: 1.15× for age-band-specific content matching athlete
    """
    if not context:
        ranked.sort(key=lambda r: r.final_score, reverse=True)
        return ranked[:top_k]

    snapshot = context.snapshot_enrichment

    for item in ranked:
        boost = 1.0
        props = {}

        # Extract properties from entity or chunk
        if item.result.entity:
            props = item.result.entity.properties or {}
        elif item.result.chunk:
            props = {}  # Chunks use their domain for matching

        entity_name = ""
        entity_desc = ""
        if item.result.entity:
            entity_name = (item.result.entity.name or "").lower()
            entity_desc = (item.result.entity.description or "").lower()

        chunk_domain = ""
        if item.result.chunk:
            chunk_domain = (item.result.chunk.domain or "").lower()

        combined_text = f"{entity_name} {entity_desc} {chunk_domain}"

        # PHV boost: mid-PHV athletes get boosted PHV/growth content
        if snapshot and snapshot.phv_stage:
            phv = snapshot.phv_stage.upper()
            if phv in ("CIRCA", "MID"):
                if any(kw in combined_text for kw in ["phv", "growth", "maturity", "growth_plate"]):
                    boost *= 1.5

        # DLI boost: high dual load → boost load management / recovery
        if snapshot and snapshot.dual_load_index:
            dli = float(snapshot.dual_load_index)
            if dli > 60:
                if any(kw in combined_text for kw in ["load", "recovery", "dual", "academic", "exam"]):
                    boost *= 1.3

        # Readiness boost: RED readiness → boost recovery content
        if snapshot and snapshot.readiness_score:
            readiness = str(snapshot.readiness_score).upper()
            if readiness in ("RED", "1", "2"):
                if any(kw in combined_text for kw in ["recovery", "rest", "deload", "active_recovery"]):
                    boost *= 1.3

        # Sport boost: content matching athlete's sport
        sport = (context.sport or "").lower()
        if sport:
            sport_tags = props.get("sports", [])
            if isinstance(sport_tags, list) and sport in [s.lower() for s in sport_tags]:
                boost *= 1.2
            elif sport in combined_text:
                boost *= 1.15

        # Age boost: content matching athlete's age band
        age_band = (context.age_band or "").upper()
        if age_band:
            age_tags = props.get("age_groups", [])
            if isinstance(age_tags, list) and age_band in age_tags:
                boost *= 1.15

        item.state_boost = boost
        item.final_score = item.cohere_score * boost

    # Sort by final score and return top_k
    ranked.sort(key=lambda r: r.final_score, reverse=True)
    return ranked[:top_k]
