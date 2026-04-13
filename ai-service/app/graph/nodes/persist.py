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
from app.graph.observability import build_post_execution_metadata

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
                """INSERT INTO chat_sessions (id, user_id, last_agent_type, updated_at)
                   VALUES (%s, %s, %s, NOW())
                   ON CONFLICT (id) DO UPDATE SET
                     last_agent_type = EXCLUDED.last_agent_type,
                     updated_at = NOW()""",
                (session_id, user_id, selected_agent),
            )

            # Save conversation turn
            # NOTE: User message is already saved by TypeScript gateway (route.ts)
            # before proxying to Python. We only save the assistant response here
            # to avoid duplicate user messages inflating session history.
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

    # ── Compute observability metadata for LangSmith trace capture ──
    # persist_node is the last node before END, so the auto-tracer
    # captures this in the graph output — no PATCH/update_run needed.
    try:
        post_metadata, post_tags = build_post_execution_metadata(state)

        # ── Write to local ai_trace_log for feedback loop collector ──
        # This decouples the collector from LangSmith API read access.
        # The same 40+ fields that go to LangSmith are stored locally.
        try:
            pool = get_pool()
            if pool:
                m = post_metadata  # shorthand
                async with pool.connection() as conn:
                    await conn.execute(
                        """
                        INSERT INTO ai_trace_log (
                            request_id, user_id, session_id, message,
                            path_type, agent_type, classification_layer, intent_id,
                            routing_confidence, tool_count, tool_names,
                            total_cost_usd, total_tokens, latency_ms,
                            validation_passed, validation_flags,
                            phv_gate_fired, crisis_detected, ped_detected, medical_warning,
                            rag_used, rag_entity_count, rag_chunk_count,
                            rag_cost_usd, rag_latency_ms,
                            sport, age_band, phv_stage,
                            readiness_score, readiness_rag, injury_risk,
                            acwr, acwr_bucket, data_confidence_score,
                            checkin_staleness_days,
                            cost_bucket, latency_bucket, confidence_bucket, tool_bucket
                        ) VALUES (
                            %s, %s, %s, %s,
                            %s, %s, %s, %s,
                            %s, %s, %s,
                            %s, %s, %s,
                            %s, %s,
                            %s, %s, %s, %s,
                            %s, %s, %s,
                            %s, %s,
                            %s, %s, %s,
                            %s, %s, %s,
                            %s, %s, %s,
                            %s,
                            %s, %s, %s, %s
                        )
                        """,
                        (
                            state.get("request_id", ""),
                            user_id,
                            session_id,
                            user_message,
                            m.get("path_type"),
                            m.get("agent_type"),
                            m.get("classification_layer"),
                            m.get("intent_id"),
                            m.get("routing_confidence", 0),
                            m.get("tool_count", 0),
                            m.get("tool_names", []),
                            m.get("total_cost_usd", 0),
                            m.get("total_tokens", 0),
                            m.get("latency_ms", 0),
                            m.get("validation_passed", True),
                            m.get("validation_flags", []),
                            m.get("phv_gate_fired", False),
                            m.get("crisis_detected", False),
                            m.get("ped_detected", False),
                            m.get("medical_warning", False),
                            m.get("rag_used", False),
                            m.get("rag_entity_count", 0),
                            m.get("rag_chunk_count", 0),
                            m.get("rag_cost_usd", 0),
                            m.get("rag_latency_ms", 0),
                            m.get("sport"),
                            m.get("age_band"),
                            m.get("phv_stage"),
                            m.get("readiness_score"),
                            m.get("readiness_rag"),
                            m.get("injury_risk"),
                            m.get("acwr"),
                            m.get("acwr_bucket"),
                            m.get("data_confidence_score"),
                            m.get("checkin_staleness_days", 0),
                            m.get("cost_bucket"),
                            m.get("latency_bucket"),
                            m.get("confidence_bucket"),
                            m.get("tool_bucket"),
                        ),
                    )
        except Exception as e:
            # Trace log failure must never block the response
            logger.debug(f"ai_trace_log write failed (non-blocking): {e}")

        return {"_observability": {"metadata": post_metadata, "tags": post_tags}}
    except Exception as e:
        logger.warning(f"Observability enrichment failed (non-blocking): {e}")
        return {}
