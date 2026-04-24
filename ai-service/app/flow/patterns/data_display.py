"""
Tomo AI Service -- Data Display Pattern
Tool call + card builder + deterministic headline.

Flow:
  1. Call the registered tool (e.g., get_readiness_detail)
  2. Pass tool result to the matching card builder
  3. Use deterministic headline/chips (optionally Haiku for body)
  4. Return structured response

Cost: $0 (deterministic) or ~$0.0003 (with optional Haiku body text).
Latency: ~50-200ms (DB query + card build).
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from app.flow.registry import FlowConfig
from app.models.state import TomoChatState

logger = logging.getLogger("tomo-ai.flow.data_display")


# Tool name → (card_builder, headline_builder, chip_builder)
# Each builder is a function that takes tool result dict and returns its output.
_TOOL_BUILDERS: dict[str, dict[str, Any]] = {}


def _register_builders():
    """Lazy-load card builders to avoid circular imports."""
    global _TOOL_BUILDERS
    if _TOOL_BUILDERS:
        return

    from app.flow.card_builders.readiness import (
        build_readiness_card,
        build_readiness_headline,
        build_readiness_chips,
    )
    from app.flow.card_builders.schedule import (
        build_schedule_card,
        build_week_schedule_cards,
        build_schedule_headline,
        build_week_headline,
        build_schedule_chips,
        build_week_chips,
    )
    from app.flow.card_builders.streak import (
        build_streak_card,
        build_streak_headline,
        build_streak_chips,
    )
    from app.flow.card_builders.load import (
        build_load_card,
        build_load_headline,
        build_load_chips,
    )
    from app.flow.card_builders.test_history import (
        build_test_history_card,
        build_test_history_headline,
        build_test_history_chips,
    )
    from app.flow.card_builders.conflicts import (
        build_conflicts_card,
        build_conflicts_headline,
        build_conflicts_chips,
    )
    from app.flow.card_builders.programs import (
        build_program_cards,
        build_programs_headline,
        build_programs_chips,
    )

    _TOOL_BUILDERS["get_readiness_detail"] = {
        "card": build_readiness_card,
        "headline": build_readiness_headline,
        "chips": build_readiness_chips,
    }
    _TOOL_BUILDERS["get_today_events"] = {
        "card": build_schedule_card,
        "headline": build_schedule_headline,
        "chips": build_schedule_chips,
    }
    _TOOL_BUILDERS["get_week_schedule"] = {
        "card": lambda data: build_week_schedule_cards(data),
        "headline": build_week_headline,
        "chips": lambda _data: build_week_chips(),
    }
    _TOOL_BUILDERS["get_consistency_score"] = {
        "card": build_streak_card,
        "headline": build_streak_headline,
        "chips": build_streak_chips,
    }
    _TOOL_BUILDERS["get_dual_load_score"] = {
        "card": build_load_card,
        "headline": build_load_headline,
        "chips": build_load_chips,
    }
    _TOOL_BUILDERS["get_test_results"] = {
        "card": build_test_history_card,
        "headline": build_test_history_headline,
        "chips": build_test_history_chips,
    }
    _TOOL_BUILDERS["detect_load_collision"] = {
        "card": build_conflicts_card,
        "headline": build_conflicts_headline,
        "chips": build_conflicts_chips,
    }
    _TOOL_BUILDERS["get_my_programs"] = {
        "card": build_program_cards,
        "headline": build_programs_headline,
        "chips": build_programs_chips,
    }


async def execute_data_display(config: FlowConfig, state: TomoChatState) -> dict:
    """Execute the data_display flow pattern.

    1. Create the tool via factory
    2. Extract tool args from user message (e.g. target date)
    3. Call the tool (DB query) with extracted args
    4. Build card from tool result
    5. Build headline + chips deterministically
    6. Return structured response

    Returns state update dict, or empty dict on failure (fall through to agent).
    """
    t0 = time.monotonic()
    _register_builders()

    tool_name = config.tool
    if not tool_name:
        logger.error("data_display: no tool specified in FlowConfig")
        return {}

    user_id = state.get("user_id")
    context = state.get("player_context")
    if not user_id or not context:
        logger.error("data_display: missing user_id or player_context")
        return {}

    # Extract tool args from user message (date, start_date, etc.)
    tool_args = _extract_tool_args(tool_name, state, context)

    # 1. Create the tool via factory and find by name
    tool_result = await _call_tool(tool_name, user_id, context, tool_args=tool_args)
    if tool_result is None:
        return {}  # Fall through to agent pipeline

    # Check for error response from tool
    if isinstance(tool_result, dict) and tool_result.get("error"):
        return _build_error_response(tool_name, tool_result)

    # Snapshot empty → same path as TypeScript handleShowPrograms: call recommendation engine
    tool_calls_log: list[dict] = [{"name": tool_name, "result": "success"}]
    if tool_name == "get_my_programs" and isinstance(tool_result, dict):
        snap_programs = tool_result.get("programs") or []
        if len(snap_programs) == 0:
            rec = await _call_tool(
                "get_training_program_recommendations", user_id, context, tool_args={}
            )
            if rec and isinstance(rec, dict) and not rec.get("error"):
                rec_progs = rec.get("programs") or []
                if rec_progs:
                    tool_result = {
                        "programs": rec_progs[:5],
                        "dataStatus": "recommendation_fallback",
                    }
                    tool_calls_log.append(
                        {
                            "name": "get_training_program_recommendations",
                            "result": "success",
                        }
                    )
                    logger.info(
                        "data_display: get_my_programs empty — using "
                        f"{len(rec_progs[:5])} program(s) from recommendation engine"
                    )

    # 2. Build card from tool result
    builders = _TOOL_BUILDERS.get(tool_name)
    if not builders:
        logger.warning(f"data_display: no builders for tool '{tool_name}'")
        return {}

    # For today's schedule, hide events that already finished so the
    # card shows active + upcoming only. Shared helper keeps format_response
    # and data_display in lockstep.
    if tool_name == "get_today_events" and isinstance(tool_result, dict):
        from app.flow.card_builders.schedule import filter_active_and_upcoming
        filtered = filter_active_and_upcoming(
            tool_result.get("events", []) or [],
            tool_result.get("date", ""),
            context,
        )
        tool_result = {**tool_result, "events": filtered, "total": len(filtered)}

    card_result = builders["card"](tool_result)

    # Handle both single card and list of cards
    if isinstance(card_result, list):
        cards = [c for c in card_result if c]
    elif card_result:
        cards = [card_result]
    else:
        cards = []

    # 3. Build headline + chips deterministically
    headline = builders["headline"](tool_result)
    chips = builders["chips"](tool_result)

    # 4. Optional: generate warm body text with Haiku
    body = ""
    if tool_name == "get_my_programs" and not cards and isinstance(tool_result, dict):
        body = (tool_result.get("hint") or "").strip() or (
            "Your personalized programs are still being prepared — open the Training tab or check back shortly."
        )
    total_cost = 0.0
    total_tokens = 0

    # Try optional Haiku text generation (disabled by default for $0)
    try:
        from app.flow.patterns.text_generator import generate_warm_text
        warm = await generate_warm_text(
            intent_id=state.get("intent_id", ""),
            card_data=cards[0] if cards else {},
            player_name=getattr(context, "first_name", ""),
            sport=getattr(context, "sport", ""),
        )
        if warm:
            headline = warm.get("headline") or headline
            body = warm.get("body") or ""
            # Haiku cost estimate: ~200 tokens in + 200 out
            total_cost = 0.0003
            total_tokens = 400
    except Exception as e:
        logger.debug(f"Text generation skipped: {e}")

    # 5. Build structured response
    structured = {
        "headline": headline,
        "body": body,
        "cards": cards,
        "chips": chips[:2],
    }

    elapsed = (time.monotonic() - t0) * 1000
    logger.info(
        f"Data display: {tool_name} -> {len(cards)} card(s) "
        f"({elapsed:.0f}ms, ${total_cost:.4f})"
    )

    return {
        "final_response": json.dumps(structured),
        "final_cards": cards,
        "_flow_pattern": "data_display",
        "total_cost_usd": total_cost,
        "total_tokens": total_tokens,
        "tool_calls": tool_calls_log,
    }


async def _call_tool(tool_name: str, user_id: str, context, tool_args: dict | None = None) -> dict | None:
    """Create and call a tool by name. Returns tool result or None on failure."""
    try:
        # Determine which factory to use based on tool name
        if tool_name in (
            "get_readiness_detail",
            "get_dual_load_score",
            "get_my_programs",
            "get_training_program_recommendations",
        ):
            from app.agents.tools.output_tools import make_output_tools
            tools = make_output_tools(user_id, context)
        elif tool_name in ("get_today_events", "get_week_schedule", "detect_load_collision"):
            from app.agents.tools.timeline_tools import make_timeline_tools
            tools = make_timeline_tools(user_id, context)
        elif tool_name in ("get_consistency_score",):
            from app.agents.tools.mastery_tools import make_mastery_tools
            tools = make_mastery_tools(user_id, context)
        elif tool_name in ("get_test_results",):
            from app.agents.tools.testing_benchmark_tools import make_testing_benchmark_tools
            tools = make_testing_benchmark_tools(user_id, context)
        else:
            logger.error(f"data_display: unknown tool '{tool_name}'")
            return None

        # Find the tool by name
        target = None
        for t in tools:
            if t.name == tool_name:
                target = t
                break

        if not target:
            logger.error(f"data_display: tool '{tool_name}' not found in factory output")
            return None

        # Call the tool (LangChain @tool async invocation) with extracted args
        invoke_args = tool_args or {}
        if invoke_args:
            logger.info(f"data_display: calling {tool_name} with args={invoke_args}")
        result = await target.ainvoke(invoke_args)
        return result

    except Exception as e:
        logger.error(f"data_display: tool call failed: {e}", exc_info=True)
        return None


def _build_error_response(tool_name: str, error_data: dict) -> dict:
    """Build a friendly response when the tool returns an error."""
    suggestion = error_data.get("suggestion", "")

    error_headlines = {
        "get_readiness_detail": "No check-in yet today",
        "get_today_events": "Couldn't load your schedule",
        "get_week_schedule": "Couldn't load your week",
        "get_consistency_score": "Couldn't load your streak",
        "get_dual_load_score": "Couldn't load your training load",
        "get_test_results": "No test results found",
        "detect_load_collision": "Couldn't check conflicts",
    }

    headline = error_headlines.get(tool_name, "Couldn't get that data")

    # Coaching-style error body
    error_bodies = {
        "get_readiness_detail": "Check in first so I can see how you're feeling.",
        "get_today_events": "Try again in a sec -- might just be a hiccup.",
        "get_week_schedule": "Try again in a sec -- might just be a hiccup.",
        "get_consistency_score": "Check in to start building your streak.",
        "get_dual_load_score": "Need a few days of data to calculate your load.",
        "get_test_results": "Log a test to start tracking your progress.",
        "detect_load_collision": "Try again in a sec -- might just be a hiccup.",
    }
    body = error_bodies.get(tool_name, suggestion or "Something didn't connect.")

    # Suggest check-in if readiness has no data
    chips = []
    if tool_name == "get_readiness_detail":
        chips = [{"label": "Check in", "message": "Log my daily check-in"}]
    else:
        chips = [{"label": "Try again", "message": state_get_original_message(tool_name)}]

    structured = {
        "headline": headline,
        "body": body,
        "cards": [],
        "chips": chips[:2],
    }

    return {
        "final_response": json.dumps(structured),
        "final_cards": [],
        "_flow_pattern": "data_display",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


def _extract_tool_args(tool_name: str, state: TomoChatState, context) -> dict:
    """Extract tool arguments from the user message.

    For schedule tools (get_today_events, get_week_schedule), extracts the
    target date from temporal references like 'tomorrow', 'Monday', etc.
    Without this, every schedule query defaults to today's date, so
    'show me tomorrow's schedule' would incorrectly show today.
    """
    # detect_load_collision via the check_conflicts intent defaults to a 7-day scan
    # matching the mobile capsule UI ("Checked N events over X days").
    if tool_name == "detect_load_collision":
        today = getattr(context, "today_date", None)
        return {"date": today, "days": 7} if today else {"days": 7}

    if tool_name not in ("get_today_events", "get_week_schedule"):
        return {}

    from app.utils.message_helpers import get_msg_type, get_msg_content
    messages = state.get("messages", [])
    user_message = ""
    for msg in reversed(messages):
        if get_msg_type(msg) == "human":
            user_message = get_msg_content(msg)
            break

    if not user_message:
        return {}

    today = getattr(context, "today_date", None)
    if not today:
        return {}

    extracted_date = _extract_date_from_message(user_message, today)
    if not extracted_date:
        return {}

    # For get_today_events, the param is 'date'; for get_week_schedule, 'start_date'
    if tool_name == "get_today_events":
        return {"date": extracted_date}
    elif tool_name == "get_week_schedule":
        return {"start_date": extracted_date}
    return {}


def _extract_date_from_message(msg: str, today: str) -> str | None:
    """Extract a date reference from a user message.

    Reuses the same temporal parsing logic as the scheduling capsule
    (scheduling_capsule.py:_extract_date) to ensure consistent behavior
    across all flows. Returns YYYY-MM-DD or None if no date found.
    """
    import re
    from datetime import datetime, timedelta

    lowered = msg.lower()

    try:
        today_dt = datetime.strptime(today, "%Y-%m-%d")
    except ValueError:
        return None

    # "day after tomorrow"
    if "day after tomorrow" in lowered or "after tomorrow" in lowered:
        return (today_dt + timedelta(days=2)).strftime("%Y-%m-%d")

    # "in N days"
    days_match = (
        re.search(r"in (\d+) days?", lowered)
        or re.search(r"(\d+) days? from now", lowered)
    )
    if days_match:
        try:
            n = int(days_match.group(1))
            if 0 <= n <= 60:
                return (today_dt + timedelta(days=n)).strftime("%Y-%m-%d")
        except ValueError:
            pass

    # "next week"
    if "next week" in lowered:
        return (today_dt + timedelta(days=7)).strftime("%Y-%m-%d")

    # "tomorrow" / "tmrw" — BEFORE "today" check because "today" is
    # substring of many phrases that don't mean today
    if "tomorrow" in lowered or "tmrw" in lowered:
        return (today_dt + timedelta(days=1)).strftime("%Y-%m-%d")

    # "today" / "tonight" / "this morning" — return None (use default)
    # because the tool already defaults to today
    if any(k in lowered for k in ("today", "tonight", "this evening", "this morning")):
        return None

    # Named days: "monday", "tuesday", etc.
    day_map = {
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
        "friday": 4, "saturday": 5, "sunday": 6,
    }
    for day_name, day_num in day_map.items():
        if day_name in lowered:
            days_ahead = (day_num - today_dt.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7  # Next occurrence, not today
            return (today_dt + timedelta(days=days_ahead)).strftime("%Y-%m-%d")

    return None


def state_get_original_message(tool_name: str) -> str:
    """Map tool name back to a retry message."""
    return {
        "get_readiness_detail": "What's my readiness?",
        "get_today_events": "What's on today?",
        "get_week_schedule": "Show my week",
        "get_consistency_score": "What's my streak?",
        "get_dual_load_score": "What's my training load?",
        "get_test_results": "Show my test history",
        "detect_load_collision": "Check for any schedule conflicts",
    }.get(tool_name, "Can you try that again?")
