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


def _evaluate_fork(step: StepDefinition, flow: FlowState) -> dict:
    """Evaluate a fork condition against context_carry data."""
    condition = step.condition

    if condition == "existing_training_sessions":
        # Check if get_today_events found training sessions
        events_result = flow.get("step_check_calendar_result", {})
        events = events_result.get("events", [])
        training_events = [
            e for e in events
            if e.get("event_type") in ("training", "match")
        ]

        if training_events:
            # Build choices from existing events
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
            # No existing sessions -- skip to focus picker
            flow.store("fork_choice", "new")
            return {"needs_choice": False, "choice": "new"}

    return {"needs_choice": False}


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
    headline = headline_map.get(step.id, "Pick one")

    structured = {
        "headline": headline,
        "body": "",
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

    structured = {
        "headline": "What do you want to do?",
        "body": "",
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

    # Build session_plan card
    drills = result.get("drills", [])
    card_drills = []
    for d in drills:
        card_drills.append({
            "name": d.get("name", "Drill"),
            "category": d.get("category", "training"),
            "duration_min": d.get("duration_min", 10),
            "intensity": d.get("intensity", "MODERATE"),
            "description": d.get("description", ""),
        })

    headline = f"{focus.title()} session -- {len(drills)} drills"
    total_min = sum(d.get("duration_min", 0) for d in drills)

    structured = {
        "headline": headline,
        "body": f"About {total_min} minutes total. Ready to lock this in?",
        "cards": [{
            "type": "session_plan",
            "category": focus,
            "intensity": result.get("intensity", "MODERATE"),
            "total_duration_min": total_min,
            "drills": card_drills,
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

    headline = f"Add {focus} session to your timeline?"

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

    structured = {
        "headline": "",
        "body": "",
        "cards": [{
            "type": "confirm_card",
            "headline": headline,
            "body": f"{date_display} -- {total_min} minutes",
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

    # "today"
    if "today" in msg:
        return today

    # "tomorrow"
    if "tomorrow" in msg:
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
