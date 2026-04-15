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
            for i, s in enumerate(flow.steps):
                if s.id == "check_calendar":
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
            selected_time = _match_time(user_message)
            if selected_time:
                flow.store("selected_time", selected_time)
                flow.advance()
            else:
                return await _present_time_picker(flow, state)

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
            # via flow_context.
            if not fork_result.get("needs_choice"):
                flow.store("fork_choice", fork_result.get("choice", "new"))
                flow.store("calendar_empty", True)
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

        # ── Time picker (new) ──
        # Only runs for fresh sessions. When attaching drills to an
        # existing calendar event we skip this step entirely.
        if step.card == "time_picker":
            if flow.get("target_event_id"):
                flow.advance()
                continue
            if flow.get("selected_time"):
                flow.advance()
                continue
            return await _present_time_picker(flow, state)

        # ── Confirm card ──
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

    (April 2026 rearchitecture) The old stated-focus pre-filter is gone.
    Athletes ALWAYS see what's on their calendar for the target date so
    they can choose whether to attach drills to an existing session
    (update_event.notes) or book a new one (create_event). The only
    case we auto-advance silently is a completely empty calendar.
    """
    condition = step.condition

    if condition == "existing_training_sessions":
        events_result = flow.get("step_check_calendar_result", {})
        events = events_result.get("events", [])
        training_events = [
            e for e in events
            if e.get("event_type") in ("training", "match")
        ]

        if training_events:
            options = []
            for ev in training_events:
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

        # Calendar genuinely empty for target_date -- skip silently,
        # build_drills will surface the "your day is open" framing.
        return {"needs_choice": False, "choice": "new", "calendar_empty": True}

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
    # calendar_empty / attaching_existing / fresh path each get their own.
    if attaching_existing:
        fallback_headline = f"Got your {focus} dialled in"
        fallback_body = f"{len(drills)} drills, {total_min} min. Say the word and I'll save them."
    elif calendar_empty:
        fallback_headline = f"Here's a clean {focus} block"
        fallback_body = f"{len(drills)} drills, {total_min} min. Tell me when you want it."
    else:
        fallback_headline = f"Your {focus} is ready"
        fallback_body = f"{len(drills)} drills, {total_min} min. Scan it, then we roll."

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
        # Chips tuned to the new flow: if attaching to existing event we
        # go straight to confirm next; if fresh, the next step is a time
        # picker. Either way "Looks good" advances the flow.
        "chips": [
            {"label": "Looks good", "message": "Looks good"},
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
    """
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

    structured = {
        "headline": headline,
        "body": body,
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
        # Booking succeeded -- clear the pending write action the
        # supervisor injected from confirmed_action so chat.py does
        # not re-emit it as pendingConfirmation. Without this the
        # mobile would stay stuck in confirm-button state after the
        # session is booked.
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
    """Render the time picker card for a brand-new fresh session."""
    target_date = flow.get("target_date", "")
    date_hint = f" for {target_date}" if target_date else ""

    structured = {
        "headline": f"When do you want to run it{date_hint}?",
        "body": "Pick a slot that fits around school and recovery.",
        "cards": [{
            "type": "time_picker",
            "options": _TIME_PICKER_OPTIONS,
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


def _match_time(msg: str) -> Optional[str]:
    """Best-effort parse of a time selection. Returns HH:MM or None."""
    import re
    if not msg:
        return None
    m = msg.lower().strip()

    # Exact label/value match against preset options
    for opt in _TIME_PICKER_OPTIONS:
        if opt["value"] == m or opt["label"].lower() == m:
            return opt["value"]
    for opt in _TIME_PICKER_OPTIONS:
        if opt["value"] in m or opt["label"].lower() in m:
            return opt["value"]

    # HH:MM explicit
    hm = re.search(r"\b(\d{1,2}):(\d{2})\b", m)
    if hm:
        h = int(hm.group(1))
        mm = int(hm.group(2))
        if 0 <= h < 24 and 0 <= mm < 60:
            return f"{h:02d}:{mm:02d}"

    # "7am", "5 pm", "7 o'clock"
    ampm = re.search(r"\b(\d{1,2})\s*(am|pm)\b", m)
    if ampm:
        h = int(ampm.group(1))
        period = ampm.group(2)
        if period == "pm" and h < 12:
            h += 12
        if period == "am" and h == 12:
            h = 0
        if 0 <= h < 24:
            return f"{h:02d}:00"

    # Keyword-only
    if "morning" in m:
        return "07:00"
    if "afternoon" in m:
        return "15:00"
    if "evening" in m:
        return "17:00"
    if "night" in m:
        return "19:00"
    return None


def _add_minutes(hhmm: str, minutes: int) -> str:
    """Add minutes to an HH:MM clock string, clamped to 24h."""
    from datetime import datetime, timedelta
    try:
        t = datetime.strptime(hhmm, "%H:%M")
        return (t + timedelta(minutes=max(0, int(minutes)))).strftime("%H:%M")
    except (ValueError, TypeError):
        return hhmm


# ── confirm_tool execution ──────────────────────────────────────────────
# This is the critical step the previous build was missing: when the
# athlete says "yes, lock it in", we actually PERSIST the session either
# by (a) updating an existing calendar_events.notes column with the drill
# list, or (b) creating a brand-new training event.

async def _execute_confirm_tool(flow: FlowState, state: TomoChatState) -> dict:
    """Execute the write tool for the build_session flow.

    - target_event_id set  → update_event with notes=drill_markdown
    - no target_event_id   → create_event with title/date/start_time/notes

    Returns the raw tool result (or an {"error": ...} dict on failure).
    Callers store this in flow.confirm_result for the completion card.
    """
    user_id = state.get("user_id")
    context = state.get("player_context")
    if not user_id or not context:
        return {"error": "missing user context"}

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

    # Build a plain-text drill list for the notes column. Capped to a
    # reasonable length so we never blow up the calendar_events.notes
    # column or any downstream consumer.
    header_line = f"{focus.title()} session -- built by Tomo"
    drill_lines = [header_line]
    total_min = 0
    for i, d in enumerate(drill_list, start=1):
        if not isinstance(d, dict):
            continue
        name = str(d.get("name", "Drill"))
        dur = int(d.get("duration_min", 0) or 0)
        intensity = str(d.get("intensity", "MODERATE"))
        drill_lines.append(f"{i}. {name} ({dur}min, {intensity})")
        total_min += dur
    notes_blob = "\n".join(drill_lines)[:2000]

    if target_event_id:
        update_tool = next((t for t in tools if t.name == "update_event"), None)
        if not update_tool:
            return {"error": "update_event unavailable"}
        try:
            return await update_tool.ainvoke({
                "event_id": target_event_id,
                "notes": notes_blob,
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

    try:
        return await create_tool.ainvoke({
            "title": f"{focus.title()} Session",
            "event_type": "training",
            "date": target_date,
            "start_time": start_time,
            "end_time": end_time,
            "intensity": intensity_raw,
            "notes": notes_blob,
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
