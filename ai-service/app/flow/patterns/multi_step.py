"""
Tomo AI Service -- Multi-Step Flow Pattern
Code-driven step tracker for multi-turn conversations.

Every step is deterministic code. The LLM only generates headline/body text.
No structural decisions by the LLM.

Steps can:
  - Call a tool and store the result
  - Present a choice_card and wait for user selection
  - Fork based on a condition in context_carry
  - Call a write tool with a confirm_card
  - Build a session_plan card from drills

Cost: ~$0.001/step (tool calls only, no LLM for structure).
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

from app.flow.registry import FlowConfig
from app.flow.step_tracker import (
    FlowState,
    StepDefinition,
    save_flow_state,
    clear_flow_state,
)
from app.flow.helpers.scheduling import (
    extract_time_from_message,
    parse_time_from_label,
    resolve_slot,
    SlotResolution,
    DEFAULT_SESSION_DURATION_MIN,
    _to_12h as _hhmm_to_12h,
)
from app.models.state import TomoChatState

logger = logging.getLogger("tomo-ai.flow.multi_step")

# Training focus areas for the session builder
FOCUS_AREAS = [
    {"label": "Speed", "value": "speed", "description": "Sprint and acceleration work"},
    {"label": "Strength", "value": "strength", "description": "Gym and resistance training"},
    {"label": "Technical", "value": "technical", "description": "Sport-specific skills"},
    {"label": "Agility", "value": "agility", "description": "Change of direction and footwork"},
    {"label": "Endurance", "value": "endurance", "description": "Aerobic and conditioning"},
    {"label": "Recovery", "value": "recovery", "description": "Active recovery and mobility"},
]

# Synonyms mapped to a canonical focus value. Order: most specific first so
# "sprint acceleration" → speed (not endurance via "aerobic" etc.). The goal is
# to catch the athlete's stated intent from a free-text opener like
# "I want to do some technical drills tomorrow" without waiting for a
# pick_focus card.
_FOCUS_SYNONYMS: list[tuple[str, str]] = [
    # Technical
    ("technical drill", "technical"),
    ("technical", "technical"),
    ("skill work", "technical"),
    ("ball work", "technical"),
    ("ball mastery", "technical"),
    ("first touch", "technical"),
    ("passing drill", "technical"),
    ("shooting drill", "technical"),
    ("skills session", "technical"),
    ("skills", "technical"),
    # Speed
    ("acceleration", "speed"),
    ("sprint", "speed"),
    ("speed session", "speed"),
    ("speed work", "speed"),
    ("speed", "speed"),
    ("max velocity", "speed"),
    # Strength
    ("gym session", "strength"),
    ("gym", "strength"),
    ("lift", "strength"),
    ("weights", "strength"),
    ("strength", "strength"),
    ("resistance", "strength"),
    # Agility
    ("change of direction", "agility"),
    ("cod drill", "agility"),
    ("footwork", "agility"),
    ("agility", "agility"),
    # Endurance
    ("conditioning", "endurance"),
    ("aerobic", "endurance"),
    ("cardio", "endurance"),
    ("endurance", "endurance"),
    ("long run", "endurance"),
    # Recovery
    ("active recovery", "recovery"),
    ("mobility", "recovery"),
    ("recovery", "recovery"),
    ("foam roll", "recovery"),
    ("stretching", "recovery"),
]


def _extract_focus_from_message(msg: str) -> Optional[str]:
    """Best-effort parse of the user's stated training focus.

    Returns a canonical focus value (one of FOCUS_AREAS values) or None.
    Matching is substring-based on a lowered message against the ordered
    synonym list so the first (most specific) hit wins.
    """
    if not msg:
        return None
    lowered = msg.lower()
    for phrase, canonical in _FOCUS_SYNONYMS:
        if phrase in lowered:
            return canonical
    return None


def _infer_intensity(msg: str, focus: Optional[str]) -> str:
    """Best-effort intensity label from the opener + chosen focus.

    Used by the safety gate to decide whether a HARD-intensity rule
    applies. Returns "HARD" | "MODERATE" | "LIGHT" | "" (unknown).
    """
    lowered = (msg or "").lower()
    if any(k in lowered for k in ("hard", "heavy", "max", "intense", "all out", "all-out", "flat out")):
        return "HARD"
    if any(k in lowered for k in ("light", "easy", "recovery", "mobility", "chill")):
        return "LIGHT"
    if any(k in lowered for k in ("moderate", "tempo", "steady")):
        return "MODERATE"
    # Focus-derived fallback: strength/speed/technical default to HARD-ish,
    # recovery to LIGHT, endurance/agility to MODERATE.
    f = (focus or "").lower()
    if f in ("strength", "speed", "technical"):
        return "HARD"
    if f == "recovery":
        return "LIGHT"
    if f in ("endurance", "agility"):
        return "MODERATE"
    return ""


async def execute_multi_step_start(config: FlowConfig, state: TomoChatState) -> dict:
    """Start a new multi-step flow. Creates FlowState and executes step 0.

    Called when the classifier detects an intent with pattern="multi_step"
    and no active flow exists for this session.
    """
    t0 = time.monotonic()

    if not config.steps:
        logger.error("multi_step: no steps defined in FlowConfig")
        return {}

    # Create new FlowState
    flow = FlowState(
        intent_id=state.get("intent_id", ""),
        steps=config.steps,
        current_step_index=0,
    )

    # Store initial context from the user message and player context
    context = state.get("player_context")
    if context:
        flow.store("sport", getattr(context, "sport", None))
        flow.store("position", getattr(context, "position", None))
        flow.store("today_date", getattr(context, "today_date", None))
        flow.store("timezone", getattr(context, "timezone", "UTC"))
        flow.store("readiness", getattr(
            getattr(context, "snapshot_enrichment", None), "readiness_rag", None
        ))

    # Extract target date from user message if present
    target_date = _extract_date_from_message(state)
    if target_date:
        flow.store("target_date", target_date)

    # Extract stated focus from the opening message. If the user said
    # "technical drills tomorrow" we should never ask them to pick a focus
    # again, and the fork (existing sessions) should filter to matching events.
    opening_msg = _get_user_message(state)
    stated_focus = _extract_focus_from_message(opening_msg)
    if stated_focus:
        flow.store("selected_focus", stated_focus)
        flow.store("focus_was_stated", True)
        logger.info(
            f"Multi-step: focus '{stated_focus}' extracted from opener "
            f"(intent={flow.intent_id})"
        )

    # Extract stated time from the opener ("at 5 pm", "17:00", "this
    # evening"). Stored as selected_time; _present_time_picker validates
    # it against the real calendar via resolve_slot. If clean -> the
    # picker auto-advances silently. If conflict -> the athlete sees a
    # clear "5pm is taken by Endurance Session" explanation with
    # alternative slots BEFORE any drills are generated. Standardized
    # so every timeline/scheduling flow reuses the same extractor.
    stated_time = extract_time_from_message(opening_msg)
    if stated_time:
        flow.store("selected_time", stated_time)
        # stated_time_original is the user's ORIGINAL request, preserved
        # across conflict/date-shift retries. selected_time gets cleared
        # on conflict (so we don't re-match it), but stated_time_original
        # lets "Try the day after" restore the same HH:MM against the
        # next day's calendar without re-parsing the opener.
        flow.store("stated_time_original", stated_time)
        flow.store("time_was_stated", True)
        logger.info(
            f"Multi-step: time '{stated_time}' extracted from opener "
            f"(intent={flow.intent_id})"
        )

    # ── CMS-backed safety gate pre-check ──
    # Runs BEFORE any steps execute. Reads the admin-configured rules
    # from public.safety_gate_config via a 60s cache. If the gate
    # refuses the request (pain keyword, red readiness + hard, weekly
    # load cap, etc.) we short-circuit with the admin's block copy
    # and do not persist any flow state.
    try:
        from app.services import safety_gate as safety_gate_service

        gate_verdict = await safety_gate_service.evaluate(
            user_message=opening_msg or "",
            intent_id=flow.intent_id,
            context=context,
            requested_intensity=_infer_intensity(opening_msg, stated_focus),
        )
        if not gate_verdict.allow:
            logger.info(
                f"safety_gate: blocked intent={flow.intent_id} "
                f"rule={gate_verdict.rule} -> {gate_verdict.suggested_intensity}"
            )
            # Fire-and-forget escalation to athlete notification center for
            # genuinely critical rules (pain / red_block). Never blocks chat.
            try:
                from app.services.notification_escalator import escalate_safety_block
                escalate_safety_block(
                    athlete_id=getattr(context, "user_id", None) if context else None,
                    rule=gate_verdict.rule,
                    block_message=gate_verdict.message,
                    intent_id=flow.intent_id,
                )
            except Exception as esc_err:
                logger.warning(f"safety_gate: escalation hook failed: {esc_err}")

            block = safety_gate_service.build_block_response(gate_verdict)
            return {
                "final_response": json.dumps(block),
                "final_cards": block.get("cards", []),
                "_flow_pattern": "multi_step",
                "_safety_gate_triggered": True,
                "_safety_gate_rule": gate_verdict.rule,
                "route_decision": "flow_handled",
                "total_cost_usd": 0.0,
                "total_tokens": 0,
            }
    except Exception as e:
        # Never let the gate crash the flow -- degrade to allow.
        logger.error(f"safety_gate: pre-check failed, allowing: {e}", exc_info=True)

    # Execute step 0 (and possibly auto-advance through tool/fork steps)
    result = await _execute_current_step(flow, state)

    elapsed = (time.monotonic() - t0) * 1000
    logger.info(
        f"Multi-step start: {flow.intent_id} step={flow.current_step_index} "
        f"({elapsed:.0f}ms)"
    )
    return result


async def execute_multi_step_continuation(flow: FlowState, state: TomoChatState) -> dict:
    """Continue an active multi-step flow with the user's response.

    Called when there's an active FlowState and the user sends a message
    (typically a choice selection or confirmation).
    """
    t0 = time.monotonic()

    # Get the user's message
    user_message = _get_user_message(state)

    # Check for explicit cancel
    if user_message.lower().strip() in ("cancel", "nevermind", "stop", "no"):
        await clear_flow_state(
            state.get("session_id", ""),
            state.get("user_id", ""),
        )
        return _build_cancel_response()

    # ── Mid-flow drill detail question (Layer C1) ──
    # Athletes reviewing a session_plan often ask "show me drill details
    # for X" or "what is the Y drill". Before the restart signal or any
    # step-specific handling, try to answer the question inline using
    # the drill data we already fetched for session_drills. This keeps
    # the flow state intact so they can continue confirming.
    drill_hit = _detect_drill_question(user_message, flow)
    if drill_hit:
        logger.info(
            f"Multi-step: inline drill-detail question for "
            f"{drill_hit.get('name', '?')!r}, preserving flow state"
        )
        return await _build_drill_detail_response(flow, state, drill_hit)

    # ── Mid-flow restart signal ──
    # If the athlete sends something that is clearly a greeting or the
    # start of a totally new conversation (not a response to the current
    # step), clear the flow and let the main classifier handle it fresh.
    # Without this, "Hey tomo" sent while a fork is pending re-serves the
    # same fork card, producing the loop the user saw in prod.
    if _is_restart_signal(user_message, flow):
        logger.info(
            f"Multi-step: restart signal detected ({user_message!r}), "
            f"clearing flow {flow.intent_id}"
        )
        await clear_flow_state(
            state.get("session_id", ""),
            state.get("user_id", ""),
        )
        # Return empty dict so the flow_controller falls through to the
        # normal classifier pipeline. The user's message is classified
        # as a fresh turn.
        return {}

    # Process user response for the current step
    current = flow.current_step
    if not current:
        return {}  # Flow complete, fall through

    # ── Mid-flow date-change detector ──
    # If the athlete drops a date anywhere in the flow ("I want it for
    # tomorrow", "make it Wednesday"), we re-extract, update target_date,
    # clear the stale calendar snapshot, and rewind to check_calendar so
    # the fork/session_plan/confirm are rebuilt for the new date.
    #
    # Skipped when current step IS pick_date — that step has its own
    # handler below which stores the selection explicitly.
    if current.id != "pick_date":
        new_date = _extract_date_from_message(state)
        current_target = flow.get("target_date")
        if new_date and new_date != current_target:
            logger.info(
                f"Multi-step: mid-flow date change "
                f"{current_target!r} -> {new_date!r} (rewinding to check_calendar)"
            )
            flow.store("target_date", new_date)
            # Wipe stale calendar snapshot + fork state so they rebuild
            flow.store("step_check_calendar_result", None)
            flow.store("step_fork_fork", None)
            flow.store("fork_choice", None)
            flow.store("target_event_id", None)
            flow.store("calendar_empty", None)
            # Rewind the step index to check_calendar so the flow
            # re-runs get_today_events + fork against the new date.
            # steps are plain dicts (FlowConfig.steps from registry.py),
            # so use dict access, not attribute access.
            for i, s in enumerate(flow.steps):
                step_id = s.get("id") if isinstance(s, dict) else getattr(s, "id", None)
                if step_id == "check_calendar":
                    flow.current_step_index = i
                    break
            result = await _execute_current_step(flow, state)
            return result

    # ── Check if user is responding to a pending fork choice ──
    # The fork step auto-advances past itself and presents a choice card,
    # but the current step is now pick_focus. We need to check if the user
    # is still answering the fork before we try pick_focus matching.
    fork_data = flow.get("step_fork_fork", {})
    pending_fork = isinstance(fork_data, dict) and fork_data.get("needs_choice") and not flow.get("fork_choice")

    if pending_fork:
        selection = _match_selection(user_message, flow)
        if selection:
            flow.store("fork_choice", selection)
            # If they picked an existing event, store the event_id
            if selection != "new":
                flow.store("target_event_id", selection)
            # Don't advance -- current step (pick_focus) still needs to present
            result = await _execute_current_step(flow, state)
            return result
        else:
            # Couldn't match fork choice -- re-present fork options
            return await _present_fork_choice(flow, fork_data, state)

    # ── Handle safety_gate response ──
    if current.card == "safety_gate":
        lower = user_message.lower().strip()
        # Recovery route
        if "recovery" in lower or "light" in lower or "rest" in lower:
            flow.store("selected_focus", "recovery")
            flow.store("focus_was_stated", True)
            flow.store("readiness_override_accepted", True)  # unblocks the gate
            flow.advance()
        # Override ("build anyway" / "yes" / "proceed")
        elif (
            "override" in lower or "anyway" in lower or "build anyway" in lower
            or "push" in lower or _is_confirmation(user_message)
        ):
            flow.store("readiness_override_accepted", True)
            flow.advance()
        # Cancel
        elif _is_rejection(user_message):
            await clear_flow_state(
                state.get("session_id", ""),
                state.get("user_id", ""),
            )
            return _build_cancel_response()
        else:
            # Couldn't match -- re-present the gate
            gate_data = flow.get("readiness_gate_data", {}) or {}
            return await _present_safety_gate(flow, gate_data, state)

    # ── Handle user selection for choice steps ──
    elif current.card == "choice_card":
        # pick_date: parse the athlete's date selection via the date
        # extractor (handles "Today"/"Tomorrow"/"Wednesday"/free-text).
        if current.id == "pick_date":
            picked = _extract_date_from_message(state)
            if picked:
                flow.store("target_date", picked)
                flow.advance()
            else:
                return await _present_date_picker(flow, state)
        # pick_week (legacy text path — the capsule branch below handles
        # the normal submit flow). Kept for voice/text fallback if someone
        # types "next week" instead of tapping the capsule.
        elif current.id == "pick_week":
            week_start = _resolve_week_start_from_message(user_message, flow)
            if week_start:
                flow.store("week_start", week_start)
                # Preserve the prior athlete_mode if already set, else default.
                if not flow.get("athlete_mode"):
                    flow.store("athlete_mode", "balanced")
                flow.advance()
            else:
                return await _present_week_scope_capsule(flow, state)
        # If this is pick_focus and the athlete already stated a focus
        # upfront, we should never be standing on this step in the first
        # place. Skip it silently and let _execute_current_step auto-advance.
        elif current.id == "pick_focus" and flow.get("selected_focus"):
            flow.advance()
        else:
            selection = _match_selection(user_message, flow)
            if selection:
                flow.store(f"step_{current.id}_selection", selection)
                if current.id == "pick_focus":
                    flow.store("selected_focus", selection)
                # Fork step: record the choice (existing event_id or "new")
                if current.id == "fork":
                    flow.store("fork_choice", selection)
                    if selection != "new":
                        flow.store("target_event_id", selection)
                flow.advance()
            else:
                # User said something that doesn't match options -- re-present
                return await _present_step(flow, state)

    # ── Handle time picker response ──
    elif current.card == "time_picker":
        # Attaching to an existing event -- no time needed, just advance
        # so the fallthrough to _execute_current_step lands on confirm.
        if flow.get("target_event_id"):
            flow.advance()
        else:
            msg_lower = user_message.lower().strip()

            # ── "Try the day after" pill ──
            # Bump target_date by +1 day, restore the athlete's ORIGINAL
            # requested time (e.g. 5 PM), wipe the stale calendar snapshot
            # + fork state, and rewind to check_calendar so the whole
            # conflict-check re-runs against the new day. If 5 PM is
            # clean on day+1 the flow auto-advances; if it's also taken,
            # the athlete sees a fresh choice_card for that new day.
            day_after_signals = (
                "__try_day_after__",
                "try the day after",
                "day after",
                "next day",
                "the day after",
            )
            if any(sig in msg_lower for sig in day_after_signals):
                current_target = flow.get("target_date") or ""
                new_date = _shift_date_by_days(current_target, 1)
                if new_date:
                    logger.info(
                        f"pick_time: day-after pill tapped, bumping "
                        f"{current_target!r} -> {new_date!r} and retrying "
                        f"stated_time_original="
                        f"{flow.get('stated_time_original')!r}"
                    )
                    flow.store("target_date", new_date)
                    # Restore original requested time so the day+1 path
                    # re-validates the same slot the athlete actually
                    # wanted, not whatever chip they last tapped.
                    original = flow.get("stated_time_original")
                    if original:
                        flow.store("selected_time", original)
                    # Wipe stale day-specific state so the flow rebuilds
                    # calendar + fork + alternatives for the new day.
                    flow.store("step_check_calendar_result", None)
                    flow.store("step_fork_fork", None)
                    flow.store("fork_choice", None)
                    flow.store("target_event_id", None)
                    flow.store("calendar_empty", None)
                    flow.store("pending_slot_options", None)
                    # Rewind to check_calendar so get_today_events runs
                    # against the new date before pick_time re-resolves.
                    for i, s in enumerate(flow.steps):
                        if s.id == "check_calendar":
                            flow.current_step_index = i
                            break
                    return await _execute_current_step(flow, state)

            # ── Match tapped slot label against pending options ──
            # Mobile sends the option label verbatim (e.g. "6:00 PM -
            # 7:15 PM"). Deterministic match on the stored list is
            # more reliable than regex parsing the label every time.
            pending = flow.get("pending_slot_options") or []
            selected_time = None
            if isinstance(pending, list):
                for opt in pending:
                    label = (opt.get("label") or "").lower().strip()
                    if label and label == msg_lower:
                        selected_time = opt.get("value")
                        break
                if not selected_time:
                    for opt in pending:
                        label = (opt.get("label") or "").lower().strip()
                        if label and label in msg_lower:
                            selected_time = opt.get("value")
                            break

            # Fall back to structured time parsing (handles free-text
            # "7 pm", "17:30", etc.)
            if not selected_time:
                selected_time = _match_time(user_message)

            if selected_time:
                flow.store("selected_time", selected_time)
                flow.store("pending_slot_options", None)
                flow.advance()
            else:
                return await _present_time_picker(flow, state)

    # ── Week planner capsule responses ──
    # Mobile submits capsule actions through the same pipeline used by
    # every confirm flow: TS proxy → confirmed_action → supervisor stores
    # it under state["pending_write_action"]. Our `_extract_capsule_payload`
    # helper pulls from that exact key. Parse → store on flow state →
    # advance. Falls back to re-presenting the same card if the payload
    # is malformed.
    elif current.card == "week_scope_capsule":
        submitted = _extract_capsule_payload(state)
        resolution = _coerce_week_scope(submitted, flow)
        if resolution is not None:
            flow.store("week_start", resolution["week_start"])
            flow.store("athlete_mode", resolution["athlete_mode"])
            flow.advance()
        else:
            return await _present_week_scope_capsule(flow, state)

    elif current.card == "training_mix_capsule":
        submitted = _extract_capsule_payload(state)
        mix = _coerce_training_mix(submitted)
        if mix is not None:
            flow.store("training_mix", mix)
            flow.advance()
        else:
            return await _present_training_mix_capsule(flow, state)

    elif current.card == "study_plan_capsule":
        submitted = _extract_capsule_payload(state)
        mix = _coerce_study_mix(submitted)
        if mix is not None:
            flow.store("study_mix", mix)
            flow.advance()
        else:
            return await _present_study_plan_capsule(flow, state)

    elif current.card == "week_plan_preview_capsule":
        # Two interactions on this card:
        #   1. Edit a single session inline — mobile posts edit payload,
        #      we validate via /validate-edit and mutate draft_plan_items,
        #      then re-render. The card stays up.
        #   2. Accept → run the commit bridge directly (no second confirm
        #      card — the preview IS the confirm UI). Flow completes.
        submitted = _extract_capsule_payload(state)
        action = (submitted or {}).get("action") or ""
        if action == "edit_item":
            edit_result = await _apply_draft_edit(flow, state, submitted)
            if not edit_result.get("ok"):
                flow.store("draft_edit_error", edit_result.get("message", "Edit rejected."))
            return await _present_week_plan_preview_capsule(flow, state)
        if action == "accept" or _is_confirmation(user_message):
            confirm_result = await _execute_confirm_tool(flow, state)
            flow.store("confirm_result", confirm_result)
            flow.advance()  # no more steps → _execute_current_step builds completion
        elif _is_rejection(user_message):
            await clear_flow_state(
                state.get("session_id", ""),
                state.get("user_id", ""),
            )
            return _build_cancel_response()
        else:
            return await _present_week_plan_preview_capsule(flow, state)

    # ── Handle confirmation step: actually EXECUTE the write tool ──
    elif current.card == "confirm_card":
        if _is_confirmation(user_message):
            confirm_result = await _execute_confirm_tool(flow, state)
            flow.store("confirm_result", confirm_result)
            flow.advance()
        elif _is_rejection(user_message):
            await clear_flow_state(
                state.get("session_id", ""),
                state.get("user_id", ""),
            )
            return _build_cancel_response()
        else:
            return await _present_confirm(flow, state)

    # Execute from current step forward
    result = await _execute_current_step(flow, state)

    elapsed = (time.monotonic() - t0) * 1000
    logger.info(
        f"Multi-step continue: {flow.intent_id} step={flow.current_step_index} "
        f"({elapsed:.0f}ms)"
    )
    return result


async def _execute_current_step(flow: FlowState, state: TomoChatState) -> dict:
    """Execute the current step and auto-advance through tool/fork steps.

    Stops when:
      - A choice_card / confirm_card / safety_gate / time_picker needs user input
      - The flow is complete
      - An error occurs
    """
    max_auto_advance = 8  # Safety limit (extended for new step types)

    for _ in range(max_auto_advance):
        step = flow.current_step
        if not step:
            # Flow complete -- build completion response then clear state
            response = _build_completion_response(flow)
            await clear_flow_state(
                state.get("session_id", ""),
                state.get("user_id", ""),
            )
            return response

        # ── Safety gate: deterministic readiness / ACWR check ──
        # No LLM, no tool call. Pure context read. Blocks high-intensity
        # drill building when RED readiness or ACWR > 1.5, unless the
        # athlete has already explicitly selected recovery focus.
        # Gated behind FLOW_READINESS_GATE_ENABLED (default off) so we
        # can iterate on the guardrail UX without a redeploy.
        if step.card == "safety_gate":
            if not _FLOW_READINESS_GATE_ENABLED:
                flow.advance()
                continue
            gate = _evaluate_readiness_gate(flow, state)
            if gate.get("block") and not flow.get("readiness_override_accepted"):
                flow.store("readiness_gate_data", gate)
                return await _present_safety_gate(flow, gate, state)
            flow.advance()
            continue

        # ── Tool step (tool only, no card): call tool, store, advance ──
        if step.tool and not step.card:
            tool_result = await _call_step_tool(step, flow, state)
            if tool_result is None:
                return _build_error_response(step)
            flow.store(f"step_{step.id}_result", tool_result)
            flow.advance()
            continue

        # ── Fork step (condition + choice_card): evaluate and present ──
        # The fork evaluator now ALWAYS returns the scheduled events as
        # options when any exist; the pre-filter that auto-skipped the
        # fork based on stated focus has been removed so athletes always
        # see what's on their calendar before Tomo creates anything new.
        if step.condition and step.card == "choice_card":
            # Skip fork entirely if we already recorded a fork_choice
            # earlier in this conversation turn.
            if flow.get("fork_choice"):
                flow.advance()
                continue

            fork_result = _evaluate_fork(step, flow)
            flow.store(f"step_{step.id}_fork", fork_result)

            # Empty calendar → auto-advance silently; build_drills card
            # will carry the "Tomorrow's open — building fresh" message
            # via flow_context. Trust the fork evaluator's own
            # `calendar_empty` signal (don't hard-code True — the calendar
            # may have events that simply don't match the stated focus).
            if not fork_result.get("needs_choice"):
                flow.store("fork_choice", fork_result.get("choice", "new"))
                flow.store("calendar_empty", bool(fork_result.get("calendar_empty", False)))
                flow.advance()
                continue

            return await _present_fork_choice(flow, fork_result, state)

        # ── pick_date: ask "when?" when the opener had no date ──
        # Auto-skips when target_date was extracted from the opener
        # ("for tomorrow", "Wednesday"). Presents dynamic date options
        # when the athlete said "create a training session" without a date.
        if step.card == "choice_card" and step.id == "pick_date":
            if flow.get("target_date"):
                flow.advance()
                continue
            return await _present_date_picker(flow, state)

        # ── pick_week (week planner): render the week + mode capsule ──
        if step.card == "week_scope_capsule":
            if flow.get("week_start") and flow.get("athlete_mode"):
                flow.advance()
                continue
            return await _present_week_scope_capsule(flow, state)

        # ── Regular choice card (pick_focus) ──
        if step.card == "choice_card":
            if step.id == "pick_focus" and flow.get("selected_focus"):
                logger.info(
                    f"Multi-step: skipping pick_focus, selected_focus="
                    f"{flow.get('selected_focus')}"
                )
                flow.advance()
                continue
            return await _present_step(flow, state)

        # ── Session plan card ──
        if step.card == "session_plan":
            return await _build_session_step(step, flow, state)

        # ── Time picker (slot-first ordering, Apr 15 2026) ──
        # Runs BEFORE build_drills so no drills are generated until the
        # slot is locked. When attaching drills to an existing calendar
        # event we skip entirely (the event already carries a time).
        # Otherwise we always delegate to _present_time_picker, which
        # internally:
        #   - auto-advances if the opener stated a time AND it's clean
        #   - presents alternatives + conflict message if the stated
        #     time overlaps an existing event
        #   - presents the normal suggest-slots picker if no time stated
        if step.card == "time_picker":
            if flow.get("target_event_id"):
                flow.advance()
                continue
            return await _present_time_picker(flow, state)

        # ── Confirm card ──
        if step.card == "confirm_card":
            return await _present_confirm(flow, state)

        # ── Week planner card types ──
        if step.card == "training_mix_capsule":
            if step.id == "pick_training_mix" and flow.get("training_mix"):
                flow.advance()
                continue
            return await _present_training_mix_capsule(flow, state)

        if step.card == "study_plan_capsule":
            if step.id == "pick_study_plan" and flow.get("study_mix"):
                flow.advance()
                continue
            return await _present_study_plan_capsule(flow, state)

        if step.card == "week_plan_preview_capsule":
            return await _present_week_plan_preview_capsule(flow, state)

        # Unknown step type -- skip
        logger.warning(f"Unknown step type: {step}")
        flow.advance()

    logger.error("Multi-step: hit auto-advance safety limit")
    return {}


async def _call_step_tool(step: StepDefinition, flow: FlowState, state: TomoChatState) -> dict | None:
    """Call a tool for a step, passing args from context_carry."""
    user_id = state.get("user_id")
    context = state.get("player_context")
    if not user_id or not context:
        return None

    tool_name = step.tool
    tool_args = {}

    # Build tool args from context_carry
    if step.tool_args_from:
        for arg_name, carry_key in step.tool_args_from.items():
            tool_args[arg_name] = flow.get(carry_key, "")

    # ── Week-plan bridge calls — no LangChain tool, hit the TS endpoint
    # directly. Lives here (not inside a LangChain @tool) because these
    # endpoints are owned by the planner flow, not by any agent's toolbox.
    if tool_name == "get_week_plan_suggestions":
        return await _fetch_week_plan_suggestions(flow, user_id)
    if tool_name == "build_week_plan_draft":
        return await _fetch_week_plan_draft(flow, user_id)

    try:
        if tool_name in ("get_today_events",):
            from app.agents.tools.timeline_tools import make_timeline_tools
            tools = make_timeline_tools(user_id, context)
        elif tool_name in ("get_training_session",):
            from app.agents.tools.output_tools import make_output_tools
            tools = make_output_tools(user_id, context)
        else:
            logger.error(f"Unknown tool for multi_step: {tool_name}")
            return None

        target = next((t for t in tools if t.name == tool_name), None)
        if not target:
            return None

        result = await target.ainvoke(tool_args)
        return result

    except Exception as e:
        logger.error(f"Multi-step tool call failed: {e}", exc_info=True)
        return None


# ── Week-plan helpers ───────────────────────────────────────────────────────
# Thin bridges to the TS endpoints under /api/v1/week-plan. Kept inline so
# the multi_step flow owns its own side effects — no LangChain tool wiring.

async def _fetch_week_plan_suggestions(flow: FlowState, user_id: str) -> dict | None:
    """GET /api/v1/week-plan/suggest — seed training/study mix defaults."""
    from app.agents.tools.bridge import bridge_get
    week_start = flow.get("week_start") or ""
    if not week_start:
        return None
    result = await bridge_get(
        "/api/v1/week-plan/suggest",
        params={"weekStart": week_start},
        user_id=user_id,
    )
    if isinstance(result, dict) and not result.get("error"):
        # Stash the suggestions on context_carry so the pickers use them.
        flow.store("suggested_training_mix", result.get("trainingMix", []))
        flow.store("suggested_study_mix", result.get("studyMix", []))
        flow.store("suggestion_notes", result.get("notes", []))
        flow.store("suggestion_source", result.get("source", ""))
    return result


async def _fetch_week_plan_draft(flow: FlowState, user_id: str) -> dict | None:
    """POST /api/v1/week-plan/draft — run the deterministic builder."""
    from app.agents.tools.bridge import bridge_post
    payload = {
        "weekStart": flow.get("week_start", ""),
        "timezone": flow.get("timezone", "UTC"),
        "trainingMix": flow.get("training_mix", []),
        "studyMix": flow.get("study_mix", []),
        # Mode scopes the plan (affects maxHardPerWeek etc.) — doesn't
        # persist as the athlete's global mode. The builder applies it
        # via scenarioMaxHard (weekPlanBuilder.ts).
        "modeId": flow.get("athlete_mode", "balanced"),
    }
    result = await bridge_post(
        "/api/v1/week-plan/draft",
        payload,
        user_id=user_id,
    )
    if isinstance(result, dict) and not result.get("error"):
        flow.store("draft_plan_items", result.get("planItems", []))
        flow.store("draft_summary", result.get("summary", {}))
        flow.store("draft_warnings", result.get("warnings", []))
    return result


def _event_matches_focus(event: dict, focus: str) -> bool:
    """Does a calendar event match the athlete's stated training focus?

    Checks event title/category against focus synonyms. Used so the fork
    only offers existing sessions that actually line up with what the
    athlete asked for.
    """
    if not focus:
        return True
    hay = " ".join([
        str(event.get("title", "")),
        str(event.get("category", "")),
        str(event.get("subtype", "")),
        str(event.get("notes", "")),
    ]).lower()
    if focus in hay:
        return True
    # Check focus synonyms
    for phrase, canonical in _FOCUS_SYNONYMS:
        if canonical == focus and phrase in hay:
            return True
    return False


def _evaluate_fork(step: StepDefinition, flow: FlowState) -> dict:
    """Evaluate a fork condition against context_carry data.

    Filters existing training events by the athlete's stated focus AND
    time proximity to the stated time before offering attach options.
    Mismatched focus (sprint drills into an endurance session) or very
    different time (user asked 5pm, event at 9am) should never appear
    as attach targets -- we auto-advance to the fresh-session path in
    that case, matching what a coach would do.

    Regression context: April 2026 rearchitecture dropped the focus
    filter entirely, which meant "build me a sprint session at 5pm"
    landed on a fork offering "Add drills to Endurance Session at 6pm".
    F5 in AI_CHAT_AUDIT_2026-04-15.md. Filter restored Phase 5 patch.
    """
    condition = step.condition

    if condition == "existing_training_sessions":
        events_result = flow.get("step_check_calendar_result", {})
        events = events_result.get("events", [])
        training_events = [
            e for e in events
            if e.get("event_type") in ("training", "match")
        ]

        # Filter by stated focus + time proximity. If the user said
        # nothing about either (stated_focus / selected_time empty) the
        # corresponding filter is a no-op, preserving the generic
        # "pick any session" UX for vague asks.
        stated_focus = (flow.get("selected_focus") or "").lower().strip()
        selected_time = (flow.get("selected_time") or "").strip()

        def _hhmm_to_minutes(hhmm: str) -> int | None:
            """Parse HH:MM (24h) to minutes since midnight. None on failure."""
            import re
            m = re.match(r"^(\d{1,2}):(\d{2})", hhmm or "")
            if not m:
                return None
            try:
                return int(m.group(1)) * 60 + int(m.group(2))
            except (TypeError, ValueError):
                return None

        selected_min = _hhmm_to_minutes(selected_time) if selected_time else None

        def _keep(ev: dict) -> bool:
            # Focus match -- skip events whose title/category/notes don't
            # line up with what the athlete asked for. Sprint drills into
            # an endurance session is a category error, not a merge.
            if stated_focus and not _event_matches_focus(ev, stated_focus):
                return False
            # Time proximity -- only offer events within +/- 90 minutes
            # of the stated time. Outside that window the user would be
            # attaching to an unrelated slot.
            if selected_min is not None:
                ev_hhmm = ""
                import re
                m = re.search(r"(\d{2}:\d{2})", str(ev.get("start_time", "")))
                if m:
                    ev_hhmm = m.group(1)
                ev_min = _hhmm_to_minutes(ev_hhmm) if ev_hhmm else None
                if ev_min is not None and abs(ev_min - selected_min) > 90:
                    return False
            return True

        matching_events = [e for e in training_events if _keep(e)]

        if matching_events:
            options = []
            for ev in matching_events:
                title = ev.get("title", "Session")
                time_str = _extract_time(ev.get("start_time", ""))
                time_suffix = f" at {time_str}" if time_str else ""
                options.append({
                    "label": f"Add drills to {title}{time_suffix}",
                    "value": str(ev.get("id", "")),  # str() — DB returns uuid.UUID, not JSON serializable
                    "description": f"Attach the drill list to your {title.lower()}",
                })
            options.append({
                "label": "Book a new session instead",
                "value": "new",
                "description": "Create a brand new training slot",
            })
            return {"needs_choice": True, "options": options}

        # Either the calendar is genuinely empty OR every existing
        # event was filtered out by focus/time mismatch. Both collapse
        # to the same UX: skip the fork, go straight to build a fresh
        # session. We flag `calendar_empty` only when it's literally
        # empty so build_drills can still render the "day is open"
        # framing for that case.
        return {
            "needs_choice": False,
            "choice": "new",
            "calendar_empty": len(training_events) == 0,
        }

    return {"needs_choice": False}


async def _warm_text(
    step_kind: str,
    flow_context: dict,
    state: TomoChatState,
    fallback_headline: str,
    fallback_body: str = "",
    rag_context: str = "",
) -> tuple[str, str]:
    """Try to generate a warm headline/body via Haiku. Fall back to static
    text on any failure, disabled flag, or timeout. Always returns a tuple.

    Optionally grounds the text in `rag_context` (sports-science chunks) for
    session_plan and confirm step kinds. RAG is fire-and-forget: if it's
    empty the call behaves identically to the pre-RAG path.
    """
    context = state.get("player_context")
    try:
        from app.flow.patterns.text_generator import generate_flow_step_text
        result = await generate_flow_step_text(
            step_kind=step_kind,
            flow_context=flow_context,
            player_name=getattr(context, "name", "") or "",
            sport=getattr(context, "sport", "") or "",
            position=getattr(context, "position", "") or "",
            age_band=getattr(context, "age_band", "") or "",
            rag_context=rag_context,
        )
    except Exception as e:
        logger.debug(f"Warm text helper failed: {e}")
        result = None

    if result and result.get("headline"):
        return result["headline"], result.get("body", "") or fallback_body
    return fallback_headline, fallback_body


# ── RAG retrieval for build_session flow ────────────────────────────
# Gated behind FLOW_RAG_ENABLED so we can kill-switch without a redeploy.
import os as _os

_FLOW_RAG_ENABLED = _os.environ.get("FLOW_RAG_ENABLED", "true").lower() == "true"
# Timeout budget for the RAG retrieval step inside the build_session flow.
# Default 3.5s -- measured cold-start on Railway is ~2970ms (Voyage+Cohere
# TLS/DNS warmup on first container call), warm ~1800ms. 3.5s gives a safety
# margin above cold without letting a stalled Voyage/Cohere call block the
# flow indefinitely. Overridable via FLOW_RAG_TIMEOUT_S env var for hot-fix
# tuning without a code push.
try:
    _FLOW_RAG_TIMEOUT_S = float(_os.environ.get("FLOW_RAG_TIMEOUT_S", "3.5"))
except (TypeError, ValueError):
    _FLOW_RAG_TIMEOUT_S = 3.5

# Readiness safety gate: deterministic block on RED / ACWR>1.5 with a
# recovery-first card. Temporarily bypassed by default (April 2026) while
# we iterate on the guardrail UX; flip this env to "true" to re-enable
# without a code change.
_FLOW_READINESS_GATE_ENABLED = _os.environ.get("FLOW_READINESS_GATE_ENABLED", "false").lower() == "true"


async def _retrieve_session_rag(
    focus: str,
    state: TomoChatState,
) -> tuple[str, dict]:
    """Fetch sports-science chunks scoped to the session focus + context.

    Returns `(formatted_text, metadata_dict)`. Metadata keys match the
    shape emitted by the graph's rag_retrieval node so that
    `observability.build_post_execution_metadata` and the `ai_trace_log`
    writer see the same fields whether RAG ran on the graph path or the
    flow path -- no conditional handling downstream.

    metadata_dict keys:
        entity_count, chunk_count, graph_hops, sub_questions,
        retrieval_cost_usd, latency_ms

    On disabled / missing context / timeout / exception the metadata is
    still returned with every field zeroed, plus a `skipped` or `error`
    discriminator so traces can distinguish "retrieval ran but returned
    empty" from "retrieval was skipped" from "retrieval failed."

    Never raises -- callers must always have a deterministic fallback.

    Uses the shared `_reformulate_query` helper from rag_retrieval.py so
    there's a single source of truth for how build_session queries are
    expanded (enforces intent registry -> query rule once).
    """
    empty_meta: dict = {
        "entity_count": 0,
        "chunk_count": 0,
        "graph_hops": 0,
        "sub_questions": 0,
        "retrieval_cost_usd": 0.0,
        "latency_ms": 0.0,
    }

    if not _FLOW_RAG_ENABLED:
        return "", {**empty_meta, "skipped": True, "reason": "flag_disabled"}
    if not focus:
        focus = "general"  # retrieve anyway -- any grounding is better than none

    context = state.get("player_context")
    if not context:
        return "", {**empty_meta, "skipped": True, "reason": "no_player_context"}

    import asyncio
    try:
        import time as _time
        from app.graph.nodes.rag_retrieval import _reformulate_query
        from app.rag.retriever import retrieve

        sport = (getattr(context, "sport", "") or "").strip()
        position = (getattr(context, "position", "") or "").strip()
        age_band = (getattr(context, "age_band", "") or "").strip()

        # Natural-language base message -- _reformulate_query then layers
        # on the build_session domain expansion + sport context.
        base_msg = " ".join(
            p for p in [f"{focus} session drills", sport, position, age_band] if p
        )
        query = _reformulate_query(base_msg, "build_session", context)

        t0 = _time.monotonic()
        result = await asyncio.wait_for(
            retrieve(query=query, player_context=context, top_k=4),
            timeout=_FLOW_RAG_TIMEOUT_S,
        )
        elapsed_ms = (_time.monotonic() - t0) * 1000

        chunk_count = getattr(result, "chunk_count", 0)
        entity_count = getattr(result, "entity_count", 0)
        graph_hops = getattr(result, "graph_hops", 0)
        sub_questions = getattr(result, "sub_questions", 0)
        cost = getattr(result, "retrieval_cost_usd", 0.0)

        logger.info(
            f"build_session rag chunks={chunk_count} "
            f"cost=${cost:.5f} latency={elapsed_ms:.0f}ms focus={focus}"
        )

        return getattr(result, "formatted_text", "") or "", {
            "entity_count": entity_count,
            "chunk_count": chunk_count,
            "graph_hops": graph_hops,
            "sub_questions": sub_questions,
            "retrieval_cost_usd": cost,
            "latency_ms": elapsed_ms,
        }

    except asyncio.TimeoutError:
        elapsed_ms = _FLOW_RAG_TIMEOUT_S * 1000
        logger.warning(
            f"build_session rag timeout "
            f"(>{_FLOW_RAG_TIMEOUT_S}s) focus={focus} -- proceeding without RAG"
        )
        return "", {**empty_meta, "latency_ms": elapsed_ms, "error": "timeout"}
    except Exception as e:
        logger.warning(
            f"build_session rag failed focus={focus}: {e} -- proceeding without RAG"
        )
        return "", {**empty_meta, "error": str(e)[:200]}


# ── Phase 5: Auto-link prescribed programs on build_session confirm ─
# Pull the athlete's position_training_matrix row at build time and
# forward the slug list to the backend create_event endpoint. The
# backend resolves slug -> training_programs.id and inserts
# event_linked_programs rows with linked_by='tomo' in the same request
# as the event insert. ai-service stays UUID-agnostic.
#
# Gated behind FLOW_AUTO_LINK_ENABLED -- kill-switch without redeploy.
# Fail-open: any exception returns an empty list and the event still
# writes without links (matches calendarLinkedProgramsHelper.ts read
# path fail-open convention).

_FLOW_AUTO_LINK_ENABLED = _os.environ.get("FLOW_AUTO_LINK_ENABLED", "true").lower() == "true"
_AUTO_LINK_MAX_SLUGS = 5


async def _resolve_program_slugs_for_session(
    focus: str,
    state: TomoChatState,
) -> list[str]:
    """Return up to 5 program slugs to auto-link at confirm time.

    Strategy:
      1. Look up position_training_matrix by (sport_id, position),
         falling back to position='ALL' if the athlete's position is
         missing from the matrix.
      2. Union mandatory_programs + recommended_programs (jsonb arrays
         of slug strings), ordered dedupe with mandatory first.
      3. Cap at _AUTO_LINK_MAX_SLUGS.

    Category filtering by focus is deferred to the backend, which has
    direct access to training_programs.category -- keeps the ai-service
    ignorant of program taxonomy internals and avoids duplicating the
    slug->category map from footballPrograms.ts.

    Fail-open: any DB error, missing context, or disabled flag returns
    [] and the caller proceeds without auto-link.
    """
    if not _FLOW_AUTO_LINK_ENABLED:
        return []

    context = state.get("player_context")
    if not context:
        return []

    sport = (getattr(context, "sport", "") or "football").lower()
    position = (getattr(context, "position", "") or "ALL").upper()

    try:
        from app.db.supabase import get_pool
        pool = get_pool()
        if pool is None:
            return []

        async with pool.connection() as conn:
            # 1. Matrix lookup (position -> fallback ALL)
            result = await conn.execute(
                """SELECT mandatory_programs, recommended_programs
                     FROM public.position_training_matrix
                    WHERE sport_id = %s AND position = %s
                    LIMIT 1""",
                (sport, position),
            )
            row = await result.fetchone()
            if not row and position != "ALL":
                result = await conn.execute(
                    """SELECT mandatory_programs, recommended_programs
                         FROM public.position_training_matrix
                        WHERE sport_id = %s AND position = 'ALL'
                        LIMIT 1""",
                    (sport,),
                )
                row = await result.fetchone()
            if not row:
                return []

            mandatory = list(row[0] or [])
            recommended = list(row[1] or [])

            # 2. Ordered dedupe, mandatory first
            slug_order: list[str] = []
            seen: set[str] = set()
            for s in mandatory + recommended:
                if isinstance(s, str) and s and s not in seen:
                    slug_order.append(s)
                    seen.add(s)

            # 3. Cap
            return slug_order[:_AUTO_LINK_MAX_SLUGS]
    except Exception as e:
        logger.warning(f"build_session auto-link slug resolve failed: {e}")
        return []


def _build_date_options(today_date: str) -> list[dict]:
    """Build 5 dynamic date chips starting at today.

    Labels use concrete day names ("Today", "Tomorrow", "Wednesday",
    "Thursday", "Friday") so the existing `_extract_date_from_message`
    handler parses them for free when mobile sends the label back.
    """
    from datetime import datetime, timedelta

    try:
        today_dt = datetime.strptime(today_date, "%Y-%m-%d")
    except Exception:
        # Degrade gracefully: no options rather than a crash
        return []

    day_names = [
        "Monday", "Tuesday", "Wednesday", "Thursday",
        "Friday", "Saturday", "Sunday",
    ]
    options = []
    for offset in range(5):
        d = today_dt + timedelta(days=offset)
        if offset == 0:
            label = "Today"
            desc = d.strftime("%a %b %-d")
        elif offset == 1:
            label = "Tomorrow"
            desc = d.strftime("%a %b %-d")
        else:
            label = day_names[d.weekday()]
            desc = d.strftime("%b %-d")
        options.append({
            "label": label,
            "value": d.strftime("%Y-%m-%d"),
            "description": desc,
        })
    return options


async def _present_date_picker(flow: FlowState, state: TomoChatState) -> dict:
    """Present the pick_date choice_card with 5 upcoming days."""
    today_date = flow.get("today_date", "") or ""
    options = _build_date_options(today_date)

    headline, body = await _warm_text(
        step_kind="pick_date",
        flow_context={},
        state=state,
        fallback_headline="When do you want to train?",
        fallback_body="Pick a day and I'll build it around your schedule.",
    )

    structured = {
        "headline": headline,
        "body": body,
        "cards": [{
            "type": "choice_card",
            "options": options,
        }],
        "chips": [],
    }

    await save_flow_state(
        state.get("session_id", ""),
        state.get("user_id", ""),
        flow,
    )

    return {
        "final_response": json.dumps(structured),
        "final_cards": structured["cards"],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


async def _present_step(flow: FlowState, state: TomoChatState) -> dict:
    """Present the current step as a choice_card."""
    step = flow.current_step
    if not step:
        return {}

    options = []

    # Get options from step config
    if step.static_options:
        options = step.static_options
    elif step.options_key:
        options = flow.get(step.options_key, [])
    elif step.id == "pick_focus":
        options = FOCUS_AREAS

    # Build choice card
    headline_map = {
        "pick_focus": "What's the focus?",
        "fork": "What do you want to do?",
    }
    fallback_headline = headline_map.get(step.id, "Pick one")

    # Warm text for pick_focus; fork is handled by _present_fork_choice.
    if step.id == "pick_focus":
        headline, body = await _warm_text(
            step_kind="pick_focus",
            flow_context={
                "available_focuses": ", ".join(a["label"] for a in FOCUS_AREAS),
                "target_date": flow.get("target_date", ""),
                "readiness": flow.get("readiness", ""),
            },
            state=state,
            fallback_headline=fallback_headline,
            fallback_body="",
        )
    else:
        headline = fallback_headline
        body = ""

    structured = {
        "headline": headline,
        "body": body,
        "cards": [{
            "type": "choice_card",
            "options": [
                {"label": o["label"], "value": o.get("value", o["label"]), "description": o.get("description", "")}
                for o in options
            ],
        }],
        "chips": [],
    }

    # Save flow state for next turn
    await save_flow_state(
        state.get("session_id", ""),
        state.get("user_id", ""),
        flow,
    )

    return {
        "final_response": json.dumps(structured),
        "final_cards": structured["cards"],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


async def _present_fork_choice(flow: FlowState, fork_result: dict, state: TomoChatState) -> dict:
    """Present a fork's choice options as a choice_card."""
    options = fork_result.get("options", [])

    # IMPORTANT: Do NOT pass existing session titles to Haiku -- it will
    # hallucinate a theme (e.g. "Speed work morning or evening?" when all
    # existing events happen to be Speed sessions). Pass counts only so
    # the headline stays neutral about what kind of session the athlete
    # actually wants.
    existing_count = sum(1 for o in options if o.get("value") != "new")
    headline, body = await _warm_text(
        step_kind="fork",
        flow_context={
            "existing_session_count": existing_count,
            "target_date": flow.get("target_date", ""),
        },
        state=state,
        fallback_headline="Build on what's scheduled, or add something new?",
        fallback_body="",
    )

    structured = {
        "headline": headline,
        "body": body,
        "cards": [{
            "type": "choice_card",
            "options": [
                {"label": o["label"], "value": o.get("value", ""), "description": o.get("description", "")}
                for o in options
            ],
        }],
        "chips": [],
    }

    # Save flow state (fork consumed, waiting for choice)
    await save_flow_state(
        state.get("session_id", ""),
        state.get("user_id", ""),
        flow,
    )

    return {
        "final_response": json.dumps(structured),
        "final_cards": structured["cards"],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


def _build_session_plan_chips(
    *,
    focus: str,
    attaching_existing: bool,
    total_min: int,
    drill_count: int,
) -> list[dict]:
    """Build context-aware chips for the session_plan preview card.

    Rationale: the old chips were always ["Looks good", "Make it lighter"],
    which ignored whether we were creating a new event vs attaching to an
    existing one, and ignored the focus. Context-aware chips give the
    athlete shortcuts that reflect what they're actually looking at.

    Behavior:
      - Primary "advance" chip always first ("Looks good" / "Save it").
      - Intensity swap chips only appear for non-recovery focus (you don't
        make a recovery session "lighter").
      - Attach vs fresh flows get different secondary chips because the
        next step is different (confirm vs time picker).
      - A focus-specific swap suggestion rounds out the row so athletes
        can pivot without rebuilding from scratch.
    """
    focus_lower = (focus or "training").lower()
    is_recovery = focus_lower in ("recovery", "rest", "active recovery", "mobility")

    advance_label = "Save to session" if attaching_existing else "Looks good"
    chips: list[dict] = [
        {"label": advance_label, "message": "Looks good"},
    ]

    # Intensity swaps -- skip for recovery (makes no sense to make it lighter)
    if not is_recovery:
        chips.append({"label": "Make it lighter", "message": "Can you make it lighter?"})
        # Heavier swap only if current volume is modest (<=30 min) so we
        # don't push an already-heavy plan into overtraining territory.
        if total_min and total_min <= 30:
            chips.append({"label": "Go harder", "message": "Can you make it harder?"})

    # Focus-specific swap suggestion (one alternative focus to pivot to)
    FOCUS_SWAP = {
        "endurance": ("Try speed instead", "Swap to speed work"),
        "speed": ("Try endurance instead", "Swap to endurance"),
        "strength": ("Try power instead", "Swap to power work"),
        "power": ("Try strength instead", "Swap to strength"),
        "technical": ("Add conditioning", "Add conditioning to this"),
        "recovery": ("Light mobility", "Make it a mobility flow"),
    }
    swap = FOCUS_SWAP.get(focus_lower)
    if swap and len(chips) < 4:
        chips.append({"label": swap[0], "message": swap[1]})

    return chips


async def _build_session_step(step: StepDefinition, flow: FlowState, state: TomoChatState) -> dict:
    """Build a training session and present as session_plan card."""
    # Call get_training_session with selected focus
    focus = flow.get("selected_focus", "general")

    user_id = state.get("user_id")
    context = state.get("player_context")
    if not user_id or not context:
        return _build_error_response(step)

    try:
        from app.agents.tools.output_tools import make_output_tools
        tools = make_output_tools(user_id, context)
        target = next((t for t in tools if t.name == "get_training_session"), None)
        if not target:
            return _build_error_response(step)

        result = await target.ainvoke({"category": focus})
    except Exception as e:
        logger.error(f"Session build failed: {e}", exc_info=True)
        return _build_error_response(step)

    if isinstance(result, dict) and result.get("error"):
        return _build_error_response(step)

    # Store drills for confirm step
    flow.store("session_drills", result)
    flow.advance()

    # Phase 5: compute auto-link slug list from position_training_matrix
    # and stash on the flow so _execute_confirm_tool can forward it to
    # the backend create_event call. Empty list is a valid no-op.
    try:
        program_slugs = await _resolve_program_slugs_for_session(focus, state)
    except Exception as e:
        logger.warning(f"build_session auto-link slug resolve exception: {e}")
        program_slugs = []
    flow.store("session_program_slugs", program_slugs)
    logger.info(
        f"build_session auto-link candidates focus={focus} "
        f"position={(getattr(context, 'position', '') or '')} "
        f"count={len(program_slugs)} slugs={program_slugs}"
    )

    # Build session_plan card -- field names MUST match the mobile
    # SessionPlanCard component in ResponseRenderer.tsx (title,
    # totalDuration, items, readiness, item.duration). Anything else
    # renders a blank box on mobile.
    drills = result.get("drills", [])
    card_items = []
    for d in drills:
        # Coerce drill id to str -- DB layer returns UUID objects which
        # are not JSON serializable. Same defense applies to any other
        # opaque id types the tool may return in the future.
        raw_drill_id = d.get("id") or d.get("drill_id")
        card_items.append({
            "name": d.get("name", "Drill"),
            "category": d.get("category", "training"),
            "duration": d.get("duration_min", 10),
            "intensity": d.get("intensity", "MODERATE"),
            "reason": d.get("description", ""),
            "drillId": str(raw_drill_id) if raw_drill_id is not None else None,
        })

    total_min = sum(d.get("duration_min", 0) for d in drills)

    # Layer C context signals — athlete name, stated intent, readiness —
    # so the warm-text path can personalize instead of dumping tone rules.
    athlete_name = (getattr(context, "name", "") or "").split(" ")[0] or ""
    calendar_empty = bool(flow.get("calendar_empty"))
    attaching_existing = bool(flow.get("target_event_id"))
    existing_title = ""
    if attaching_existing:
        evs = (flow.get("step_check_calendar_result", {}) or {}).get("events", []) or []
        for ev in evs:
            if str(ev.get("id", "")) == str(flow.get("target_event_id")):
                existing_title = ev.get("title", "") or ""
                break

    # Fallback headline + body are tight (< 180 chars combined). Drill
    # details live in card items, never in the body. Context-aware:
    # attaching_existing vs fresh-slot path each get their own.
    #
    # Note (Apr 15 2026 slot-first reorder): by the time build_drills
    # runs, pick_time has already locked `selected_time`, so the body
    # text now says "ready to save" instead of "when do you want it".
    # The old "Tell me when you want it" copy became a lie the moment
    # we moved pick_time to run BEFORE drills.
    locked_time_12h = _hhmm_to_12h(flow.get("selected_time") or "") if flow.get("selected_time") else ""
    slot_suffix = f" for {locked_time_12h}" if locked_time_12h else ""
    if attaching_existing:
        fallback_headline = f"Got your {focus} dialled in"
        fallback_body = f"{len(drills)} drills, {total_min} min. Say the word and I'll save them."
    elif calendar_empty:
        fallback_headline = f"Here's a clean {focus} block"
        fallback_body = f"{len(drills)} drills, {total_min} min{slot_suffix}. Ready to lock it in?"
    else:
        fallback_headline = f"Your {focus} is ready"
        fallback_body = f"{len(drills)} drills, {total_min} min{slot_suffix}. Scan it, then confirm."

    # Normalize readiness to the Green/Yellow/Red vocabulary mobile expects
    _readiness_raw = (flow.get("readiness", "") or "").strip().lower()
    if _readiness_raw in ("green", "g"):
        card_readiness = "Green"
    elif _readiness_raw in ("red", "r"):
        card_readiness = "Red"
    elif _readiness_raw in ("yellow", "amber", "y", "a"):
        card_readiness = "Yellow"
    else:
        card_readiness = "Green"

    # Retrieve sport-science grounding for this focus. Empty string on
    # failure / disabled -- warm-text path degrades to the baseline.
    # rag_meta is threaded back into the flow controller return dict so
    # `observability.build_post_execution_metadata` sees the same fields
    # it expects from the graph's rag_retrieval node -- keeps
    # ai_trace_log unified across flow-handled and graph-handled paths.
    rag_text, rag_meta = await _retrieve_session_rag(focus, state)

    headline, body = await _warm_text(
        step_kind="session_plan",
        flow_context={
            "focus": focus,
            "drill_count": len(drills),
            "total_minutes": total_min,
            "intensity": result.get("intensity", "MODERATE"),
            "target_date": flow.get("target_date", ""),
            "readiness": flow.get("readiness", ""),
            "athlete_name": athlete_name,
            "calendar_empty": calendar_empty,
            "attaching_existing": attaching_existing,
            "existing_event_title": existing_title,
        },
        state=state,
        fallback_headline=fallback_headline,
        fallback_body=fallback_body,
        rag_context=rag_text,
    )

    # Layer C2: hard cap body length. Drill details live in card items.
    if body and len(body) > 500:
        body = body[:497].rstrip() + "..."

    structured = {
        "headline": headline,
        "body": body,
        "cards": [{
            "type": "session_plan",
            "title": f"{focus.title()} Session",
            "category": focus,
            "intensity": result.get("intensity", "MODERATE"),
            "totalDuration": total_min,
            "readiness": card_readiness,
            "items": card_items,
        }],
        "chips": _build_session_plan_chips(
            focus=focus,
            attaching_existing=attaching_existing,
            total_min=total_min,
            drill_count=len(card_items),
        ),
    }

    # Save state for confirm step
    await save_flow_state(
        state.get("session_id", ""),
        state.get("user_id", ""),
        flow,
    )

    return {
        "final_response": json.dumps(structured),
        "final_cards": structured["cards"],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        # Roll RAG retrieval cost into the turn's total so ai_trace_log
        # reflects real spend. get_training_session is $0 (DB read), so
        # the whole turn cost == rag cost.
        "total_cost_usd": float(rag_meta.get("retrieval_cost_usd", 0.0) or 0.0),
        "total_tokens": 0,
        "tool_calls": [{"name": "get_training_session", "result": "success"}],
        # Telemetry: emit rag_metadata + rag_context into LangGraph state
        # so persist_node -> observability.build_post_execution_metadata
        # can flatten them into ai_trace_log.rag_used / rag_chunk_count /
        # rag_cost_usd / rag_latency_ms. Without this the insights audit
        # reads rag_chunk_count=0 even when retrieval succeeded, which is
        # the telemetry gap that prompted the April 2026 audit finding.
        "rag_metadata": rag_meta,
        "rag_context": rag_text,
    }


async def _present_confirm(flow: FlowState, state: TomoChatState) -> dict:
    """Present a confirmation card for the built session.

    Headline + body are context-aware: attaching drills to an existing
    event reads differently from booking a brand-new slot.
    """
    drills = flow.get("session_drills", {})
    focus = flow.get("selected_focus", "training")
    target_date = flow.get("target_date") or flow.get("today_date", "")
    target_event_id = flow.get("target_event_id")
    selected_time = flow.get("selected_time", "")

    # Build confirm card items
    items = []
    total_min = 0
    for d in drills.get("drills", [])[:5]:
        items.append({
            "title": d.get("name", "Drill"),
            "date": "",
            "time": f"{d.get('duration_min', 10)}min",
        })
        total_min += d.get("duration_min", 0)

    from app.flow.card_builders.schedule import _format_date
    date_display = _format_date(target_date) if target_date else ""

    # Existing-event title lookup for a more personal headline
    existing_title = ""
    if target_event_id:
        evs = (flow.get("step_check_calendar_result", {}) or {}).get("events", []) or []
        for ev in evs:
            if str(ev.get("id", "")) == str(target_event_id):
                existing_title = ev.get("title", "") or ""
                break

    if target_event_id:
        fallback_card_headline = f"Save these drills to your {existing_title or focus + ' session'}?"
        fallback_card_body = f"{len(drills.get('drills', []))} drills, {total_min} min -- attaches to your scheduled session."
    else:
        when = f"{date_display}{' at ' + selected_time if selected_time else ''}"
        fallback_card_headline = f"Book {focus} session for {when}?"
        fallback_card_body = f"{len(drills.get('drills', []))} drills, {total_min} min -- adds a new event to your timeline."

    card_headline, card_body = await _warm_text(
        step_kind="confirm",
        flow_context={
            "focus": focus,
            "drill_count": len(drills.get("drills", [])),
            "total_minutes": total_min,
            "date": date_display,
            "selected_time": selected_time,
            "attaching_existing": bool(target_event_id),
            "existing_event_title": existing_title,
        },
        state=state,
        fallback_headline=fallback_card_headline,
        fallback_body=fallback_card_body,
    )

    structured = {
        "headline": "",
        "body": "",
        "cards": [{
            "type": "confirm_card",
            "headline": card_headline,
            "body": card_body,
            "items": items,
            "confirm_label": "Confirm",
            "cancel_label": "Cancel",
            "action_data": {
                "flow_confirm": True,
                "intent": flow.intent_id,
                "focus": focus,
                "target_date": target_date,
                "drill_count": len(drills.get("drills", [])),
                "attaching_existing": bool(target_event_id),
                "target_event_id": target_event_id or "",
                "selected_time": selected_time,
            },
        }],
        "chips": [],
    }

    await save_flow_state(
        state.get("session_id", ""),
        state.get("user_id", ""),
        flow,
    )

    # Emit pending_write_action so chat.py can wire it into the SSE
    # response as `pendingConfirmation`. Without this, the mobile app
    # never attaches a confirmAction to the DisplayMessage and the
    # CONFIRM button's onPress handler is undefined -- the button
    # silently no-ops when tapped.
    #
    # The shape mirrors the regular agent write-action payload from
    # agent_dispatch.py so the existing mobile handler (HomeScreen
    # confirmHandler + ChatBubble onConfirm) works with zero mobile
    # changes. `preview` MUST be a phrase that _is_confirmation()
    # matches -- "Confirm" lands in the canonical set at line 1672-1676.
    #
    # The _multi_step_flow marker lets flow_controller_node route the
    # confirmation turn back into execute_multi_step_continuation
    # instead of the regular execute_confirmed_action path (which
    # would try to invoke a nonexistent "multi_step_confirm" tool).
    flow_action = {
        "toolName": "multi_step_confirm",
        "toolInput": {
            "flow_id": flow.flow_id,
            "intent": flow.intent_id,
            "focus": focus,
            "target_date": target_date,
            "target_event_id": target_event_id or "",
            "selected_time": selected_time,
        },
        "agentType": "flow",
        "toolCallId": f"flow_confirm_{flow.flow_id}",
    }
    pending_write_action = {
        "actions": [flow_action],
        "preview": "Confirm",
        "primary_action": flow_action,
        # Top-level fields the mobile HomeScreen handler reads when
        # building the confirmedAction payload for the next turn.
        "toolName": flow_action["toolName"],
        "toolInput": flow_action["toolInput"],
        "agentType": flow_action["agentType"],
        # Marker used by flow_controller_node to route the confirmation
        # turn into multi_step continuation instead of agent_dispatch.
        "_multi_step_flow": True,
    }

    return {
        "final_response": json.dumps(structured),
        "final_cards": structured["cards"],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
        "pending_write_action": pending_write_action,
    }


def _build_completion_response(flow: FlowState) -> dict:
    """Build the final response when all steps are complete.

    Now that `confirm_tool` actually executes, this response reflects
    the REAL outcome: either the created event, the updated-notes
    status, or the write error if the bridge call failed.

    Dispatches to per-intent completion builders so the message reflects
    what was actually committed. The legacy build_session path stays as
    the default fallback to preserve existing behaviour.
    """
    # build_week_plan needs its own completion message — the build_session
    # template ("Booked your timeline with 0 drills") is wrong for a week
    # plan because there are no drills, the scheduled items are training +
    # study sessions across multiple days, and `selected_focus` is never set.
    if flow.intent_id == "build_week_plan":
        return _build_week_plan_completion_response(flow)

    focus = flow.get("selected_focus", "training")
    confirm_result = flow.get("confirm_result") or {}
    target_event_id = flow.get("target_event_id")
    drills = flow.get("session_drills", {}) or {}
    drill_count = len(drills.get("drills", []))
    target_date = flow.get("target_date", "")
    selected_time = flow.get("selected_time", "")

    # Write failed -- surface the error, let athlete retry
    if isinstance(confirm_result, dict) and confirm_result.get("error"):
        err_msg = str(confirm_result.get("error"))[:140]
        structured = {
            "headline": "Couldn't lock it in",
            "body": f"Hit a snag writing that to your calendar: {err_msg}. Want to try again?",
            "cards": [],
            "chips": [
                {"label": "Try again", "message": "Build me a training session"},
                {"label": "Show schedule", "message": "What's on today?"},
            ],
        }
        return {
            "final_response": json.dumps(structured),
            "final_cards": [],
            "_flow_pattern": "multi_step",
            "route_decision": "flow_handled",
            "total_cost_usd": 0.0,
            "total_tokens": 0,
            # Clear pending write state so chat.py doesn't re-emit
            # a stale confirmAction on the retry turn.
            "pending_write_action": None,
            "write_confirmed": False,
        }

    if target_event_id:
        headline = f"Done — {drill_count} drills on your {focus} session"
        body = (
            "Your session's got everything it needs. "
            "Go put the work in and tell me how it felt after."
        )
    else:
        date_display = target_date or "your timeline"
        time_display = f" at {selected_time}" if selected_time else ""
        headline = f"You're set for {focus}"
        body = (
            f"Booked {date_display}{time_display} with {drill_count} drills. "
            "Show up, trust it, come tell me how it went."
        )

    # Context-aware chips: the "Show schedule" chip must route to the
    # SAME date we just wrote to. Hardcoding "What's on today?" after
    # a tomorrow-booking sends the athlete to the wrong day's schedule.
    today_iso = flow.get("today_date", "") or ""
    if target_date and today_iso and target_date != today_iso:
        schedule_label, schedule_msg = _chip_for_target_date(target_date, today_iso)
    else:
        schedule_label, schedule_msg = "Show today", "What's on today?"

    structured = {
        "headline": headline,
        "body": body,
        "cards": [],
        "chips": [
            {"label": schedule_label, "message": schedule_msg},
            {"label": "Check readiness", "message": "What's my readiness?"},
        ],
    }

    return {
        "final_response": json.dumps(structured),
        "final_cards": [],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
        # Booking succeeded -- clear the pending write action the
        # supervisor injected from confirmed_action so chat.py does
        # not re-emit it as pendingConfirmation. Without this the
        # mobile would stay stuck in confirm-button state after the
        # session is booked.
        "pending_write_action": None,
        "write_confirmed": False,
    }


def _build_week_plan_completion_response(flow: FlowState) -> dict:
    """Build the final response after `build_week_plan` commits.

    Reads `draft_summary` (the deterministic builder's count of placed events)
    and `confirm_result` (the bridge's commit response) so the message reflects
    what was actually scheduled — not the build_session template.

    Failure mode: if the bridge commit returned an error, surface a retry
    message. If summary is empty (nothing was placed), explain why instead
    of pretending success.
    """
    confirm_result = flow.get("confirm_result") or {}
    summary = flow.get("draft_summary") or {}
    plan_items = flow.get("draft_plan_items") or []
    mode = flow.get("athlete_mode", "balanced")

    # Commit failed → tell the truth so the athlete can retry
    if isinstance(confirm_result, dict) and confirm_result.get("error"):
        err_msg = str(confirm_result.get("error"))[:140]
        structured = {
            "headline": "Couldn't lock in the week",
            "body": f"Hit a snag writing your week to your calendar: {err_msg}. Want to try again?",
            "cards": [],
            "chips": [
                {"label": "Try again", "message": "Plan my week"},
                {"label": "Show this week", "message": "Show my week"},
            ],
        }
        return {
            "final_response": json.dumps(structured),
            "final_cards": [],
            "_flow_pattern": "multi_step",
            "route_decision": "flow_handled",
            "total_cost_usd": 0.0,
            "total_tokens": 0,
            "pending_write_action": None,
            "write_confirmed": False,
        }

    training = int(summary.get("trainingSessions") or 0)
    study = int(summary.get("studySessions") or 0)
    total_min = int(summary.get("totalMinutes") or 0)
    hours = round(total_min / 60, 1) if total_min else 0.0

    # Nothing was placed — explain why instead of saying "you're set"
    if training == 0 and study == 0:
        structured = {
            "headline": "Week's empty",
            "body": (
                "Looks like nothing got placed — your mix may have been zero "
                "across the board, or there wasn't room around your existing "
                "schedule. Want to try again with a different mix?"
            ),
            "cards": [],
            "chips": [
                {"label": "Plan it again", "message": "Plan my week"},
                {"label": "Show this week", "message": "Show my week"},
            ],
        }
        return {
            "final_response": json.dumps(structured),
            "final_cards": [],
            "_flow_pattern": "multi_step",
            "route_decision": "flow_handled",
            "total_cost_usd": 0.0,
            "total_tokens": 0,
            "pending_write_action": None,
            "write_confirmed": False,
        }

    # Build the honest body — describe what was actually placed.
    # Tailor the framing to what's dominant so the line feels right.
    if training > 0 and study > 0:
        bits = f"{training} training and {study} study session" + ("s" if (training + study) != 1 else "")
        headline = "Week's locked in"
        body = (
            f"Booked {bits} this week — {hours}h total. "
            "Show up, trust it, and tell me how it lands."
        )
    elif training > 0:
        bits = f"{training} training session" + ("s" if training != 1 else "")
        headline = "Training week's locked in"
        body = (
            f"Booked {bits} — {hours}h total. "
            "Show up, trust it, come tell me how it went."
        )
    else:  # study only
        bits = f"{study} study session" + ("s" if study != 1 else "")
        headline = "Study week's locked in"
        body = (
            f"Booked {bits} — {hours}h total. "
            "Stick to the plan and let me know how the sessions land."
        )

    # Mode-aware nuance — quiet hint that doesn't repeat data already shown
    if mode == "rest":
        headline = "Recovery week's set"
        body = (
            "Booked a recovery-focused week — light load, lots of restoration. "
            "Trust it, your body's earning it."
        )

    structured = {
        "headline": headline,
        "body": body,
        "cards": [],
        "chips": [
            {"label": "Show my week", "message": "Show my week"},
            {"label": "Check readiness", "message": "What's my readiness?"},
        ],
    }

    return {
        "final_response": json.dumps(structured),
        "final_cards": [],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
        "pending_write_action": None,
        "write_confirmed": False,
    }


# ── Readiness safety gate ──────────────────────────────────────────────
# Deterministic, context-only check. Blocks high-intensity drill building
# when the athlete is RED or ACWR is in the danger zone. The athlete can
# always override -- the gate is advisory, never final.

def _evaluate_readiness_gate(flow: FlowState, state: TomoChatState) -> dict:
    """Return {"block": True, ...} if the athlete should be routed to
    recovery-first before any drill building, else {"block": False}.

    RED readiness or ACWR > 1.5 trigger the block. An athlete who has
    explicitly selected recovery focus bypasses the gate.
    """
    context = state.get("player_context")
    if not context:
        return {"block": False}

    se = getattr(context, "snapshot_enrichment", None)
    if not se:
        return {"block": False}

    stated_focus = (flow.get("selected_focus") or "").lower()
    if stated_focus == "recovery":
        return {"block": False}

    readiness_rag = (getattr(se, "readiness_rag", "") or "").upper().strip()
    acwr = getattr(se, "acwr", None)

    if readiness_rag == "RED":
        return {
            "block": True,
            "reason": "red_readiness",
            "readiness_rag": "Red",
            "acwr": acwr,
            "title": "Your body is in the red today",
            "body": (
                "Your readiness is flagged red -- pushing a hard session now "
                "could set back the whole week. A recovery-first protocol is the "
                "smart call. You can still override if your coach is directing it."
            ),
        }

    try:
        acwr_val = float(acwr) if acwr is not None else None
    except (TypeError, ValueError):
        acwr_val = None

    if acwr_val is not None and acwr_val > 1.5:
        return {
            "block": True,
            "reason": "high_acwr",
            "readiness_rag": readiness_rag.title() if readiness_rag else None,
            "acwr": acwr_val,
            "title": "Your load is in the danger zone",
            "body": (
                f"Your ACWR is {acwr_val:.2f} -- well above the 1.5 danger line. "
                "A lighter session or active recovery is what the data is asking "
                "for. You can still override if your coach is directing it."
            ),
        }

    return {"block": False}


async def _present_safety_gate(flow: FlowState, gate: dict, state: TomoChatState) -> dict:
    """Render the readiness safety gate as a dedicated card.

    Outer headline/body are intentionally empty -- the mobile renderer
    draws BOTH the message bubble AND the card, so echoing the same
    copy in both produces the duplicated text we saw in prod.
    """
    structured = {
        "headline": "",
        "body": "",
        "cards": [{
            "type": "safety_gate",
            "headline": gate.get("title", "Heads up"),
            "body": gate.get("body", ""),
            "reason": gate.get("reason", ""),
            "readiness": gate.get("readiness_rag"),
            "acwr": gate.get("acwr"),
            "options": [
                {"label": "Build a recovery session", "value": "recovery"},
                {"label": "Override -- build anyway", "value": "override"},
            ],
        }],
        "chips": [
            {"label": "Build recovery", "message": "Build me a recovery session"},
            {"label": "Override anyway", "message": "Override and build anyway"},
        ],
    }

    await save_flow_state(
        state.get("session_id", ""),
        state.get("user_id", ""),
        flow,
    )

    return {
        "final_response": json.dumps(structured),
        "final_cards": structured["cards"],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


# ── Time picker (new step for fresh sessions) ───────────────────────────

_TIME_PICKER_OPTIONS = [
    {"label": "Morning (7:00 AM)", "value": "07:00"},
    {"label": "Late morning (10:00 AM)", "value": "10:00"},
    {"label": "Afternoon (3:00 PM)", "value": "15:00"},
    {"label": "Early evening (5:00 PM)", "value": "17:00"},
    {"label": "Evening (7:00 PM)", "value": "19:00"},
]


async def _present_time_picker(flow: FlowState, state: TomoChatState) -> dict:
    """Slot-first time picker.

    This runs BEFORE build_drills in the new flow order. Responsibilities:

      1. If opener stated a time AND it's clean -> auto-advance silently.
      2. If opener stated a time AND it conflicts with an existing event ->
         present a conflict card with alternatives ("5pm is taken by
         Endurance Session -- here are clean slots nearby").
      3. If no time stated -> present the normal suggest-slots picker.

    Standardized via `app.flow.helpers.scheduling.resolve_slot` so every
    timeline/scheduling flow reuses the same conflict-check logic.
    Drills aren't built yet, so duration validation uses a generous
    default (DEFAULT_SESSION_DURATION_MIN). _execute_confirm_tool later
    uses the real drill total for the create_event end_time.
    """
    target_date = flow.get("target_date", "")
    requested_time = flow.get("selected_time") or None

    context = state.get("player_context")
    tz = getattr(context, "timezone", None) or "UTC"

    # Use a generous default duration for the slot-validation query.
    # Confirm step recomputes end_time from actual drills.
    duration_min = DEFAULT_SESSION_DURATION_MIN
    flow.store("session_total_min", duration_min)

    resolution: SlotResolution = await resolve_slot(
        user_id=state.get("user_id", ""),
        target_date=target_date,
        requested_time=requested_time,
        duration_min=duration_min,
        timezone=tz,
    )

    # ── Case 1: stated time is clean → auto-advance ──
    if resolution.status == "confirmed":
        flow.store("selected_time", resolution.start_24)
        logger.info(
            f"pick_time auto-confirmed {resolution.start_24} "
            f"({duration_min}min) on {target_date}"
        )
        flow.advance()
        return await _execute_current_step(flow, state)

    # ── Case 2/3: present picker (conflict or fresh pick) ──
    # Title → Card (slot options) → Pills (day-after / cancel).
    # Mobile renders the card options as a tappable list and sends the
    # tapped option's LABEL verbatim as the next chat message, which
    # execute_multi_step_continuation matches via pending_slot_options.

    # Build slot options STRICTLY from resolve_slot alternatives.
    # NO static fallback: a generic "Morning / Afternoon / Evening"
    # list on a fully-booked day serves options that all overlap real
    # events, which is worse than an honest empty-state card. When
    # the engine returns zero slots we flip the UX into "day is
    # packed" mode with only the day-after pill as the escape hatch.
    slot_options: list[dict] = []
    for alt in resolution.alternatives:
        slot_options.append({
            "label": alt.label,
            "value": alt.start_24,
            "description": "Open slot",
        })

    # Persist the option list so the continuation handler can map
    # tapped labels (e.g. "6:00 PM - 7:15 PM") back to their start
    # times deterministically, without relying on regex parsing.
    flow.store("pending_slot_options", [
        {"label": o["label"], "value": o["value"]}
        for o in slot_options
    ])

    # Day-after pill: bumps target_date by 1 and re-runs the whole
    # calendar check + conflict resolver against the new day, so the
    # athlete's original time (stored in stated_time_original) gets
    # re-validated against the next day's schedule. Uses a sentinel
    # message so the continuation handler can detect it unambiguously.
    pills: list[dict] = [
        {"label": "Try the day after", "message": "__try_day_after__"},
        {"label": "Cancel", "message": "cancel"},
    ]

    # ── Empty-state: backend returned 0 viable slots ──
    # Day is genuinely packed (or the engine's buffer rules ate every
    # candidate). Don't emit a choice_card -- serve a clear message
    # with the day-after pill as the only forward path.
    if not slot_options:
        if resolution.status == "conflict":
            flow.store("selected_time", None)
            headline = (
                resolution.headline
                or f"{_hhmm_to_12h(requested_time)} is taken"
            )
            body_text = (
                f"{target_date or 'That day'} is packed -- no clean slots "
                f"around your other sessions. Want to try the day after?"
            )
        else:
            headline = (
                f"{target_date or 'That day'} is packed"
                if target_date else "That day is packed"
            )
            body_text = (
                "No clean slots fit around your existing sessions. "
                "Tap 'Try the day after' and I'll check the next day."
            )
        logger.info(
            f"pick_time empty-state: 0 alternatives for {target_date} "
            f"(requested_time={requested_time}, status={resolution.status})"
        )
        structured = {
            "headline": headline,
            "body": body_text,
            "cards": [],
            "chips": pills,
        }
        await save_flow_state(
            state.get("session_id", ""),
            state.get("user_id", ""),
            flow,
        )
        return {
            "final_response": json.dumps(structured),
            "final_cards": [],
            "_flow_pattern": "multi_step",
            "route_decision": "flow_handled",
            "total_cost_usd": 0.0,
            "total_tokens": 0,
        }

    if resolution.status == "conflict":
        # Clear the stale stated time so the athlete isn't re-matched
        # to it on their next reply; they must pick a fresh option.
        # stated_time_original stays intact for the day-after retry.
        flow.store("selected_time", None)
        headline = (
            resolution.headline
            or f"{_hhmm_to_12h(requested_time)} is taken"
        )
        body_text = (
            resolution.body
            or "That slot overlaps another session. Pick a clean one."
        )
        card_headline = (
            f"Open slots on {target_date}" if target_date else "Open slots"
        )
        logger.info(
            f"pick_time conflict: {requested_time} overlaps "
            f"{resolution.conflict_event_title!r} -- offering "
            f"{len(slot_options)} alternatives"
        )
    else:
        # needs_pick
        date_hint = f" for {target_date}" if target_date else ""
        headline = f"When do you want to run it{date_hint}?"
        body_text = (
            resolution.body
            or "Pick a slot that fits around school and recovery."
        )
        card_headline = (
            f"Open slots on {target_date}" if target_date else "Open slots"
        )

    cards = [{
        "type": "choice_card",
        "headline": card_headline,
        "options": slot_options,
    }]

    structured = {
        "headline": headline,
        "body": body_text,
        "cards": cards,
        "chips": pills,
    }

    await save_flow_state(
        state.get("session_id", ""),
        state.get("user_id", ""),
        flow,
    )

    return {
        "final_response": json.dumps(structured),
        "final_cards": cards,
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


def _match_time(msg: str) -> Optional[str]:
    """Best-effort parse of a time selection. Returns HH:MM or None.

    Delegates numeric parsing to `parse_time_from_label` (the single
    source of truth in app.flow.helpers.scheduling) so slot labels like
    "6:00 PM - 7:15 PM" resolve to the START time (18:00), not the
    bare-regex mis-parse of "7:00" as "07:00".
    """
    if not msg:
        return None
    m = msg.lower().strip()

    # 1. Exact / substring match against preset picker options
    for opt in _TIME_PICKER_OPTIONS:
        if opt["value"] == m or opt["label"].lower() == m:
            return opt["value"]
    for opt in _TIME_PICKER_OPTIONS:
        if opt["value"] in m or opt["label"].lower() in m:
            return opt["value"]

    # 2. Structured time parse (PM-aware, first-match-wins so a
    #    label like "6:00 PM - 7:15 PM" returns the 18:00 start).
    parsed = parse_time_from_label(m)
    if parsed:
        return parsed

    # 3. Natural-language keyword fallback (kept last so explicit
    #    times in the message always win).
    if "morning" in m:
        return "07:00"
    if "afternoon" in m:
        return "15:00"
    if "evening" in m:
        return "17:00"
    if "night" in m:
        return "19:00"
    return None


def _shift_date_by_days(iso_date: str, days: int) -> Optional[str]:
    """Return `iso_date` (YYYY-MM-DD) shifted by `days`. None on error.

    Used by the "Try the day after" pill so the athlete can push their
    originally-requested time onto the next day without re-typing it.
    """
    if not iso_date:
        return None
    from datetime import date, timedelta
    try:
        d = date.fromisoformat(iso_date)
        return (d + timedelta(days=days)).isoformat()
    except (ValueError, TypeError):
        return None


def _add_minutes(hhmm: str, minutes: int) -> str:
    """Add minutes to an HH:MM clock string, clamped to 24h."""
    from datetime import datetime, timedelta
    try:
        t = datetime.strptime(hhmm, "%H:%M")
        return (t + timedelta(minutes=max(0, int(minutes)))).strftime("%H:%M")
    except (ValueError, TypeError):
        return hhmm


# ── Week planner helpers ────────────────────────────────────────────────

def _resolve_week_start_from_message(msg: str, flow: FlowState) -> str | None:
    """Map 'This week' / 'Next week' / 'Week after' (or short-form ids
    'this' / 'next' / 'after') to the ISO date of the week's first day.

    The first day is the athlete's My Rules `week_start_day` (0=Sun..
    6=Sat). Falls back to 6 (Saturday) if the flow doesn't know — the
    ME-academic default. Never hardcodes Monday.
    """
    from datetime import datetime, timedelta
    lowered = (msg or "").lower().strip()
    today_iso = flow.get("today_date") or ""
    try:
        today = datetime.strptime(today_iso, "%Y-%m-%d") if today_iso else datetime.utcnow()
    except ValueError:
        today = datetime.utcnow()

    # Python's weekday(): Mon=0..Sun=6. JS/our model: Sun=0..Sat=6.
    # Convert Python's value to the JS convention once.
    today_js_weekday = (today.weekday() + 1) % 7  # Mon=1, Sun=0
    wsd_raw = flow.get("week_start_day")
    try:
        week_start_day = int(wsd_raw) if wsd_raw is not None else 6
    except (TypeError, ValueError):
        week_start_day = 6
    if not (0 <= week_start_day <= 6):
        week_start_day = 6

    # Days back from today to reach the current week's start.
    days_back = (today_js_weekday - week_start_day) % 7
    current_week_start = today - timedelta(days=days_back)

    if lowered == "this":
        offset_weeks = 0
    elif lowered == "next":
        offset_weeks = 1
    elif lowered == "after":
        offset_weeks = 2
    elif "week after" in lowered or "two weeks" in lowered:
        offset_weeks = 2
    elif "next week" in lowered:
        offset_weeks = 1
    elif "this week" in lowered or "current" in lowered:
        offset_weeks = 0
    else:
        return None
    return (current_week_start + timedelta(weeks=offset_weeks)).strftime("%Y-%m-%d")


_WEEK_OPTIONS = [
    {"id": "this", "label": "This week", "description": "Starting today"},
    {"id": "next", "label": "Next week", "description": "Starts Monday"},
    {"id": "after", "label": "Week after", "description": "Two weeks out"},
]

_FALLBACK_MODES = [
    {"id": "balanced", "label": "Balanced", "description": "Equal focus on training and academics"},
    {"id": "league", "label": "League", "description": "Competition focus — training intensity prioritized"},
    {"id": "study", "label": "Study", "description": "Academic priority — reduced training load"},
    {"id": "rest", "label": "Rest", "description": "Recovery focus — minimal training"},
]


async def _fetch_modes(user_id: str) -> tuple[list[dict], str, int]:
    """Load athlete_modes catalog + current mode + weekStartDay from the
    TS bridge. The weekStartDay is the athlete's My Rules setting
    (0=Sun..6=Sat) — the week-scope resolver uses it so "this week"
    lands on the right day for ME athletes whose week is Sat-Fri."""
    from app.agents.tools.bridge import bridge_get
    try:
        result = await bridge_get(
            "/api/v1/week-plan/modes",
            params=None,
            user_id=user_id,
        )
    except Exception as e:
        logger.warning(f"week_scope: modes fetch failed, using fallback: {e}")
        return _FALLBACK_MODES, "balanced", 6
    if not isinstance(result, dict) or result.get("error"):
        return _FALLBACK_MODES, "balanced", 6
    modes = result.get("modes")
    if not isinstance(modes, list) or not modes:
        modes = _FALLBACK_MODES
    current = result.get("currentMode")
    if not isinstance(current, str) or not current:
        current = "balanced"
    wsd_raw = result.get("weekStartDay")
    wsd = int(wsd_raw) if isinstance(wsd_raw, (int, float)) and 0 <= int(wsd_raw) <= 6 else 6
    return modes, current, wsd


async def _present_week_scope_capsule(flow: FlowState, state: TomoChatState) -> dict:
    """Render the combined week-scope + mode picker as the opening step."""
    user_id = state.get("user_id", "")
    modes, current_mode, week_start_day = await _fetch_modes(user_id)
    # Cache the player's week_start_day on flow state — the continuation
    # handler's _coerce_week_scope reads it when resolving "this" | "next"
    # | "after" into a concrete Monday (or Saturday, or whatever day the
    # athlete configured) date.
    flow.store("week_start_day", week_start_day)

    structured = {
        "headline": "Plan your week",
        "body": "Pick the week and the mode you want to plan under.",
        "cards": [{
            "type": "week_scope_capsule",
            "weeks": _WEEK_OPTIONS,
            "modes": modes,
            "currentMode": current_mode,
        }],
        "chips": [],
    }

    await save_flow_state(
        state.get("session_id", ""),
        state.get("user_id", ""),
        flow,
    )
    return {
        "final_response": json.dumps(structured),
        "final_cards": structured["cards"],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


_VALID_WEEK_CHOICES = {"this", "next", "after"}


def _coerce_week_scope(
    payload: dict | None,
    flow: FlowState,
) -> dict | None:
    """Validate the week_scope_capsule submit and return {week_start, athlete_mode}
    or None if the payload is malformed."""
    if not isinstance(payload, dict):
        return None
    raw_week = payload.get("weekChoice")
    raw_mode = payload.get("modeId")
    if raw_week not in _VALID_WEEK_CHOICES:
        return None
    if not isinstance(raw_mode, str) or not raw_mode.strip():
        raw_mode = "balanced"

    week_start = _resolve_week_start_from_message(raw_week, flow)
    if not week_start:
        return None
    return {"week_start": week_start, "athlete_mode": raw_mode.strip()}


def _extract_capsule_payload(state: TomoChatState) -> dict | None:
    """Pull the capsule's submitted payload.

    The supervisor injects incoming `confirmed_action` (from the TS proxy)
    into state under `pending_write_action` (see supervisor.py:286 — that's
    the established key all confirm-action handlers read from). Every other
    capsule read path uses that key; the week-planner handlers must too or
    the flow silently re-renders the same card (bug observed 2026-04-18:
    training_mix submit looped because this function read the wrong key).

    Returns None when the state has no pending action (e.g. user typed
    a free-text response instead of tapping a capsule button).
    """
    raw = state.get("pending_write_action")
    action = raw if isinstance(raw, dict) else None
    if not action:
        return None
    tool_input = action.get("toolInput")
    return tool_input if isinstance(tool_input, dict) else None


_CATEGORY_IDS = {
    "club", "gym", "personal", "recovery",
    "individual_technical", "tactical", "match_competition", "mental_performance",
}


def _coerce_training_mix(payload: dict | None) -> list | None:
    """Validate + shape the submitted training mix. Returns None when the
    payload is missing required fields so the card can re-prompt."""
    if not isinstance(payload, dict):
        return None
    raw = payload.get("trainingMix")
    if not isinstance(raw, list):
        return None
    cleaned: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        cat = item.get("category")
        if cat not in _CATEGORY_IDS:
            continue
        sessions = int(item.get("sessionsPerWeek") or 0)
        duration = int(item.get("durationMin") or 60)
        placement = item.get("placement") if item.get("placement") in ("fixed", "flexible") else "flexible"
        fixed_days = item.get("fixedDays") if isinstance(item.get("fixedDays"), list) else []
        preferred = item.get("preferredTime") if item.get("preferredTime") in ("morning", "afternoon", "evening") else None
        shaped = {
            "category": cat,
            "sessionsPerWeek": max(0, min(5, sessions)),
            "durationMin": max(15, min(180, duration)),
            "placement": placement,
            "fixedDays": [int(d) for d in fixed_days if isinstance(d, (int, float)) and 0 <= int(d) <= 6],
        }
        if preferred:
            shaped["preferredTime"] = preferred
        cleaned.append(shaped)
    return cleaned


def _coerce_study_mix(payload: dict | None) -> list | None:
    """Validate + shape the submitted study mix."""
    if not isinstance(payload, dict):
        return None
    raw = payload.get("studyMix")
    if not isinstance(raw, list):
        return None
    cleaned: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        subject = str(item.get("subject") or "").strip()
        if not subject:
            continue
        sessions = int(item.get("sessionsPerWeek") or 0)
        duration = int(item.get("durationMin") or 45)
        placement = item.get("placement") if item.get("placement") in ("fixed", "flexible") else "flexible"
        fixed_days = item.get("fixedDays") if isinstance(item.get("fixedDays"), list) else []
        preferred = item.get("preferredTime") if item.get("preferredTime") in ("morning", "afternoon", "evening") else None
        is_exam = bool(item.get("isExamSubject"))
        shaped = {
            "subject": subject[:60],
            "sessionsPerWeek": max(0, min(5, sessions)),
            "durationMin": max(15, min(180, duration)),
            "placement": placement,
            "fixedDays": [int(d) for d in fixed_days if isinstance(d, (int, float)) and 0 <= int(d) <= 6],
            "isExamSubject": is_exam,
        }
        if preferred:
            shaped["preferredTime"] = preferred
        cleaned.append(shaped)
    return cleaned


async def _apply_draft_edit(flow: FlowState, state: TomoChatState, payload: dict) -> dict:
    """Validate + apply an inline edit to one item in the draft plan.
    Calls /api/v1/week-plan/validate-edit to enforce buffers + school
    hours + day bounds with the server's live snapshot. Mutates the
    in-memory draft on success."""
    from app.agents.tools.bridge import bridge_post

    plan_items = flow.get("draft_plan_items") or []
    if not isinstance(plan_items, list) or len(plan_items) == 0:
        return {"ok": False, "message": "No draft to edit."}

    try:
        edit_index = int(payload.get("itemIndex"))
    except (TypeError, ValueError):
        return {"ok": False, "message": "Invalid item index."}
    if edit_index < 0 or edit_index >= len(plan_items):
        return {"ok": False, "message": "Item out of range."}

    proposed = payload.get("proposed") if isinstance(payload.get("proposed"), dict) else {}
    if not proposed:
        return {"ok": False, "message": "No edit proposed."}

    validation = await bridge_post(
        "/api/v1/week-plan/validate-edit",
        {
            "weekStart": flow.get("week_start", ""),
            "timezone": flow.get("timezone", "UTC"),
            "planItems": plan_items,
            "editIndex": edit_index,
            "proposed": proposed,
        },
        user_id=state.get("user_id", ""),
    )
    if not isinstance(validation, dict) or validation.get("ok") is not True:
        return {
            "ok": False,
            "message": (validation or {}).get("message") or "That edit doesn't fit.",
        }

    # Apply on the draft.
    item = dict(plan_items[edit_index])
    item["date"] = proposed.get("date") or item["date"]
    item["startTime"] = proposed.get("startTime") or item["startTime"]
    item["endTime"] = validation.get("endTime") or item.get("endTime")
    item["durationMin"] = int(proposed.get("durationMin") or item.get("durationMin", 0))
    if proposed.get("intensity") in ("LIGHT", "MODERATE", "HARD"):
        item["intensity"] = proposed["intensity"]
    if proposed.get("title"):
        item["title"] = str(proposed["title"])[:200]
    plan_items[edit_index] = item
    # Sort chronologically so the preview stays readable.
    plan_items.sort(key=lambda x: (x.get("date", ""), x.get("startTime", "")))
    flow.store("draft_plan_items", plan_items)
    return {"ok": True}


# ── Week planner presenters ─────────────────────────────────────────────
# Four steps use capsule cards defined by the Week Planner: the training
# mix picker, the study plan picker, the preview, and the final confirm.
# Each emits a structured card the mobile renders natively; server keeps
# the generated draft on flow state so the athlete can edit any item
# without rebuilding the plan from scratch.

async def _present_training_mix_capsule(flow: FlowState, state: TomoChatState) -> dict:
    """Render the training_mix_capsule with catalog defaults seeded from
    /api/v1/week-plan/suggest. Mobile lets the athlete edit sessions/week,
    duration, and fixed vs flexible days per category."""
    suggested = flow.get("suggested_training_mix") or []
    notes = flow.get("suggestion_notes") or []

    structured = {
        "headline": "Training mix",
        "body": "Set how many of each you want this week — duration, and whether days are fixed or flexible.",
        "cards": [{
            "type": "training_mix_capsule",
            "weekStart": flow.get("week_start", ""),
            "categories": suggested,
            "notes": notes,
        }],
        "chips": [],
    }

    await save_flow_state(
        state.get("session_id", ""),
        state.get("user_id", ""),
        flow,
    )
    return {
        "final_response": json.dumps(structured),
        "final_cards": structured["cards"],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


async def _present_study_plan_capsule(flow: FlowState, state: TomoChatState) -> dict:
    """Render the study_plan_capsule. Seeds from suggest → union of
    player's study_subjects + exam_subjects + exam_schedule.subject.
    Exam subjects arrive with a bumped default during exam periods;
    all other subjects default to sessionsPerWeek=0 so the athlete
    opts in per subject, per week. Adding a new subject also
    persists it to player_schedule_preferences.study_subjects so it
    survives the session."""
    suggested = flow.get("suggested_study_mix") or []
    body = (
        "Tap a number to schedule each subject this week. Add any subject that's missing."
        if suggested
        else "Add the subjects you want to schedule this week."
    )
    structured = {
        "headline": "Study plan",
        "body": body,
        "cards": [{
            "type": "study_plan_capsule",
            "weekStart": flow.get("week_start", ""),
            "subjects": suggested,
        }],
        "chips": [],
    }
    await save_flow_state(
        state.get("session_id", ""),
        state.get("user_id", ""),
        flow,
    )
    return {
        "final_response": json.dumps(structured),
        "final_cards": structured["cards"],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


async def _present_week_plan_preview_capsule(flow: FlowState, state: TomoChatState) -> dict:
    """Render the preview: the placed week plus warnings + per-session edit
    affordance. The athlete can tap any session, change title / time / date
    / duration / intensity, and the card posts back to the same flow —
    we validate via /api/v1/week-plan/validate-edit and mutate the
    in-memory draft before the next preview render."""
    plan_items = flow.get("draft_plan_items") or []
    summary = flow.get("draft_summary") or {}
    warnings = flow.get("draft_warnings") or []

    # If the builder returned an error or empty plan, escalate immediately.
    if not plan_items:
        structured = {
            "headline": "Couldn't build your week",
            "body": _summarise_warnings(warnings) or "The builder returned no sessions. Try reducing the mix or switching to flexible placement.",
            "cards": [],
            "chips": [
                {"label": "Change training mix", "message": "let me change the training mix"},
                {"label": "Cancel", "message": "cancel"},
            ],
        }
        await save_flow_state(
            state.get("session_id", ""),
            state.get("user_id", ""),
            flow,
        )
        return {
            "final_response": json.dumps(structured),
            "final_cards": [],
            "_flow_pattern": "multi_step",
            "route_decision": "flow_handled",
            "total_cost_usd": 0.0,
            "total_tokens": 0,
        }

    structured = {
        "headline": _build_preview_headline(summary),
        "body": _summarise_warnings(warnings),
        "cards": [{
            "type": "week_plan_preview_capsule",
            "weekStart": flow.get("week_start", ""),
            "planItems": plan_items,
            "summary": summary,
            "warnings": warnings,
        }],
        "chips": [],
    }

    await save_flow_state(
        state.get("session_id", ""),
        state.get("user_id", ""),
        flow,
    )
    return {
        "final_response": json.dumps(structured),
        "final_cards": structured["cards"],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


def _build_preview_headline(summary: dict) -> str:
    training = int(summary.get("trainingSessions", 0))
    study = int(summary.get("studySessions", 0))
    total_min = int(summary.get("totalMinutes", 0))
    hours = round(total_min / 60, 1)
    if training == 0 and study == 0:
        return "Your week"
    return f"{training} training + {study} study · {hours}h"


def _summarise_warnings(warnings: list) -> str:
    if not warnings:
        return ""
    # Keep it short — show the first two, the UI card lists the rest.
    first_two = warnings[:2]
    return " ".join(
        w.get("message", "") if isinstance(w, dict) else str(w)
        for w in first_two
    ).strip()


# ── confirm_tool execution ──────────────────────────────────────────────
# This is the critical step the previous build was missing: when the
# athlete says "yes, lock it in", we actually PERSIST the session either
# by (a) updating an existing calendar_events.notes column with the drill
# list, or (b) creating a brand-new training event.

async def _execute_confirm_tool(flow: FlowState, state: TomoChatState) -> dict:
    """Execute the write tool for the multi-step flow.

    build_session    → create_event OR update_event with drill session_plan
    build_week_plan  → bridge POST /api/v1/week-plan/commit (batch insert)

    Returns the raw tool result (or an {"error": ...} dict on failure).
    Callers store this in flow.confirm_result for the completion card.
    """
    user_id = state.get("user_id")
    context = state.get("player_context")
    if not user_id or not context:
        return {"error": "missing user context"}

    # Week planner branch — commit via the dedicated endpoint. Keeps the
    # build_session path below untouched.
    if flow.intent_id == "build_week_plan":
        from app.agents.tools.bridge import bridge_post
        plan_items = flow.get("draft_plan_items") or []
        if not plan_items:
            return {"error": "no plan to commit — draft is empty"}
        payload = {
            "weekStart": flow.get("week_start", ""),
            "timezone": flow.get("timezone", "UTC"),
            "planItems": plan_items,
            "inputs": {
                "trainingMix": flow.get("training_mix", []),
                "studyMix": flow.get("study_mix", []),
                "modeId": flow.get("athlete_mode", "balanced"),
            },
        }
        return await bridge_post(
            "/api/v1/week-plan/commit",
            payload,
            user_id=user_id,
        )

    try:
        from app.agents.tools.timeline_tools import make_timeline_tools
        tools = make_timeline_tools(user_id, context)
    except Exception as e:
        logger.error(f"confirm_tool: failed to build timeline tools: {e}", exc_info=True)
        return {"error": "timeline tools unavailable"}

    drills_blob = flow.get("session_drills", {}) or {}
    drill_list = drills_blob.get("drills", []) if isinstance(drills_blob, dict) else []
    focus = flow.get("selected_focus") or "training"
    target_date = flow.get("target_date") or getattr(context, "today_date", "") or ""
    target_event_id = flow.get("target_event_id")

    # Build a structured session_plan JSONB payload. This is the source of
    # truth for drill data — mobile renders it in the EventEditScreen Session
    # Plan block. The notes field is left free for the athlete.
    structured_drills: list[dict] = []
    total_min = 0
    for d in drill_list:
        if not isinstance(d, dict):
            continue
        name = str(d.get("name", "Drill"))
        dur = int(d.get("duration_min", 0) or 0)
        intensity = str(d.get("intensity", "MODERATE")).upper()
        structured_drills.append({
            "name": name,
            "category": str(d.get("category", focus)),
            "durationMin": dur,
            "intensity": intensity,
            "description": str(d.get("description", ""))[:400],
        })
        total_min += dur

    session_plan_payload = {
        "builtBy": "tomo",
        "focus": str(focus),
        "totalMinutes": total_min,
        "drills": structured_drills,
    }

    if target_event_id:
        update_tool = next((t for t in tools if t.name == "update_event"), None)
        if not update_tool:
            return {"error": "update_event unavailable"}

        # ── Merge with existing drills instead of overwriting ──
        # The backend PATCH route replaces session_plan wholesale, so we
        # do the merge client-side in the flow. Pull the existing event's
        # session_plan from the cached calendar snapshot (step_check_calendar_result)
        # and append new drills to the existing list. Always append, never
        # replace -- avoids the "did Tomo just wipe my drills?!" data-loss
        # risk. If the user wants to start over they delete manually.
        existing_events = (flow.get("step_check_calendar_result", {}) or {}).get("events", []) or []
        existing_event = next(
            (ev for ev in existing_events if str(ev.get("id", "")) == str(target_event_id)),
            None,
        )
        existing_plan = (existing_event or {}).get("session_plan") if existing_event else None
        merged_drills: list[dict] = []
        merged_total = 0
        if isinstance(existing_plan, dict):
            prior = existing_plan.get("drills", []) if isinstance(existing_plan.get("drills"), list) else []
            for pd in prior:
                if isinstance(pd, dict):
                    merged_drills.append(pd)
                    merged_total += int(pd.get("durationMin", 0) or 0)
        merged_drills.extend(structured_drills)
        merged_total += total_min

        merged_payload = {
            "builtBy": "tomo",
            "focus": (existing_plan or {}).get("focus") or str(focus),
            "totalMinutes": merged_total,
            "drills": merged_drills,
        }

        logger.info(
            f"_execute_confirm_tool: merging drills -- existing={len(merged_drills) - len(structured_drills)} "
            f"new={len(structured_drills)} total={len(merged_drills)} totalMin={merged_total}"
        )

        try:
            return await update_tool.ainvoke({
                "event_id": target_event_id,
                "session_plan": merged_payload,
            })
        except Exception as e:
            logger.error(f"update_event failed: {e}", exc_info=True)
            return {"error": f"update_event failed: {str(e)[:120]}"}

    # Fresh session creation
    create_tool = next((t for t in tools if t.name == "create_event"), None)
    if not create_tool:
        return {"error": "create_event unavailable"}

    start_time = flow.get("selected_time") or "17:00"
    end_time = _add_minutes(start_time, total_min or 45)
    intensity_raw = str(drills_blob.get("intensity", "MODERATE") or "MODERATE").upper()
    if intensity_raw not in ("LIGHT", "MODERATE", "HARD"):
        intensity_raw = "MODERATE"

    # Phase 5: pull the pre-computed auto-link slug list and forward it
    # so the backend can resolve -> insert event_linked_programs in the
    # same request as the event insert. Create path only; the update
    # branch above intentionally does NOT auto-link (preserves manual
    # links on pre-existing sessions).
    linked_program_slugs_raw = flow.get("session_program_slugs") or []
    if not isinstance(linked_program_slugs_raw, list):
        linked_program_slugs_raw = []
    linked_program_slugs = [s for s in linked_program_slugs_raw if isinstance(s, str) and s]
    logger.info(
        f"build_session auto-link count={len(linked_program_slugs)} "
        f"slugs={linked_program_slugs}"
    )

    try:
        return await create_tool.ainvoke({
            "title": f"{focus.title()} Session",
            "event_type": "training",
            "date": target_date,
            "start_time": start_time,
            "end_time": end_time,
            "intensity": intensity_raw,
            "notes": "",
            "session_plan": session_plan_payload,
            "linked_program_slugs": linked_program_slugs,
        })
    except Exception as e:
        logger.error(f"create_event failed: {e}", exc_info=True)
        return {"error": f"create_event failed: {str(e)[:120]}"}


def _build_cancel_response() -> dict:
    """Response when user cancels the multi-step flow."""
    structured = {
        "headline": "All good, scrapped it",
        "body": "What's actually on your mind?",
        "cards": [],
        "chips": [
            {"label": "Build session", "message": "Build me a training session"},
            {"label": "Show schedule", "message": "What's on today?"},
        ],
    }

    return {
        "final_response": json.dumps(structured),
        "final_cards": [],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
        # Explicitly clear the pending write action so chat.py doesn't
        # re-emit it as pendingConfirmation on the next SSE event.
        "pending_write_action": None,
        "write_confirmed": False,
    }


def _build_error_response(step: StepDefinition) -> dict:
    """Response when a step fails."""
    structured = {
        "headline": "Hit a snag",
        "body": "Something tripped up while building your session. Want to try again?",
        "cards": [],
        "chips": [
            {"label": "Try again", "message": "Build me a training session"},
        ],
    }

    return {
        "final_response": json.dumps(structured),
        "final_cards": [],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


# ---- Helpers ---------------------------------------------------------------

def _chip_for_target_date(target_date: str, today_date: str) -> tuple[str, str]:
    """Return (label, message) for a schedule chip that routes to the
    same date the user just booked, not today.

    - target_date == today_date  -> handled by caller
    - target_date == tomorrow    -> "Show tomorrow" / "What's on tomorrow?"
    - target_date == any other   -> "Show <Weekday>" / "What's on <weekday>?"
                                    falling back to explicit ISO date if parsing fails.
    """
    from datetime import datetime
    try:
        td = datetime.strptime(target_date, "%Y-%m-%d")
        today_dt = datetime.strptime(today_date, "%Y-%m-%d")
    except (ValueError, TypeError):
        return ("Show schedule", f"What's on {target_date}?")

    delta = (td.date() - today_dt.date()).days
    if delta == 1:
        return ("Show tomorrow", "What's on tomorrow?")
    if delta == -1:
        return ("Show yesterday", "What was on yesterday?")
    # 2-6 days ahead: reference by weekday
    if 0 < delta <= 6:
        weekday = td.strftime("%A")
        return (f"Show {weekday}", f"What's on {weekday}?")
    return ("Show schedule", f"What's on {target_date}?")


def _get_user_message(state: TomoChatState) -> str:
    """Extract the latest user message from state."""
    from app.utils.message_helpers import get_msg_type, get_msg_content
    messages = state.get("messages", [])
    for msg in reversed(messages):
        if get_msg_type(msg) == "human":
            return get_msg_content(msg)
    return ""


def _extract_date_from_message(state: TomoChatState) -> Optional[str]:
    """Try to extract a date reference from the user message.
    Returns YYYY-MM-DD or None."""
    import re
    from datetime import datetime, timedelta

    msg = _get_user_message(state).lower()
    context = state.get("player_context")
    today = getattr(context, "today_date", None) if context else None

    if not today:
        return None

    today_dt = datetime.strptime(today, "%Y-%m-%d")

    # "day after tomorrow" / "after tomorrow" — check BEFORE plain "tomorrow"
    if "day after tomorrow" in msg or "after tomorrow" in msg or "day after tmrw" in msg:
        return (today_dt + timedelta(days=2)).strftime("%Y-%m-%d")

    # "in N days" / "N days from now"
    days_match = re.search(r"in (\d+) days?", msg) or re.search(r"(\d+) days? from now", msg)
    if days_match:
        try:
            n = int(days_match.group(1))
            if 0 <= n <= 60:
                return (today_dt + timedelta(days=n)).strftime("%Y-%m-%d")
        except ValueError:
            pass

    # "next week" → 7 days out
    if "next week" in msg:
        return (today_dt + timedelta(days=7)).strftime("%Y-%m-%d")

    # "today" / "tonight"
    if "today" in msg or "tonight" in msg or "this evening" in msg or "this morning" in msg:
        return today

    # "tomorrow" (plain — must come AFTER "after tomorrow" check above)
    if "tomorrow" in msg or "tmrw" in msg:
        return (today_dt + timedelta(days=1)).strftime("%Y-%m-%d")

    # Day names
    day_map = {
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
        "friday": 4, "saturday": 5, "sunday": 6,
    }
    for day_name, day_num in day_map.items():
        if day_name in msg:
            days_ahead = (day_num - today_dt.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7  # Next week's same day
            return (today_dt + timedelta(days=days_ahead)).strftime("%Y-%m-%d")

    # Explicit date YYYY-MM-DD
    date_match = re.search(r"\d{4}-\d{2}-\d{2}", msg)
    if date_match:
        return date_match.group()

    # No date keyword found -- DO NOT silently default to today. Returning
    # None forces the pick_date step to ask the athlete, preserving intent
    # ("create a training session" should not assume today).
    return None


def _match_selection(user_message: str, flow: FlowState) -> Optional[str]:
    """Match user message to a choice option value.

    Handles two scenarios:
    1. Fork response: user picked from fork options (stored in context_carry)
    2. Focus selection: user picked a training focus (speed, strength, etc.)
    """
    msg_lower = user_message.lower().strip()

    step = flow.current_step
    if not step:
        return None

    # ── Check fork options first (stored from previous fork step) ──
    # After the fork step advances, the fork result is in context_carry.
    # The user might be responding to fork options even though current step
    # is pick_focus (because fork auto-advanced past itself).
    #
    # Mobile sends the option's LABEL as the chat message (never the value).
    # Free-text users type natural language that includes label words.
    fork_data = flow.get("step_fork_fork", {})
    if isinstance(fork_data, dict) and fork_data.get("options"):
        # 1. Exact label match (mobile tap sends label verbatim)
        for opt in fork_data["options"]:
            label = opt.get("label", "").lower()
            if label and label == msg_lower:
                return opt.get("value")

        # 2. Label contained in message (user typed partial label)
        for opt in fork_data["options"]:
            label = opt.get("label", "").lower()
            if label and label in msg_lower:
                return opt.get("value")

        # 3. Fuzzy: word overlap (3+ words from label appear in message)
        for opt in fork_data["options"]:
            label = opt.get("label", "").lower()
            label_words = set(label.split())
            msg_words = set(msg_lower.split())
            if len(label_words & msg_words) >= 3:
                return opt.get("value")

        # 4. "new" / "different" / "add new" → new session
        if any(w in msg_lower for w in ("new", "different", "add new", "another")):
            return "new"

        # 5. If user responded with something gym-related and there's only
        #    one training event, default to it
        if any(w in msg_lower for w in ("build", "workout", "gym", "session")):
            training_options = [o for o in fork_data["options"] if o.get("value") != "new"]
            if len(training_options) == 1:
                return training_options[0].get("value")

    # ── Check focus areas ──
    # Mobile sends the label ("Speed", "Technical"…) as the chat message.
    # Free-text users type variations of the same label words.
    if step.id == "pick_focus":
        # 1. Label or value contained in message
        for area in FOCUS_AREAS:
            if area["value"] in msg_lower or area["label"].lower() in msg_lower:
                return area["value"]

        # 2. Numbered selection ("1", "2", etc.)
        if msg_lower.isdigit():
            idx = int(msg_lower) - 1
            if 0 <= idx < len(FOCUS_AREAS):
                return FOCUS_AREAS[idx]["value"]

        # 3. Fuzzy: first word match
        first_word = msg_lower.split()[0] if msg_lower else ""
        for area in FOCUS_AREAS:
            if first_word == area["value"] or first_word == area["label"].lower():
                return area["value"]

    return None


def _is_confirmation(msg: str) -> bool:
    """Check if user message is a confirmation."""
    confirmations = {
        "yes", "yeah", "yep", "yup", "confirm", "lock it in",
        "do it", "go ahead", "sounds good", "let's go", "perfect",
        "lock this in", "confirmed",
    }
    return msg.lower().strip() in confirmations or msg.lower().strip().startswith("yes")


def _is_rejection(msg: str) -> bool:
    """Check if user message is a rejection."""
    rejections = {"no", "nah", "cancel", "nevermind", "stop", "skip"}
    return msg.lower().strip() in rejections


# Obvious greetings / social bids — if seen mid-flow, the athlete is not
# responding to the current step and the flow should bail out so the main
# classifier can handle the message as a fresh turn.
_RESTART_GREETING_PATTERNS = (
    "hey tomo", "hi tomo", "hello tomo", "yo tomo", "sup tomo",
    "hey", "hi", "hello", "yo", "sup", "howdy",
    "good morning", "good afternoon", "good evening",
    "what's up", "whats up", "wassup",
)

# Action verbs that clearly signal a NEW intent, not a response to the
# current step. Matched against the start of the message.
#
# "show me" / "tell me" were REMOVED (April 2026) because they fire on
# legitimate mid-flow questions like "show me drill details for X" or
# "tell me about the dynamic stretching drill". The drill-detail
# passthrough at the top of execute_multi_step_continuation now handles
# those inline without restarting the flow.
_RESTART_VERB_PREFIXES = (
    "show my", "what's my", "whats my", "what is my",
    "how am i", "how's my", "hows my",
    "log ", "check ", "add ", "create ", "delete ", "cancel ",
    "what's on", "whats on", "what is on",
)


def _is_restart_signal(msg: str, flow: FlowState) -> bool:
    """Is this message clearly NOT a response to the current flow step?

    We only bail out on HIGH-CONFIDENCE signals so we never drop legit
    responses (option labels, confirmations, rejections).

    Rules (in order):
      1. Never a restart if it exactly matches a fork option label or
         a FOCUS_AREA label -- those are valid in-flow responses.
      2. Never a restart if it's a confirmation or rejection.
      3. Restart if the message is a bare greeting token (<= 4 words and
         the FIRST word matches a greeting pattern).
      4. Restart if the message starts with a new-intent verb prefix.
    """
    cleaned = msg.lower().strip()
    if not cleaned:
        return False

    # 1. Don't hijack valid in-flow responses.
    fork_data = flow.get("step_fork_fork", {})
    if isinstance(fork_data, dict):
        for opt in fork_data.get("options", []) or []:
            if (opt.get("label", "") or "").lower() == cleaned:
                return False
    for area in FOCUS_AREAS:
        if area["label"].lower() == cleaned or area["value"] == cleaned:
            return False

    # 2. Don't hijack confirm/reject
    if _is_confirmation(msg) or _is_rejection(msg):
        return False

    # 3. Bare greetings (short messages starting with a greeting token)
    words = cleaned.split()
    if len(words) <= 4:
        for pat in _RESTART_GREETING_PATTERNS:
            if cleaned == pat or cleaned.startswith(pat + " ") or cleaned.startswith(pat + ","):
                return True

    # 4. Message starts with a clearly new-intent verb
    for prefix in _RESTART_VERB_PREFIXES:
        if cleaned.startswith(prefix):
            return True

    return False


# ── Mid-flow drill detail passthrough (Layer C1) ────────────────────────
# When an athlete asks about a drill while reviewing a session_plan, we
# answer inline using the data we already have in session_drills. The
# flow state stays exactly where it was so the confirmation path is
# uninterrupted.

# Patterns that look like drill-detail questions. Any of these AND a
# fuzzy match against a drill name in session_drills triggers the inline
# passthrough.
_DRILL_QUESTION_PATTERNS = (
    "drill detail", "drill details",
    "show me drill", "show me the drill", "show me details",
    "tell me about", "tell me more about", "more about",
    "what is the", "what's the", "whats the",
    "explain the", "explain this", "explain that",
    "how does the", "how does this",
    "describe the", "describe this",
    "what about the", "more on the",
    "info on the", "info about",
    "show me more on",
)


def _detect_drill_question(msg: str, flow: FlowState) -> Optional[dict]:
    """If the message looks like a drill-detail question AND the drill
    name fuzzy-matches something in session_drills, return that drill.

    Returns the drill dict (from session_drills.drills[*]) or None.
    """
    if not msg:
        return None

    drills_blob = flow.get("session_drills") or {}
    if not isinstance(drills_blob, dict):
        return None
    drills = drills_blob.get("drills", []) or []
    if not drills:
        return None

    lowered = msg.lower().strip()

    # 1. Must contain at least one drill-question pattern
    has_pattern = any(p in lowered for p in _DRILL_QUESTION_PATTERNS)
    if not has_pattern:
        return None

    # 2. Fuzzy match drill name against the message
    # First try exact substring match on the full name
    best = None
    best_score = 0
    for d in drills:
        if not isinstance(d, dict):
            continue
        name = str(d.get("name", "")).lower().strip()
        if not name:
            continue
        if name in lowered:
            return d  # exact match wins
        # Word-overlap score for fuzzy matches like "dynamic stretching"
        # matching "Dynamic Stretching Circuit"
        name_words = set(w for w in name.split() if len(w) > 3)
        msg_words = set(lowered.split())
        overlap = len(name_words & msg_words)
        if overlap > best_score and overlap >= 2:
            best = d
            best_score = overlap
    return best


async def _build_drill_detail_response(
    flow: FlowState,
    state: TomoChatState,
    drill: dict,
) -> dict:
    """Answer an inline drill-detail question without advancing the flow.

    Emits a proper `drill_card` (matches the DrillCard TypeScript interface
    the mobile ResponseRenderer already ships). The card includes name,
    description, duration, intensity, equipment pills, instructions and
    tags. Flow state is re-saved at the exact step they were on so the
    athlete can resume cleanly after reading the detail.
    """
    name = str(drill.get("name", "This drill"))
    category = str(drill.get("category", "training"))
    duration = int(drill.get("duration_min", 0) or 0)

    # Mobile DrillCard expects lowercase intensity: 'light'|'moderate'|'hard'
    raw_intensity = str(drill.get("intensity", "MODERATE")).lower()
    if raw_intensity in ("rest", "light"):
        intensity = "light"
    elif raw_intensity in ("hard", "high"):
        intensity = "hard"
    else:
        intensity = "moderate"

    description = str(drill.get("description", "")).strip()

    # Pull structured extras if present (drills from training_drills table
    # may carry these; fallback template drills won't). Never crash on a
    # missing field — DrillCard renders a minimal card with just name/desc.
    equipment = drill.get("equipment") or []
    if not isinstance(equipment, list):
        equipment = []

    instructions = drill.get("instructions") or drill.get("coaching_cues") or []
    if isinstance(instructions, str):
        # Split a prose instruction blob into bulleted steps if needed
        instructions = [s.strip() for s in instructions.split("\n") if s.strip()]
    if not isinstance(instructions, list):
        instructions = []

    tags = drill.get("tags") or []
    if not isinstance(tags, list):
        tags = []
    # Always surface the category as a tag so athletes see what bucket
    # this drill sits in (technical / endurance / recovery etc.)
    if category and category.lower() not in [str(t).lower() for t in tags]:
        tags = [category] + list(tags)

    progression_count = int(drill.get("progression_count", 0) or 0)

    drill_card = {
        "type": "drill_card",
        "drillId": str(drill.get("id") or drill.get("drill_id") or ""),
        "name": name,
        "description": description[:400] if description else "",
        "category": category,
        "duration": duration,
        "intensity": intensity,
        "equipment": [str(e) for e in equipment],
        "instructions": [str(s) for s in instructions],
        "tags": [str(t) for t in tags],
        "progressionCount": progression_count,
    }

    # Resume chips: match the current step so the flow feels intact.
    current = flow.current_step
    if current and current.card == "time_picker":
        chips = [
            {"label": "Looks good", "message": "Looks good"},
            {"label": "Pick a time", "message": "Pick a time"},
        ]
    elif current and current.card == "confirm_card":
        chips = [
            {"label": "Confirm", "message": "Yes, lock it in"},
            {"label": "Cancel", "message": "Cancel"},
        ]
    else:
        chips = [
            {"label": "Looks good", "message": "Looks good"},
            {"label": "Make it lighter", "message": "Can you make it lighter?"},
        ]

    structured = {
        "headline": name,
        "body": "",
        "cards": [drill_card],
        "chips": chips,
    }

    # Re-save state at the current step (no advance).
    await save_flow_state(
        state.get("session_id", ""),
        state.get("user_id", ""),
        flow,
    )

    return {
        "final_response": json.dumps(structured),
        "final_cards": [drill_card],
        "_flow_pattern": "multi_step",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


def _extract_time(time_str: str) -> str:
    """Extract and format time from ISO timestamp."""
    import re
    match = re.search(r"(\d{2}):(\d{2})", time_str or "")
    if match:
        h, m = int(match.group(1)), int(match.group(2))
        period = "PM" if h >= 12 else "AM"
        h12 = h % 12 or 12
        return f"{h12}:{m:02d} {period}"
    return ""
