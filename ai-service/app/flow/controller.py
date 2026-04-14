"""
Tomo AI Service -- Flow Controller Node
LangGraph node that replaces LLM structural decisions with code-driven routing.

Sits between classifier and the rest of the graph. For each intent:
  1. Check for active multi-step flow (continuation from previous turn)
  2. Look up intent_id in FLOW_REGISTRY
  3. If found, execute the pattern handler (capsule_direct, data_display, multi_step)
  4. If not found, fall through to existing agent pipeline

The flow controller NEVER makes structural decisions with an LLM.
Code controls response structure. LLM only generates natural language text.

Feature flag: FLOW_CONTROLLER_ENABLED (default: true)
When disabled, all intents fall through to the existing pipeline.
"""

from __future__ import annotations

import logging
import os
import time

from app.models.state import TomoChatState
from app.flow.registry import get_flow_config

logger = logging.getLogger("tomo-ai.flow.controller")

# Feature flag: enable/disable the flow controller
_FLOW_CONTROLLER_ENABLED = os.environ.get("FLOW_CONTROLLER_ENABLED", "true").lower() == "true"


async def flow_controller_node(state: TomoChatState) -> dict:
    """
    LangGraph node: code-driven flow controller.

    Priority order:
      1. Skip if disabled or write-confirmed
      2. Check for active multi-step flow (cross-turn continuation)
      3. Check FLOW_REGISTRY for new intent
      4. Fall through to existing pipeline

    The routing decision is determined by route_after_flow_controller()
    based on whether _flow_pattern / route_decision was set.
    """
    t0 = time.monotonic()

    # Feature flag check
    if not _FLOW_CONTROLLER_ENABLED:
        return {}

    # Skip flow controller for confirmed write actions
    if state.get("write_confirmed") and state.get("pending_write_action"):
        return {}

    # ── 1. Check for active multi-step flow (continuation) ──
    # This runs BEFORE registry lookup so in-progress flows aren't
    # hijacked by the classifier re-classifying the user's choice.
    try:
        from app.flow.step_tracker import load_active_flow

        session_id = state.get("session_id", "")
        user_id = state.get("user_id", "")

        if session_id and user_id:
            active_flow = await load_active_flow(session_id, user_id)
            if active_flow:
                from app.flow.patterns.multi_step import execute_multi_step_continuation
                result = await execute_multi_step_continuation(active_flow, state)

                if result and result.get("_flow_pattern"):
                    elapsed = (time.monotonic() - t0) * 1000
                    logger.info(
                        f"Flow controller: multi_step continuation "
                        f"step={active_flow.current_step_index} "
                        f"({elapsed:.1f}ms)"
                    )
                    result["route_decision"] = "flow_handled"
                    return result
    except Exception as e:
        logger.warning(f"Active flow check failed (continuing): {e}")

    # ── 2. Check FLOW_REGISTRY for new intent ──
    intent_id = state.get("intent_id")
    if not intent_id:
        return {}

    config = get_flow_config(intent_id)
    if not config:
        return {}

    # Execute the pattern handler
    pattern = config.pattern

    if pattern == "capsule_direct":
        from app.flow.patterns.capsule_direct import execute_capsule_direct
        result = execute_capsule_direct(config, state)

    elif pattern == "data_display":
        from app.flow.patterns.data_display import execute_data_display
        result = await execute_data_display(config, state)

    elif pattern == "multi_step":
        from app.flow.patterns.multi_step import execute_multi_step_start
        result = await execute_multi_step_start(config, state)

    elif pattern in ("write_action", "open_coaching"):
        # Explicitly registered but handled by existing agent pipeline.
        # Fall through -- the agent_dispatch node handles these.
        return {}

    else:
        logger.warning(f"Flow controller: unknown pattern '{pattern}' for intent '{intent_id}'")
        return {}

    elapsed = (time.monotonic() - t0) * 1000

    if result and result.get("_flow_pattern"):
        logger.info(
            f"Flow controller: {intent_id} -> {pattern} "
            f"({elapsed:.1f}ms)"
        )
        result["route_decision"] = "flow_handled"
        return result

    # Pattern handler returned empty -- fall through
    return {}


def route_after_flow_controller(state: TomoChatState) -> str:
    """
    Conditional edge after flow_controller node.
    Determines next node based on whether the flow controller handled the request.

    Returns:
        "flow_handled" -- flow controller built the response, skip to format_response
        "confirm"      -- write action confirmation path
        "ai"           -- full agent pipeline (rag -> planner -> agent_dispatch)
    """
    # Flow controller handled it -- skip agent pipeline entirely
    if state.get("route_decision") == "flow_handled":
        return "flow_handled"

    # Write action confirmation
    if state.get("write_confirmed") and state.get("pending_write_action"):
        return "confirm"

    # Default: full AI pipeline
    return "ai"
