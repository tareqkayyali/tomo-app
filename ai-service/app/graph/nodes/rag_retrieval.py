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

    try:
        result = await retrieve(
            query=user_message,
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
