"""
Tomo AI Service — Pre-Router Node
Bridges the 3-layer intent classifier and 5-way agent router into a LangGraph node.

Flow:
  1. Extract user message from state
  2. Run classify_intent() (exact match → Haiku → fallthrough)
  3. Run route_to_agents() for agent selection
  4. Set route_decision, selected_agent, routing_confidence
  5. [SHADOW] Run Sonnet classifier in background for A/B comparison (Phase 1)

All safety guardrails removed — will be re-added as CMS-configurable rules.
PHV safety is enforced downstream in validate_node (only hard gate).
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Optional

from app.models.state import TomoChatState
from app.agents.intent_classifier import (
    classify_intent,
    ClassificationResult,
    ConversationState,
)
from app.agents.intent_registry import CAPSULE_DIRECT_ACTIONS, CAPSULE_GATED_ACTIONS
from app.agents.router import route_to_agents, should_keep_agent_lock
from app.agents.sonnet_classifier import shadow_classify_and_compare
from app.utils.message_helpers import get_msg_type, get_msg_content

logger = logging.getLogger("tomo-ai.pre_router")

# Feature flag: set CLASSIFIER_VERSION=sonnet to use Sonnet as primary (Phase 2)
# Default: shadow mode (Sonnet runs in background, Haiku+regex is primary)
_CLASSIFIER_VERSION = os.environ.get("CLASSIFIER_VERSION", "haiku")
# Shadow mode: set SONNET_SHADOW=true to enable shadow comparison logging
_SONNET_SHADOW = os.environ.get("SONNET_SHADOW", "true").lower() == "true"


async def pre_router_node(state: TomoChatState) -> dict:
    """
    Pre-router node: classifies intent + routes to agent.

    Updates state with:
      - route_decision: "capsule" | "ai"
      - capsule_type: intent capsule type (if capsule)
      - selected_agent: primary agent type
      - routing_confidence: 0.0-1.0
    """
    t0 = time.monotonic()
    context = state.get("player_context")

    if not context:
        logger.error("pre_router_node: no player_context in state")
        return {
            "route_decision": "ai",
            "selected_agent": "output",
            "routing_confidence": 0.0,
            "classification_layer": "error",
            "intent_id": "unknown",
        }

    # Extract user message from state messages
    # Uses robust helper for both LangChain objects and dict-format messages
    messages = state.get("messages", [])
    user_message = ""
    for msg in reversed(messages):
        if get_msg_type(msg) == "human":
            user_message = get_msg_content(msg)
            break

    if not user_message:
        return {
            "route_decision": "ai",
            "selected_agent": "output",
            "routing_confidence": 0.0,
            "classification_layer": "error",
            "intent_id": "unknown",
        }

    # Build conversation state from loaded history for classifier context
    conv_state = ConversationState()
    if len(messages) > 1:
        # Extract current_topic from last user message (for follow-up detection)
        for msg in reversed(messages[:-1]):
            if get_msg_type(msg) == "human":
                conv_state.current_topic = get_msg_content(msg)[:200]
                break
        # Extract last_action from last assistant response
        for msg in reversed(messages[:-1]):
            if get_msg_type(msg) == "ai":
                content_lower = get_msg_content(msg)[:300].lower()
                for action_kw in ("created", "logged", "confirmed", "updated", "scheduled"):
                    if action_kw in content_lower:
                        conv_state.last_action = action_kw
                        break
                break

    # Check agent lock (conversation continuity)
    last_agent = state.get("selected_agent")
    if last_agent and should_keep_agent_lock(user_message, last_agent, None):
        elapsed = (time.monotonic() - t0) * 1000
        logger.info(f"Agent lock kept: {last_agent} ({elapsed:.0f}ms)")
        return {
            "route_decision": "ai",
            "selected_agent": last_agent,
            "routing_confidence": 0.85,
            "classification_layer": "agent_lock",
            "intent_id": "agent_lock",
        }

    # Run 3-layer intent classifier
    classification: ClassificationResult = await classify_intent(
        user_message, conv_state, context
    )

    # Capsule fast-path DISABLED — format_response cannot generate responses
    # without agent_dispatch. All intents route through AI for proper tool
    # execution + LLM generation. Will re-enable when capsule builders exist.
    is_capsule = False
    capsule_type = classification.capsule_type  # Preserve for telemetry

    # Run 5-way agent router
    active_tab = state.get("active_tab", "Chat")
    agents = route_to_agents(user_message, active_tab, last_agent)
    primary_agent = agents[0] if agents else "output"
    secondary_agents = agents[1:] if len(agents) > 1 else []

    # Use classifier's agent_type if high confidence, else use router's
    if classification.confidence >= 0.8 and classification.agent_type:
        primary_agent = classification.agent_type

    elapsed = (time.monotonic() - t0) * 1000
    logger.info(
        f"Pre-router: intent={classification.intent_id} "
        f"(layer={classification.classification_layer}, conf={classification.confidence:.2f}) "
        f"→ agent={primary_agent} "
        f"({elapsed:.0f}ms)"
    )

    result = {
        "route_decision": "capsule" if is_capsule else "ai",
        "capsule_type": capsule_type,
        "selected_agent": primary_agent,
        "routing_confidence": classification.confidence,
        "classification_layer": classification.classification_layer,
        "intent_id": classification.intent_id,
    }

    # Store secondary agents for multi-agent tool merging
    if secondary_agents:
        result["_secondary_agents"] = secondary_agents

    # ── Shadow Sonnet Comparison (Phase 1) ──────────────────────────────
    # Runs Sonnet classifier in background without affecting production routing.
    # Logs comparison results to ai_trace_log.sonnet_shadow for A/B analysis.
    if _SONNET_SHADOW and classification.classification_layer != "agent_lock":
        # Build conversation summary from recent messages
        conv_summary = ""
        recent_msgs = []
        for msg in messages[-6:]:
            role = get_msg_type(msg)
            content = get_msg_content(msg)[:150]
            if role in ("human", "ai"):
                recent_msgs.append(f"{role}: {content}")
        if recent_msgs:
            conv_summary = "\n".join(recent_msgs[-4:])  # Last 2 turns

        # Fire-and-forget shadow comparison (do not block the pipeline)
        async def _shadow_task():
            try:
                comparison = await shadow_classify_and_compare(
                    message=user_message,
                    existing_result={
                        "agent_type": primary_agent,
                        "intent_id": classification.intent_id,
                        "confidence": classification.confidence,
                        "classification_layer": classification.classification_layer,
                    },
                    conversation_summary=conv_summary,
                    active_tab=active_tab,
                    last_agent=last_agent,
                    context=context,
                )
                # Store comparison in state for persist node to log
                # (Non-blocking — if this fails, production is unaffected)
                logger.debug(f"Shadow comparison: {comparison.get('agent_match', 'unknown')}")
            except Exception as e:
                logger.debug(f"Shadow classification skipped: {e}")

        asyncio.create_task(_shadow_task())

    return result
