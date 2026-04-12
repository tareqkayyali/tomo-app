"""
Tomo AI Service — RAG Retrieval LangGraph Node
Runs the hybrid PropertyGraphIndex retriever between context_assembly and pre_router.

Flow:
  context_assembly → **rag_retrieval** → pre_router → agent_dispatch → ...

This node:
  1. Gets the user message + player_context from state
  2. Runs the hybrid retriever (vector + graph + text + Cohere rerank)
  3. Stores formatted RAG context in state for system prompt injection
  4. Gracefully degrades — if RAG fails, chat continues without it

Cost: ~$0.003 per query (embedding + rerank)
Latency target: <500ms
"""

from __future__ import annotations

import logging
import time

from app.models.state import TomoChatState
from app.rag.retriever import retrieve

logger = logging.getLogger("tomo-ai.rag_retrieval")

# Skip RAG for very short messages (greetings, confirmations, etc.)
MIN_MESSAGE_LENGTH = 8

# Intents where empty RAG results are a safety concern
SAFETY_CRITICAL_INTENTS = frozenset({
    "qa_readiness", "load_advice_request", "recovery_guidance",
    "injury_query", "red_risk_override",
})

# Intent-specific query expansion for better retrieval matching
QUERY_EXPANSIONS = {
    "qa_readiness": "athlete readiness training load management recovery protocol",
    "load_advice_request": "training load management periodization injury prevention",
    "recovery_guidance": "recovery protocols load reduction active recovery youth athlete",
    "training_planning": "training periodization youth athlete season planning",
    "benchmark_comparison": "performance benchmarks age norms testing standards",
    "injury_query": "injury prevention youth athlete load management risk factors",
    "red_risk_override": "recovery protocols deload forced recovery injury prevention",
}


def _build_retrieval_query(user_message: str, intent_id: str, context) -> str:
    """Construct a retrieval query that maps natural language to knowledge domain."""
    sport = (context.sport or "football").lower() if context else "football"

    expansion = QUERY_EXPANSIONS.get(intent_id, "")
    if expansion:
        return f"{user_message} {expansion} {sport}"
    return user_message


async def rag_retrieval_node(state: TomoChatState) -> dict:
    """
    LangGraph node: retrieve relevant knowledge from the PropertyGraphIndex.

    Populates:
      - rag_context: Formatted text for system prompt injection
      - rag_metadata: Entity/chunk counts, sub-questions, cost

    Graceful degradation: if retrieval fails, returns empty context
    (chat continues as if RAG doesn't exist — same as baseline behavior).
    """
    t0 = time.monotonic()

    # Extract user message from state
    messages = state.get("messages", [])
    if not messages:
        return {"rag_context": "", "rag_metadata": {}}

    # Get the latest user message
    user_message = ""
    for msg in reversed(messages):
        if hasattr(msg, "type") and msg.type == "human":
            user_message = msg.content
            break
        elif hasattr(msg, "content") and not hasattr(msg, "type"):
            user_message = msg.content
            break

    if not user_message or len(user_message) < MIN_MESSAGE_LENGTH:
        logger.debug(f"Skipping RAG: message too short ({len(user_message)} chars)")
        return {"rag_context": "", "rag_metadata": {}}

    player_context = state.get("player_context")

    # Build intent-aware retrieval query for better knowledge matching
    intent_id = state.get("intent_id", "")
    retrieval_query = _build_retrieval_query(user_message, intent_id, player_context)
    if retrieval_query != user_message:
        logger.debug(f"RAG query expanded: '{user_message[:60]}' → '{retrieval_query[:100]}'")

    try:
        result = await retrieve(
            query=retrieval_query,
            player_context=player_context,
            top_k=4,
        )

        elapsed = (time.monotonic() - t0) * 1000

        metadata = {
            "entity_count": result.entity_count,
            "chunk_count": result.chunk_count,
            "graph_hops": result.graph_hops,
            "sub_questions": result.sub_questions,
            "retrieval_cost_usd": result.retrieval_cost_usd,
            "latency_ms": elapsed,
        }

        if result.formatted_text:
            logger.info(
                f"RAG retrieval: {result.entity_count} entities, "
                f"{result.chunk_count} chunks, {result.graph_hops} hops, "
                f"{elapsed:.0f}ms, ${result.retrieval_cost_usd:.5f}"
            )
        else:
            if intent_id in SAFETY_CRITICAL_INTENTS:
                logger.warning(
                    f"RAG EMPTY for safety-critical intent={intent_id} "
                    f"query='{user_message[:100]}' — proceeding without knowledge grounding"
                )
            else:
                logger.debug(f"RAG retrieval: no relevant results ({elapsed:.0f}ms)")

        return {
            "rag_context": result.formatted_text,
            "rag_metadata": metadata,
            "total_cost_usd": state.get("total_cost_usd", 0.0) + result.retrieval_cost_usd,
        }

    except Exception as e:
        elapsed = (time.monotonic() - t0) * 1000
        logger.warning(f"RAG retrieval failed ({elapsed:.0f}ms): {e}")
        # Graceful degradation: chat continues without RAG
        return {"rag_context": "", "rag_metadata": {"error": str(e)}}
