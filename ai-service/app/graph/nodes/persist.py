"""
Tomo AI Service — Persist Node
Saves conversation data to the database after response is formatted.

Responsibilities:
  1. Save/update chat session
  2. Save message pair (user + assistant) to conversation history
  3. Update conversation state metadata (last_agent, intent, etc.)
  4. Log telemetry data for LangSmith
"""

from __future__ import annotations

import json
import logging
import time
from typing import Optional

from app.models.state import TomoChatState

logger = logging.getLogger("tomo-ai.persist")


async def persist_node(state: TomoChatState) -> dict:
    """
    Persist conversation data to the database.

    Saves:
      - Chat session (create or update)
      - Conversation turn (user message + assistant response)
      - Telemetry (cost, tokens, latency)

    Returns minimal state update (no new data added).
    """
    from app.db.supabase import get_pool

    user_id = state.get("user_id", "")
    session_id = state.get("session_id", "")
    agent_response = state.get("agent_response", "")
    final_response = state.get("final_response", "")
    selected_agent = state.get("selected_agent", "output")
    total_cost = state.get("total_cost_usd", 0.0)
    total_tokens = state.get("total_tokens", 0)
    latency_ms = state.get("latency_ms", 0.0)
    tool_calls = state.get("tool_calls", [])
    validation_flags = state.get("validation_flags", [])
    routing_confidence = state.get("routing_confidence", 0.0)

    # Extract user message from state
    messages = state.get("messages", [])
    user_message = ""
    for msg in reversed(messages):
        if hasattr(msg, "type") and msg.type == "human":
            user_message = msg.content if isinstance(msg.content, str) else str(msg.content)
            break

    if not user_id or not session_id:
        logger.warning("persist_node: missing user_id or session_id, skipping persist")
        return {}

    try:
        pool = get_pool()
        async with pool.connection() as conn:
            # Upsert chat session
            await conn.execute(
                """INSERT INTO chat_sessions (id, user_id, active_agent, updated_at)
                   VALUES (%s, %s, %s, NOW())
                   ON CONFLICT (id) DO UPDATE SET
                     active_agent = EXCLUDED.active_agent,
                     updated_at = NOW()""",
                (session_id, user_id, selected_agent),
            )

            # Save conversation turn
            turn_data = {
                "agent_type": selected_agent,
                "routing_confidence": routing_confidence,
                "tool_calls": [tc.get("name") for tc in tool_calls],
                "validation_flags": validation_flags,
                "cost_usd": total_cost,
                "tokens": total_tokens,
                "latency_ms": latency_ms,
            }

            await conn.execute(
                """INSERT INTO chat_messages (session_id, user_id, role, content, metadata)
                   VALUES (%s, %s, 'user', %s, '{}')""",
                (session_id, user_id, user_message),
            )

            await conn.execute(
                """INSERT INTO chat_messages (session_id, user_id, role, content, metadata)
                   VALUES (%s, %s, 'assistant', %s, %s)""",
                (session_id, user_id, final_response or agent_response, json.dumps(turn_data)),
            )

        logger.info(
            f"Persisted turn: session={session_id[:8]}... "
            f"agent={selected_agent} cost=${total_cost:.6f} "
            f"tokens={total_tokens} tools={len(tool_calls)}"
        )

    except Exception as e:
        # Persistence failure should NOT block the response
        logger.error(f"persist_node error (non-blocking): {e}", exc_info=True)

    # ── Zep memory save (non-blocking, fire-and-forget) ──
    try:
        from app.services.memory_service import save_memory_after_turn

        # Count messages in this session to determine turn count
        turn_count = len([m for m in messages if hasattr(m, "type") and m.type == "human"])

        await save_memory_after_turn(
            user_id=user_id,
            session_id=session_id,
            user_message=user_message,
            assistant_response=final_response or agent_response,
            agent_type=selected_agent,
            turn_count=turn_count,
        )
    except Exception as e:
        logger.debug(f"Zep memory save skipped: {e}")

    return {}
