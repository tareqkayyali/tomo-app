"""
Tomo AI Service — Classifier Node (v2)

Unified intent classification node that supports both v1 and v2 classifiers:
  v1 (CLASSIFIER_VERSION=haiku): 3-layer Haiku+regex (existing pre_router_node)
  v2 (CLASSIFIER_VERSION=sonnet): 2-layer exact-match + Sonnet

Default: v2 (sonnet). Override with CLASSIFIER_VERSION=haiku to fall back.

This node replaces pre_router_node when CLASSIFIER_VERSION=sonnet.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Optional

from app.models.state import TomoChatState
from app.agents.intent_classifier import (
    classify_intent,
    _normalize,
    _EXACT_MATCH_MAP,
)
from app.agents.sonnet_classifier import classify_with_sonnet
from app.agents.router import should_keep_agent_lock
from app.utils.message_helpers import get_msg_type, get_msg_content

logger = logging.getLogger("tomo-ai.classifier_node")

_CLASSIFIER_VERSION = os.environ.get("CLASSIFIER_VERSION", "sonnet")

# v1→v2 agent name mapping
_V1_TO_V2 = {
    "output": "performance",
    "testing_benchmark": "performance",
    "recovery": "performance",
    "training_program": "performance",
    "timeline": "planning",
    "dual_load": "planning",
    "mastery": "identity",
    "cv_identity": "identity",
    "settings": "settings",
    "planning": "planning",
}


async def classifier_node(state: TomoChatState) -> dict:
    """
    v2 Classifier: Layer 1 exact match ($0) → Layer 2 Sonnet (~$0.003).

    Layer 1 catches greetings, schedule views, navigation, quick status — $0.
    Layer 2 Sonnet handles everything else with full conversation context.
    """
    context = state.get("player_context")
    if not context:
        logger.error("classifier_node: no player_context")
        return {
            "route_decision": "ai",
            "selected_agent": "performance",
            "routing_confidence": 0.0,
            "classification_layer": "error",
            "intent_id": "unknown",
        }

    # Extract user message
    messages = state.get("messages", [])
    user_message = ""
    for msg in reversed(messages):
        if get_msg_type(msg) == "human":
            user_message = get_msg_content(msg)
            break

    if not user_message:
        return {
            "route_decision": "ai",
            "selected_agent": "performance",
            "routing_confidence": 0.0,
            "classification_layer": "error",
            "intent_id": "unknown",
        }

    # Check agent lock (conversation continuity)
    last_agent = state.get("selected_agent")
    if last_agent:
        from app.agents.router import should_keep_agent_lock
        if should_keep_agent_lock(user_message, last_agent, None):
            mapped = _V1_TO_V2.get(last_agent, last_agent)
            logger.info(f"[CLASSIFIER] Agent lock: {mapped}")
            return {
                "route_decision": "ai",
                "selected_agent": mapped,
                "routing_confidence": 0.85,
                "classification_layer": "agent_lock",
                "intent_id": "agent_lock",
            }

    # ── Layer 1: Exact match ($0, 0ms) ────────────────────────────
    # _EXACT_MATCH_MAP is populated at intent_classifier module load.
    normalized = _normalize(user_message)
    exact_hit = _EXACT_MATCH_MAP.get(normalized)
    if exact_hit:
        intent_id = exact_hit["intent_id"]
        agent = _intent_to_v2_agent(intent_id)
        capsule_intents = {
            "greeting", "navigate", "qa_readiness", "qa_load",
            "qa_today_schedule", "qa_week_schedule", "qa_streak",
            "check_in", "log_test",
        }
        is_capsule = intent_id in capsule_intents
        logger.info(f"[CLASSIFIER] Layer 1 exact match: {intent_id} → {agent} ($0)")
        return {
            "route_decision": "capsule" if is_capsule else "ai",
            "capsule_type": intent_id if is_capsule else None,
            "selected_agent": agent,
            "routing_confidence": 1.0,
            "classification_layer": "exact_match",
            "intent_id": intent_id,
        }

    # ── Layer 2: Sonnet classifier (~$0.003, ~300ms) ──────────────
    conv_summary = ""
    recent = []
    for msg in messages[-6:]:
        role = get_msg_type(msg)
        content = get_msg_content(msg)[:150]
        if role in ("human", "ai"):
            recent.append(f"{role}: {content}")
    if recent:
        conv_summary = "\n".join(recent[-4:])

    sonnet_result = await classify_with_sonnet(
        message=user_message,
        conversation_summary=conv_summary,
        active_tab=state.get("active_tab", "Chat"),
        last_agent=last_agent,
        context=context,
    )

    logger.info(
        f"[CLASSIFIER] Layer 2 Sonnet: {sonnet_result.intent} → {sonnet_result.agent} "
        f"(conf={sonnet_result.confidence:.2f}, ${sonnet_result.cost_usd:.4f})"
    )

    result = {
        "route_decision": "ai",
        "capsule_type": sonnet_result.capsule_type,
        "selected_agent": sonnet_result.agent,
        "routing_confidence": sonnet_result.confidence,
        "classification_layer": sonnet_result.classification_layer,
        "intent_id": sonnet_result.intent,
        "total_cost_usd": state.get("total_cost_usd", 0.0) + sonnet_result.cost_usd,
    }

    if sonnet_result.requires_second_agent:
        result["_secondary_agents"] = [sonnet_result.requires_second_agent]

    return result


async def _classify_sonnet(state: TomoChatState) -> dict:
    """Sonnet-based classification with exact-match fast-path."""
    t0 = time.monotonic()
    context = state.get("player_context")

    if not context:
        logger.error("classifier_node: no player_context in state")
        return {
            "route_decision": "ai",
            "selected_agent": "performance",
            "routing_confidence": 0.0,
            "classification_layer": "error",
            "intent_id": "unknown",
        }

    # Extract user message
    messages = state.get("messages", [])
    user_message = ""
    for msg in reversed(messages):
        if get_msg_type(msg) == "human":
            user_message = get_msg_content(msg)
            break

    if not user_message:
        return {
            "route_decision": "ai",
            "selected_agent": "performance",
            "routing_confidence": 0.0,
            "classification_layer": "error",
            "intent_id": "unknown",
        }

    # Check agent lock (conversation continuity) — same as v1
    last_agent = state.get("selected_agent")
    if last_agent and should_keep_agent_lock(user_message, last_agent, None):
        # Map v1 agent name to v2 if needed
        mapped_agent = _V1_TO_V2.get(last_agent, last_agent)
        elapsed = (time.monotonic() - t0) * 1000
        logger.info(f"Agent lock kept: {mapped_agent} (from {last_agent}, {elapsed:.0f}ms)")
        return {
            "route_decision": "ai",
            "selected_agent": mapped_agent,
            "routing_confidence": 0.85,
            "classification_layer": "agent_lock",
            "intent_id": "agent_lock",
        }

    # Layer 1: Exact match ($0, 0ms)
    # _EXACT_MATCH_MAP is populated at intent_classifier module load (line 274).
    # It's guaranteed to have 150+ entries when this module is imported.
    normalized = _normalize(user_message)
    exact_hit = _EXACT_MATCH_MAP.get(normalized)
    if exact_hit:
        intent_id = exact_hit["intent_id"]
        # Determine if this is capsule-eligible
        capsule_intents = {
            "greeting", "navigate", "qa_readiness", "qa_load",
            "qa_today_schedule", "qa_week_schedule", "qa_streak",
            "check_in", "log_test",
        }
        is_capsule = intent_id in capsule_intents

        # Map to v2 agent based on intent
        agent = _intent_to_v2_agent(intent_id)

        elapsed = (time.monotonic() - t0) * 1000
        logger.info(f"Exact match: {intent_id} → {agent} ({elapsed:.0f}ms)")

        return {
            "route_decision": "capsule" if is_capsule else "ai",
            "capsule_type": intent_id if is_capsule else None,
            "selected_agent": agent,
            "routing_confidence": 1.0,
            "classification_layer": "exact_match",
            "intent_id": intent_id,
        }

    # Layer 2: Sonnet classifier (~$0.003, ~300ms)
    # Build conversation summary from recent messages
    conv_summary = ""
    recent_msgs = []
    for msg in messages[-6:]:
        role = get_msg_type(msg)
        content = get_msg_content(msg)[:150]
        if role in ("human", "ai"):
            recent_msgs.append(f"{role}: {content}")
    if recent_msgs:
        conv_summary = "\n".join(recent_msgs[-4:])

    sonnet_result = await classify_with_sonnet(
        message=user_message,
        conversation_summary=conv_summary,
        active_tab=state.get("active_tab", "Chat"),
        last_agent=last_agent,
        context=context,
    )

    elapsed = (time.monotonic() - t0) * 1000
    logger.info(
        f"Sonnet classified: {sonnet_result.intent} → {sonnet_result.agent} "
        f"(conf={sonnet_result.confidence:.2f}, second={sonnet_result.requires_second_agent}, "
        f"{elapsed:.0f}ms, ${sonnet_result.cost_usd:.5f})"
    )

    result = {
        "route_decision": "ai",
        "capsule_type": sonnet_result.capsule_type,
        "selected_agent": sonnet_result.agent,
        "routing_confidence": sonnet_result.confidence,
        "classification_layer": sonnet_result.classification_layer,
        "intent_id": sonnet_result.intent,
        "total_cost_usd": state.get("total_cost_usd", 0.0) + sonnet_result.cost_usd,
    }

    # Multi-agent workflow detection
    if sonnet_result.requires_second_agent:
        result["_secondary_agents"] = [sonnet_result.requires_second_agent]

    return result


def _intent_to_v2_agent(intent_id: str) -> str:
    """Map intent IDs to v2 agent names."""
    # Performance intents
    if intent_id in (
        "qa_readiness", "qa_load", "build_session", "check_readiness",
        "load_advice", "recovery_guidance", "benchmark_comparison",
        "log_test", "test_trajectory", "program_recommendation",
        "deload_assessment", "injury_assessment", "session_modification",
        "phv_query", "show_programs", "training_readiness",
    ):
        return "performance"

    # Planning intents
    if intent_id in (
        "qa_today_schedule", "qa_week_schedule", "add_event", "view_schedule",
        "edit_event", "delete_event", "plan_week", "plan_day",
        "exam_planning", "mode_switch", "dual_load_check", "study_planning",
    ):
        return "planning"

    # Identity intents
    if intent_id in (
        "show_cv", "show_progress", "career_update", "achievement_check",
        "recruitment_query", "coachability_check", "qa_streak",
    ):
        return "identity"

    # Settings intents
    if intent_id in (
        "set_goal", "log_injury", "log_nutrition", "log_sleep",
        "update_profile", "wearable_sync", "notification_config",
        "navigate",
    ):
        return "settings"

    # Greetings → performance (warm coaching response)
    if intent_id in ("greeting", "check_in"):
        return "performance"

    # Default
    return "performance"
