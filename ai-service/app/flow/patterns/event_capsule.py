"""
Tomo AI Service -- Event Capsule Pattern

Lightweight one-shot event creator for chat. Matches Timeline's AddEvent
form in richness (title, type, date, start time w/ custom option, duration,
intensity, category, linked program, notes) but keeps every choice inside a
single inline card — "Custom time" expands a wheel in-capsule rather than
round-tripping through another chat turn.

Distinct from `scheduling_capsule` (which is training-session building with
drills + focus + intensity and 5-day slot engine). This is for "add gym at
5pm", "schedule a recovery session tomorrow", "put sleep at 10pm" — any
generic calendar item.

Cost: $0 (no LLM). Latency: ~200ms (5 parallel suggest-slots calls so the
athlete can switch day without leaving the card).
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from app.flow.registry import FlowConfig
from app.flow.helpers.scheduling import (
    extract_time_from_message,
    DEFAULT_SESSION_DURATION_MIN,
)
from app.models.state import TomoChatState
from app.agents.tools.output_tools import _load_snapshot_programs
from app.flow.patterns.scheduling_capsule import (
    _fetch_days_parallel,
    _get_user_message,
    _extract_date,
    _extract_focus,
    _infer_intensity,
    _get_training_categories,
    _build_linked_programs_for_capsule,
    _match_linked_program_slug,
    _recent_program_slug_from_history,
)

logger = logging.getLogger("tomo-ai.flow.event_capsule")

_LOOKAHEAD_DAYS = 5


# ── Event-type inference ────────────────────────────────────────────

_EVENT_TYPE_CUES: list[tuple[str, str]] = [
    # study / exam
    ("exam", "exam"), ("test prep", "study"), ("study block", "study"),
    ("study session", "study"), ("study", "study"), ("revise", "study"),
    ("homework", "study"), ("assignment", "study"),
    # recovery
    ("recovery", "recovery"), ("mobility", "recovery"), ("stretch", "recovery"),
    ("foam roll", "recovery"), ("nap", "recovery"), ("sleep", "recovery"),
    # match
    ("match", "match"), ("game", "match"), ("fixture", "match"),
    ("tournament", "match"),
    # training (default fallback for sport-y keywords)
    ("training", "training"), ("practice", "training"), ("session", "training"),
    ("gym", "training"), ("lift", "training"), ("run", "training"),
    ("sprint", "training"), ("drill", "training"), ("skills", "training"),
    ("workout", "training"),
]


def _extract_event_type(opener: str) -> Optional[str]:
    if not opener:
        return None
    lo = opener.lower()
    for phrase, canonical in _EVENT_TYPE_CUES:
        if phrase in lo:
            return canonical
    return None


def _build_title_from_opener(
    opener: str, event_type: Optional[str], focus: Optional[str]
) -> str:
    """Best-effort title for the create form, athlete can overwrite."""
    lo = (opener or "").lower()
    if event_type == "recovery" and "sleep" in lo:
        return "Sleep"
    if event_type == "study":
        return "Study block"
    if event_type == "match":
        return "Match"
    if event_type == "exam":
        return "Exam"
    if focus:
        return f"{focus.capitalize()} session"
    if event_type == "training":
        return "Training session"
    return ""


# ── Public API ──────────────────────────────────────────────────────

async def execute_event_capsule(
    config: FlowConfig, state: TomoChatState
) -> dict:
    """Build an event_edit_capsule card with pre-fetched schedule data.

    Returns a state update dict matching the shape scheduling_capsule/
    study_scheduling_capsule produce so the graph treats it uniformly.
    """
    context = state.get("player_context")
    user_id = state.get("user_id", "")
    tz = (getattr(context, "timezone", None) or "UTC") if context else "UTC"
    today = (
        getattr(context, "today_date", None)
        if context
        else datetime.utcnow().strftime("%Y-%m-%d")
    ) or datetime.utcnow().strftime("%Y-%m-%d")

    opener = _get_user_message(state)
    prefilled_date = _extract_date(state, today) or today
    prefilled_focus = _extract_focus(opener)
    prefilled_event_type = _extract_event_type(opener) or (
        "training" if prefilled_focus else ""
    )
    prefilled_time = extract_time_from_message(opener)
    prefilled_intensity = (
        _infer_intensity(opener, prefilled_focus)
        if prefilled_event_type in ("training", "match")
        else None
    )
    prefilled_title = _build_title_from_opener(
        opener, prefilled_event_type, prefilled_focus
    )

    dates = [
        (datetime.strptime(today, "%Y-%m-%d") + timedelta(days=i)).strftime(
            "%Y-%m-%d"
        )
        for i in range(_LOOKAHEAD_DAYS)
    ]

    raw_programs, days = await asyncio.gather(
        _load_snapshot_programs(user_id),
        _fetch_days_parallel(
            user_id=user_id,
            dates=dates,
            timezone=tz,
            today=today,
        ),
    )

    linked_programs = _build_linked_programs_for_capsule(raw_programs)
    prefilled_linked_slug = _match_linked_program_slug(opener, linked_programs)
    if not prefilled_linked_slug:
        prefilled_linked_slug = _recent_program_slug_from_history(
            state, linked_programs
        )

    training_categories = _get_training_categories(context)

    readiness = None
    if context:
        snapshot = getattr(context, "snapshot_enrichment", None)
        readiness = (
            getattr(snapshot, "readiness_rag", None) if snapshot else None
        )

    capsule_card = {
        "type": "event_edit_capsule",
        "mode": "create",
        "prefilledTitle": prefilled_title or None,
        "prefilledEventType": prefilled_event_type or None,
        "prefilledDate": prefilled_date,
        "prefilledStartTime": prefilled_time or None,
        "prefilledIntensity": prefilled_intensity,
        "prefilledDuration": DEFAULT_SESSION_DURATION_MIN,
        "trainingCategories": training_categories,
        "days": days,
        "linkedPrograms": linked_programs,
        "prefilledLinkedProgramSlug": prefilled_linked_slug,
        "readinessLevel": readiness,
        "sport": getattr(context, "sport", None) if context else None,
    }

    structured = {
        "headline": _build_headline(prefilled_event_type, prefilled_date, today),
        "body": "",
        "cards": [capsule_card],
        "chips": [],
    }

    logger.info(
        "event_capsule: %d days fetched, type=%s date=%s time=%s ($0)",
        len(days),
        prefilled_event_type or "?",
        prefilled_date,
        prefilled_time or "?",
    )

    return {
        "final_response": json.dumps(structured),
        "final_cards": [capsule_card],
        "_flow_pattern": "event_capsule",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


def _build_headline(
    event_type: Optional[str], date: str, today: str
) -> str:
    when = "today"
    try:
        if date != today:
            d = datetime.strptime(date, "%Y-%m-%d")
            t = datetime.strptime(today, "%Y-%m-%d")
            delta = (d - t).days
            if delta == 1:
                when = "tomorrow"
            elif 2 <= delta <= 6:
                when = d.strftime("%A").lower()
            else:
                when = d.strftime("%b %-d")
    except Exception:
        pass

    label = "event"
    if event_type in ("training", "match"):
        label = event_type
    elif event_type == "study":
        label = "study block"
    elif event_type == "recovery":
        label = "recovery"
    elif event_type == "exam":
        label = "exam"

    return f"Add an {label} for {when}".replace("an training", "a training").replace(
        "an match", "a match"
    ).replace("an study", "a study").replace("an recovery", "a recovery")
