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

    # ── 1. Check for active multi-step flow (continuation) ──
    # This runs BEFORE the write_confirmed short-circuit so multi-step
    # flows handle their own confirm/cancel turns. The supervisor sets
    # write_confirmed=True whenever the mobile echoes a confirmedAction
    # payload -- if we short-circuit first, the confirmation turn falls
    # through to execute_confirmed_action (agent_dispatch) instead of
    # multi_step continuation, and the "multi_step_confirm" marker tool
    # fails to resolve. The active-flow check naturally takes priority
    # because the flow state is the source of truth, not the echoed
    # confirmedAction payload.
    #
    # EXCEPTION: when scheduling_capsule is enabled, stale multi_step
    # flows for build_session / plan_training must be expired so the
    # new capsule takes over. Without this, a user who started a
    # build_session in the old multi_step flow would be stuck in it
    # for the full 60-minute TTL even after the flag is turned on.
    try:
        from app.flow.step_tracker import load_active_flow, clear_flow_state

        session_id = state.get("session_id", "")
        user_id = state.get("user_id", "")

        if session_id and user_id:
            active_flow = await load_active_flow(session_id, user_id)
            if active_flow:
                # If scheduling_capsule is now enabled and this is a
                # stale multi_step flow for an intent that should use the
                # capsule, expire it and let the registry route fresh.
                _scheduling_capsule_intents = {"build_session"}
                if active_flow.intent_id in _scheduling_capsule_intents:
                    from app.flow.patterns.scheduling_capsule import is_scheduling_capsule_enabled
                    if is_scheduling_capsule_enabled():
                        logger.info(
                            f"Flow controller: expiring stale multi_step flow "
                            f"for {active_flow.intent_id} (scheduling_capsule enabled)"
                        )
                        await clear_flow_state(session_id, user_id)
                        # Fall through to section 3 (registry lookup)
                        # which will route to scheduling_capsule.
                    else:
                        # Flag off — continue the multi_step flow normally.
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
                else:
                    # Non-scheduling multi_step flow — continue normally.
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
        import traceback as _tb
        logger.warning(f"Active flow check failed (continuing): {e}", exc_info=True)
        try:
            import asyncio as _asyncio
            from app.core.debug_logger import log_error as _log_error
            _asyncio.create_task(_log_error(
                error=str(e),
                traceback=_tb.format_exc(),
                node="flow_controller.active_flow_check",
                user_id=state.get("user_id", "-"),
                session_id=state.get("session_id", "-"),
                request_message=str(state.get("messages", ["-"])[-1])[:120],
                intent_id=state.get("intent_id", "-"),
                severity="warning",
            ))
        except Exception:
            pass

    # ── 2. Regular agent confirm path (non-multi_step writes) ──
    # After the active-flow check: if there's no active flow but the
    # supervisor injected a confirmedAction, let the route_after
    # edge send this to the agent_dispatch confirm handler.
    if state.get("write_confirmed") and state.get("pending_write_action"):
        return {}

    # ── 3. Check FLOW_REGISTRY for new intent ──
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

    elif pattern == "scheduling_capsule":
        from app.flow.patterns.scheduling_capsule import (
            is_scheduling_capsule_enabled,
            execute_scheduling_capsule,
        )
        if is_scheduling_capsule_enabled():
            result = await execute_scheduling_capsule(config, state)
        else:
            # Feature flag off: fall through to multi_step as before.
            from app.flow.patterns.multi_step import execute_multi_step_start
            result = await execute_multi_step_start(config, state)

    elif pattern == "study_scheduling_capsule":
        from app.flow.patterns.study_scheduling_capsule import execute_study_scheduling_capsule
        result = await execute_study_scheduling_capsule(config, state)

    elif pattern == "event_capsule":
        from app.flow.patterns.event_capsule import execute_event_capsule
        result = await execute_event_capsule(config, state)

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
