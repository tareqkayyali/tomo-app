"""
Tomo AI Service — RAG Retrieval LangGraph Node
Runs the hybrid PropertyGraphIndex retriever between pre_router and agent_dispatch.

Flow:
  context_assembly → pre_router → **rag_retrieval** → agent_dispatch → ...

pre_router runs FIRST so intent_id is set when this node checks RAG_SKIP_INTENTS.
Capsule and confirm paths skip this node entirely (saves ~$0.003 per skip).

This node:
  1. Gets the user message + player_context from state
  2. Checks whether the intent needs RAG (skips greetings, nav, logging)
  3. Reformulates plain-language queries into knowledge-domain language
  4. Runs the hybrid retriever (vector + graph + text + Cohere rerank)
  5. Stores formatted RAG context in state for system prompt injection
  6. Gracefully degrades — if RAG fails, chat continues without it

Cost: ~$0.003 per query (embedding + rerank)
Latency target: <500ms
"""

from __future__ import annotations

import logging
import time

from app.models.state import TomoChatState
from app.rag.retriever import retrieve
from app.utils.message_helpers import get_msg_type, get_msg_content

logger = logging.getLogger("tomo-ai.rag_retrieval")

# Skip RAG for very short messages (greetings, confirmations, etc.)
MIN_MESSAGE_LENGTH = 8

# ── Intents that should NEVER trigger RAG ────────────────────────────
# These are deterministic tool calls, navigation, or logging actions
# that don't need sports science grounding. Saves ~$0.003 per skip.
RAG_SKIP_INTENTS = frozenset({
    # Greetings — zero-cost greeting handler, no knowledge needed
    "greeting",
    # Smalltalk — mood chatter, reciprocal bids. No sports-science grounding needed.
    "smalltalk",
    # Navigation — UI routing only
    "navigate",
    # Deterministic data lookups — tool call returns DB data, no grounding needed
    "qa_today_schedule",
    "qa_week_schedule",
    "qa_streak",
    "qa_test_history",
    # Logging actions — user is inputting data, not asking for advice
    "log_test",
    "check_in",
    "log_nutrition",
    "log_sleep",
    "journal_pre",
    "journal_post",
    # Profile/settings — no sports science context needed
    "update_profile",
    "schedule_rules",
    "view_notifications",
    "clear_notifications",
    # UI features — gamification, not coaching
    "leaderboard",
    # Event creation — add_exam is deterministic, but create_event benefits from
    # load/schedule context so it's NOT skipped (removed from skip list in v2).
    "add_exam",
    # plan_study / plan_regular_study: NOT skipped — exam-period planning needs
    # dual-load / recovery context from the knowledge base (sports-science tags).
})

# Intents where empty RAG results are a safety / credibility concern (log WARNING)
SAFETY_CRITICAL_INTENTS = frozenset({
    "qa_readiness", "load_advice_request", "recovery_guidance",
    "injury_query", "red_risk_override",
    "program_recommendation", "training_planning", "build_week_plan",
    "plan_study", "plan_regular_study", "build_session", "plan_training",
})

# ── Intent-specific query expansion for better retrieval matching ────
# Maps natural athlete language to knowledge-domain terminology so
# embeddings match our sports science chunks more reliably.
QUERY_EXPANSIONS = {
    # High-stakes coaching intents — MUST retrieve knowledge chunks
    "qa_readiness": "athlete readiness training load management recovery protocol ACWR readiness score wellness",
    "load_advice_request": "training load management periodization injury prevention ACWR acute chronic workload deload overtraining",
    "recovery_guidance": "recovery protocols load reduction active recovery youth athlete rest day deload sleep tissue recovery foam rolling",
    "training_planning": "training periodization youth athlete season planning block periodization mesocycle intensity volume",
    "benchmark_comparison": "performance benchmarks age norms testing standards percentile CMJ sprint yoyo",
    "injury_query": "injury prevention youth athlete load management risk factors ACL growth plate return to play",
    "red_risk_override": "recovery protocols deload forced recovery injury prevention RED flag load reduction mandatory rest",
    # Medium-stakes intents — benefit from grounding
    "emotional_checkin": "youth athlete mental health dual load stress wellbeing mood check-in emotional support",
    "program_recommendation": "training program recommendation periodization youth athlete sport-specific development",
    "agent_fallthrough": "youth athlete coaching sports science training readiness recovery",
    "show_programs": "training programs recommendation sport-specific periodization youth development",
    "today_briefing": "daily readiness training load recovery status schedule athlete wellness",
    "load_reduce": "load reduction deload week recovery protocol overtraining prevention ACWR",
    "exam_setup": "exam period dual load academic stress training adjustment study schedule",
    "phv_calculate": "Peak Height Velocity growth maturation PHV stage youth development growth plate",
    "strengths_gaps": "athlete strengths weaknesses gap analysis performance testing benchmarks",
    "injury_mode": "injury management return to play rehabilitation load modification recovery timeline",
    # Session building -- multi_step flow bypasses the RAG node, but we
    # also call _reformulate_query from multi_step._build_session_step so
    # the enriched query uses these terms too (single source of truth).
    "build_session": "training session design drill selection progression periodization youth athlete sport-specific block",
    "plan_training": "training plan periodization block progression youth athlete volume intensity recovery",
    "build_week_plan": "weekly training plan periodization dual load exam stress recovery block mesocycle youth athlete",
    "plan_study": "dual load exam period academic stress cognitive recovery training adjustment study block youth athlete",
    "plan_regular_study": "study schedule academic load training balance recovery dual load time management youth athlete",
    "open_coaching": "youth athlete training coaching sports science load recovery periodization",
}

# ── Plain-language synonym map for query reformulation ───────────────
# Athletes use casual language; our knowledge chunks use formal terms.
# This bridges the gap by appending domain terms when casual phrases match.
_SYNONYM_EXPANSIONS = [
    # Readiness / feeling state
    ({"tired", "exhausted", "drained", "burnt out", "knackered", "dead", "shattered"},
     "recovery fatigue readiness REST overtraining"),
    # Recovery / rest
    ({"rest", "chill", "day off", "take it easy", "break"},
     "recovery deload active recovery rest day"),
    # Load / intensity
    ({"too much", "overdoing", "pushing too hard", "too intense", "overworking"},
     "overtraining ACWR load management deload"),
    # Growth / PHV
    ({"growing", "growth spurt", "getting taller", "growing pains", "knees hurt"},
     "PHV Peak Height Velocity growth plate maturation"),
    # Readiness check
    ({"ready", "good to go", "can i play", "fit to train", "ready to go"},
     "readiness score wellness training load clearance"),
    # Soreness / pain
    ({"sore", "aching", "stiff", "tight", "hurting"},
     "recovery tissue load soreness injury prevention"),
    # Speed / performance
    ({"fast", "quick", "speed", "slow"},
     "sprint testing performance benchmarks speed development"),
    # Exams / school
    ({"school", "homework", "revision", "studying", "test tomorrow"},
     "dual load academic stress exam period cognitive window"),
]


def _reformulate_query(user_message: str, intent_id: str, context) -> str:
    """
    Reformulate the user query for better knowledge retrieval.

    Two-stage process:
      1. Intent-specific expansion: append domain terms for known intents
      2. Synonym expansion: detect casual phrases and inject formal terms

    This ensures that both explicit coaching intents AND casual athlete
    phrasing produce embeddings that match our sports science chunks.
    """
    sport = (context.sport or "football").lower() if context else "football"
    parts = [user_message]

    # Stage 1: Intent-specific domain expansion
    expansion = QUERY_EXPANSIONS.get(intent_id, "")
    if expansion:
        parts.append(expansion)

    # Stage 2: Synonym-based expansion for casual language
    msg_lower = user_message.lower()
    synonym_terms = []
    for triggers, domain_terms in _SYNONYM_EXPANSIONS:
        if any(trigger in msg_lower for trigger in triggers):
            synonym_terms.append(domain_terms)

    if synonym_terms:
        parts.append(" ".join(synonym_terms))

    # Always include sport for context-aware retrieval
    parts.append(sport)

    query = " ".join(parts)
    return query


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

    # ── Check intent-based RAG skip FIRST (before any work) ──────────
    intent_id = state.get("intent_id", "")
    if intent_id in RAG_SKIP_INTENTS:
        logger.debug(f"Skipping RAG: intent={intent_id} in RAG_SKIP_INTENTS")
        return {"rag_context": "", "rag_metadata": {"skipped": True, "reason": f"intent:{intent_id}"}}

    # Extract user message from state
    messages = state.get("messages", [])
    if not messages:
        return {"rag_context": "", "rag_metadata": {}}

    # Get the latest user message
    # Uses robust helper for both LangChain objects and dict-format messages
    user_message = ""
    for msg in reversed(messages):
        msg_type = get_msg_type(msg)
        if msg_type == "human":
            user_message = get_msg_content(msg)
            break
        elif msg_type is None:
            # Unknown format -- try to extract content as fallback
            content = get_msg_content(msg)
            if content:
                user_message = content
                break

    if not user_message or len(user_message) < MIN_MESSAGE_LENGTH:
        logger.debug(f"Skipping RAG: message too short ({len(user_message)} chars)")
        return {"rag_context": "", "rag_metadata": {}}

    player_context = state.get("player_context")

    # Build reformulated retrieval query for better knowledge matching
    retrieval_query = _reformulate_query(user_message, intent_id, player_context)
    if retrieval_query != user_message:
        logger.debug(f"RAG query reformulated: '{user_message[:60]}' -> '{retrieval_query[:120]}'")

    try:
        result = await retrieve(
            query=retrieval_query,
            player_context=player_context,
            top_k=6,  # Increased from 4 to improve chunk depth for high-stakes queries
        )

        elapsed = (time.monotonic() - t0) * 1000

        metadata = {
            "entity_count": result.entity_count,
            "chunk_count": result.chunk_count,
            "graph_hops": result.graph_hops,
            "sub_questions": result.sub_questions,
            "retrieval_cost_usd": result.retrieval_cost_usd,
            "latency_ms": elapsed,
            "high_stakes_zero_chunks": bool(
                intent_id in SAFETY_CRITICAL_INTENTS and result.chunk_count == 0
            ),
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
