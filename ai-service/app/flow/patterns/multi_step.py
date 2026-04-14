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

    # ── Handle user selection for choice steps ──
    if current.card == "choice_card":
        # If this is pick_focus and the athlete already stated a focus
        # upfront, we should never be standing on this step in the first
        # place. Skip it silently and let _execute_current_step auto-advance.
        if current.id == "pick_focus" and flow.get("selected_focus"):
            flow.advance()
        else:
            selection = _match_selection(user_message, flow)
            if selection:
                flow.store(f"step_{current.id}_selection", selection)
                if current.id == "pick_focus":
                    flow.store("selected_focus", selection)
                flow.advance()
            else:
                # User said something that doesn't match options -- re-present
                return await _present_step(flow, state)

    # Handle confirmation step
    elif current.card == "confirm_card":
        if _is_confirmation(user_message):
            flow.advance()
        else:
            # Not confirmed, re-present or cancel
            if _is_rejection(user_message):
                await clear_flow_state(
                    state.get("session_id", ""),
                    state.get("user_id", ""),
                )
                return _build_cancel_response()
            return await _present_step(flow, state)

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
      - A choice_card or confirm_card needs user input
      - The flow is complete
      - An error occurs
    """
    max_auto_advance = 5  # Safety limit

    for _ in range(max_auto_advance):
        step = flow.current_step
        if not step:
            # Flow complete
            await clear_flow_state(
                state.get("session_id", ""),
                state.get("user_id", ""),
            )
            return _build_completion_response(flow)

        # Tool step: call tool, store result, auto-advance
        if step.tool and not step.card:
            tool_result = await _call_step_tool(step, flow, state)
            if tool_result is None:
                return _build_error_response(step)
            flow.store(f"step_{step.id}_result", tool_result)
            flow.advance()
            continue

        # Fork step: evaluate condition, auto-advance
        if step.condition:
            fork_result = _evaluate_fork(step, flow)
            flow.store(f"step_{step.id}_fork", fork_result)
            flow.advance()

            # If fork produces a choice, present it
            if isinstance(fork_result, dict) and fork_result.get("needs_choice"):
                # Insert a choice presentation at the current step
                return await _present_fork_choice(flow, fork_result, state)
            continue

        # Choice card step: present options and wait for user
        if step.card == "choice_card":
            # Skip pick_focus entirely if the athlete already stated a focus
            # in the opening message ("I want technical drills tomorrow").
            # Never ask them twice.
            if step.id == "pick_focus" and flow.get("selected_focus"):
                logger.info(
                    f"Multi-step: skipping pick_focus, selected_focus="
                    f"{flow.get('selected_focus')}"
                )
                flow.advance()
                continue
            return await _present_step(flow, state)

        # Session plan card: build and present
        if step.card == "session_plan":
            return await _build_session_step(step, flow, state)

        # Confirm card step: present confirmation and wait
        if step.card == "confirm_card":
            return await _present_confirm(flow, state)

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

    If the athlete stated a focus in their opening message
    (`selected_focus` + `focus_was_stated`), we filter existing training
    events to ones matching that focus. If nothing matches, we skip the
    fork entirely and route straight to build_drills -- no point asking
    "build for Speed Session?" when they said "technical drills".
    """
    condition = step.condition

    if condition == "existing_training_sessions":
        # Check if get_today_events found training sessions
        events_result = flow.get("step_check_calendar_result", {})
        events = events_result.get("events", [])
        training_events = [
            e for e in events
            if e.get("event_type") in ("training", "match")
        ]

        # If the athlete stated a focus, only offer events matching it.
        stated_focus = flow.get("selected_focus") if flow.get("focus_was_stated") else None
        if stated_focus:
            matched = [e for e in training_events if _event_matches_focus(e, stated_focus)]
            if not matched:
                # No existing events line up with the stated focus --
                # skip the fork and go straight to building a new session.
                flow.store("fork_choice", "new")
                logger.info(
                    f"Multi-step: focus '{stated_focus}' stated, no matching "
                    f"events -- skipping fork"
                )
                return {"needs_choice": False, "choice": "new"}
            training_events = matched

        if training_events:
            # Build choices from (optionally filtered) existing events
            options = []
            for ev in training_events:
                title = ev.get("title", "Session")
                time_str = _extract_time(ev.get("start_time", ""))
                options.append({
                    "label": f"Build for {title} at {time_str}",
                    "value": str(ev.get("id", "")),  # str() — DB returns uuid.UUID, not JSON serializable
                    "description": f"Add drills to your {title.lower()}",
                })
            options.append({
                "label": "Add new session",
                "value": "new",
                "description": "Create a brand new training session",
            })
            return {"needs_choice": True, "options": options}
        else:
            # No existing sessions -- skip to focus picker (or straight to
            # build_drills if focus already stated)
            flow.store("fork_choice", "new")
            return {"needs_choice": False, "choice": "new"}

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
_FLOW_RAG_TIMEOUT_S = 1.5


async def _retrieve_session_rag(
    focus: str,
    state: TomoChatState,
) -> str:
    """Fetch sports-science chunks scoped to the session focus + context.

    Returns formatted RAG text (markdown) or empty string on any failure,
    timeout, or disabled flag. Never raises -- callers must always have a
    deterministic fallback.

    Uses the shared `_reformulate_query` helper from rag_retrieval.py so
    there's a single source of truth for how build_session queries are
    expanded (enforces intent registry -> query rule once).
    """
    if not _FLOW_RAG_ENABLED:
        return ""
    if not focus or focus == "general":
        return ""

    context = state.get("player_context")
    if not context:
        return ""

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
        cost = getattr(result, "retrieval_cost_usd", 0.0)
        logger.info(
            f"build_session rag chunks={chunk_count} "
            f"cost=${cost:.5f} latency={elapsed_ms:.0f}ms focus={focus}"
        )

        return getattr(result, "formatted_text", "") or ""

    except asyncio.TimeoutError:
        logger.warning(
            f"build_session rag timeout "
            f"(>{_FLOW_RAG_TIMEOUT_S}s) focus={focus} -- proceeding without RAG"
        )
        return ""
    except Exception as e:
        logger.warning(
            f"build_session rag failed focus={focus}: {e} -- proceeding without RAG"
        )
        return ""


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

    # Build session_plan card -- field names MUST match the mobile
    # SessionPlanCard component in ResponseRenderer.tsx (title,
    # totalDuration, items, readiness, item.duration). Anything else
    # renders a blank box on mobile.
    drills = result.get("drills", [])
    card_items = []
    for d in drills:
        card_items.append({
            "name": d.get("name", "Drill"),
            "category": d.get("category", "training"),
            "duration": d.get("duration_min", 10),
            "intensity": d.get("intensity", "MODERATE"),
            "reason": d.get("description", ""),
            "drillId": d.get("id") or d.get("drill_id"),
        })

    fallback_headline = f"{focus.title()} session -- {len(drills)} drills"
    total_min = sum(d.get("duration_min", 0) for d in drills)
    fallback_body = f"About {total_min} minutes total. Ready to lock this in?"

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
    rag_text = await _retrieve_session_rag(focus, state)

    headline, body = await _warm_text(
        step_kind="session_plan",
        flow_context={
            "focus": focus,
            "drill_count": len(drills),
            "total_minutes": total_min,
            "intensity": result.get("intensity", "MODERATE"),
            "target_date": flow.get("target_date", ""),
            "readiness": flow.get("readiness", ""),
        },
        state=state,
        fallback_headline=fallback_headline,
        fallback_body=fallback_body,
        rag_context=rag_text,
    )

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
        "chips": [
            {"label": "Lock this in", "message": "Yes, lock it in"},
            {"label": "Make it lighter", "message": "Can you make it lighter?"},
        ],
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
        "total_cost_usd": 0.0,
        "total_tokens": 0,
        "tool_calls": [{"name": "get_training_session", "result": "success"}],
    }


async def _present_confirm(flow: FlowState, state: TomoChatState) -> dict:
    """Present a confirmation card for the built session."""
    drills = flow.get("session_drills", {})
    focus = flow.get("selected_focus", "training")
    target_date = flow.get("target_date") or flow.get("today_date", "")

    fallback_card_headline = f"Add {focus} session to your timeline?"

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

    card_headline, card_body = await _warm_text(
        step_kind="confirm",
        flow_context={
            "focus": focus,
            "drill_count": len(drills.get("drills", [])),
            "total_minutes": total_min,
            "date": date_display,
        },
        state=state,
        fallback_headline=fallback_card_headline,
        fallback_body=f"{date_display} -- {total_min} minutes",
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
            },
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


def _build_completion_response(flow: FlowState) -> dict:
    """Build the final response when all steps are complete."""
    focus = flow.get("selected_focus", "training")

    structured = {
        "headline": f"{focus.title()} session locked in",
        "body": "Show up, put the work in, and come tell me how it went.",
        "cards": [],
        "chips": [
            {"label": "Show schedule", "message": "What's on today?"},
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
    }


def _build_cancel_response() -> dict:
    """Response when user cancels the multi-step flow."""
    structured = {
        "headline": "No worries -- cancelled",
        "body": "What else can I help with?",
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

    return today  # Default to today


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
_RESTART_VERB_PREFIXES = (
    "show me", "show my", "what's my", "whats my", "what is my",
    "how am i", "how's my", "hows my",
    "log ", "check ", "add ", "create ", "delete ", "cancel ",
    "tell me", "what's on", "whats on", "what is on",
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
