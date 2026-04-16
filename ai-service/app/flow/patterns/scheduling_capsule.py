"""
Tomo AI Service -- Scheduling Capsule Pattern

Single interactive card that replaces the 8-step multi_step build_session
flow. Pre-fetches 5 days of calendar data (existing events + available
slots from the scheduling engine), extracts prefilled values from the
user's opener, and returns a structured capsule card that mobile renders
as a self-contained scheduling form.

User flow:
  1. User: "Build me a sprint session tomorrow at 5pm"
  2. Backend: pre-fetch 5 days in parallel, assemble card context
  3. Mobile: render SchedulingCapsule with schedule + prefilled fields
  4. User: picks day + slot + focus + intensity + taps Confirm
  5. CapsuleAction(toolName="create_event") -> backend -> 201 -> done

Cost: $0 (no LLM). Latency: ~200ms (5 parallel suggest-slots calls).
Round trips: 1 card render + 1 submit = 2 total.

Feature flag: SCHEDULING_CAPSULE_ENABLED (default: false)
When disabled, build_session/plan_training route to multi_step as before.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Optional

from app.flow.registry import FlowConfig
from app.flow.helpers.scheduling import (
    extract_time_from_message,
    DEFAULT_SESSION_DURATION_MIN,
    DEFAULT_SLOT_LIMIT,
)
from app.models.state import TomoChatState

logger = logging.getLogger("tomo-ai.flow.scheduling_capsule")

# Feature flag: opt-in until validated in production.
SCHEDULING_CAPSULE_ENABLED = (
    os.environ.get("SCHEDULING_CAPSULE_ENABLED", "false").lower() == "true"
)
logger.info(
    f"scheduling_capsule module loaded: SCHEDULING_CAPSULE_ENABLED={SCHEDULING_CAPSULE_ENABLED} "
    f"(raw env={os.environ.get('SCHEDULING_CAPSULE_ENABLED', '<not set>')})"
)

# How many days of schedule to pre-fetch. 5 covers a full school week.
_LOOKAHEAD_DAYS = 5

# Intensity options exposed to the capsule.
INTENSITY_OPTIONS = [
    {"id": "LIGHT", "label": "Light"},
    {"id": "MODERATE", "label": "Moderate"},
    {"id": "HARD", "label": "Hard"},
]

# Day labels for display ("Today", "Tomorrow", then weekday names).
_DAY_NAMES = [
    "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday",
]


# ── Public API ──────────────────────────────────────────────────────

async def execute_scheduling_capsule(
    config: FlowConfig, state: TomoChatState
) -> dict:
    """Build a scheduling_capsule card with pre-fetched schedule data.

    Returns a state update dict with final_response and final_cards,
    identical shape to what capsule_direct and multi_step produce so
    the graph treats it uniformly.
    """
    context = state.get("player_context")
    user_id = state.get("user_id", "")
    tz = getattr(context, "timezone", None) or "UTC" if context else "UTC"
    today = (
        getattr(context, "today_date", None)
        if context
        else datetime.utcnow().strftime("%Y-%m-%d")
    ) or datetime.utcnow().strftime("%Y-%m-%d")

    # ── Extract prefilled values from the opener ──
    opener = _get_user_message(state)
    prefilled_date = _extract_date(state, today)
    prefilled_focus = _extract_focus(opener)
    prefilled_time = extract_time_from_message(opener)
    prefilled_intensity = _infer_intensity(opener, prefilled_focus)
    prefilled_title = _build_title(prefilled_focus)

    # ── Pre-fetch 5 days in parallel ──
    dates = [
        (datetime.strptime(today, "%Y-%m-%d") + timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(_LOOKAHEAD_DAYS)
    ]
    days = await _fetch_days_parallel(
        user_id=user_id,
        dates=dates,
        timezone=tz,
        today=today,
    )

    # ── Training categories from player context ──
    training_categories = _get_training_categories(context)

    # ── Readiness level ──
    readiness = None
    if context:
        snapshot = getattr(context, "snapshot_enrichment", None)
        readiness = getattr(snapshot, "readiness_rag", None) if snapshot else None

    # ── Assemble card ──
    capsule_card = {
        "type": "scheduling_capsule",
        "context": {
            "prefilledTitle": prefilled_title,
            "prefilledDate": prefilled_date,
            "prefilledFocus": prefilled_focus,
            "prefilledTime": prefilled_time,
            "prefilledIntensity": prefilled_intensity,
            "days": days,
            "focusOptions": _get_focus_options(),
            "intensityOptions": INTENSITY_OPTIONS,
            "trainingCategories": training_categories,
            "readinessLevel": readiness,
            "sport": getattr(context, "sport", None) if context else None,
            "durationMin": DEFAULT_SESSION_DURATION_MIN,
        },
    }

    headline = _build_headline(prefilled_focus, prefilled_date, today)

    structured = {
        "headline": headline,
        "body": "",
        "cards": [capsule_card],
        "chips": [],
    }

    logger.info(
        f"scheduling_capsule: {len(days)} days fetched, "
        f"prefilled date={prefilled_date} focus={prefilled_focus} "
        f"time={prefilled_time} ($0, parallel fetch)"
    )

    return {
        "final_response": json.dumps(structured),
        "final_cards": [capsule_card],
        "_flow_pattern": "scheduling_capsule",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


# ── Parallel day fetcher ────────────────────────────────────────────

async def _fetch_days_parallel(
    *,
    user_id: str,
    dates: list[str],
    timezone: str,
    today: str,
) -> list[dict]:
    """Fetch suggest-slots for each date in parallel.

    Each call returns existingEvents + available slots. We assemble
    them into the card's `days[]` array. If a call fails, that day
    gets an empty schedule (graceful degradation, not a crash).
    """
    from app.agents.tools.bridge import bridge_get

    async def fetch_one(date_str: str) -> dict:
        try:
            result = await bridge_get(
                "/api/v1/calendar/suggest-slots",
                params={
                    "date": date_str,
                    "eventType": "training",
                    "durationMin": str(DEFAULT_SESSION_DURATION_MIN),
                    "timezone": timezone,
                    "limit": str(DEFAULT_SLOT_LIMIT),
                },
                user_id=user_id,
            )
        except Exception as e:
            logger.warning(
                f"scheduling_capsule: fetch failed for {date_str}: {e}"
            )
            result = {}

        raw_events = result.get("existingEvents", []) if isinstance(result, dict) else []
        raw_slots = result.get("slots", []) if isinstance(result, dict) else []

        existing_events = []
        for ev in raw_events:
            if not isinstance(ev, dict):
                continue
            existing_events.append({
                "name": ev.get("name", ""),
                "startTime": ev.get("startTime", ""),
                "endTime": ev.get("endTime", ""),
                "type": ev.get("type", ""),
            })

        available_slots = []
        for s in raw_slots[:DEFAULT_SLOT_LIMIT]:
            if not isinstance(s, dict):
                continue
            start24 = s.get("startTime24", "")
            end24 = s.get("endTime24", "")
            if not start24:
                continue
            available_slots.append({
                "start24": start24,
                "end24": end24,
                "label": (
                    f"{s.get('start', '')} - {s.get('end', '')}"
                    if s.get("start") and s.get("end")
                    else start24
                ),
                "score": s.get("score", 0),
            })

        label = _day_label(date_str, today)

        return {
            "date": date_str,
            "label": label,
            "dayOfWeek": _weekday_name(date_str),
            "existingEvents": existing_events,
            "availableSlots": available_slots,
        }

    results = await asyncio.gather(
        *(fetch_one(d) for d in dates),
        return_exceptions=True,
    )

    days: list[dict] = []
    for r in results:
        if isinstance(r, Exception):
            logger.warning(f"scheduling_capsule: day fetch exception: {r}")
            continue
        if isinstance(r, dict):
            days.append(r)
    return days


# ── Extraction helpers (reuse logic from multi_step) ────────────────

def _get_user_message(state: TomoChatState) -> str:
    from app.utils.message_helpers import get_msg_type, get_msg_content
    messages = state.get("messages", [])
    for msg in reversed(messages):
        if get_msg_type(msg) == "human":
            return get_msg_content(msg)
    return ""


def _extract_date(state: TomoChatState, today: str) -> Optional[str]:
    """Extract date from opener. Reuses multi_step's extraction logic."""
    import re

    msg = _get_user_message(state).lower()
    if not today:
        return None

    today_dt = datetime.strptime(today, "%Y-%m-%d")

    if "day after tomorrow" in msg or "after tomorrow" in msg:
        return (today_dt + timedelta(days=2)).strftime("%Y-%m-%d")

    days_match = (
        re.search(r"in (\d+) days?", msg)
        or re.search(r"(\d+) days? from now", msg)
    )
    if days_match:
        try:
            n = int(days_match.group(1))
            if 0 <= n <= 60:
                return (today_dt + timedelta(days=n)).strftime("%Y-%m-%d")
        except ValueError:
            pass

    if "next week" in msg:
        return (today_dt + timedelta(days=7)).strftime("%Y-%m-%d")

    if any(k in msg for k in ("today", "tonight", "this evening", "this morning")):
        return today

    if "tomorrow" in msg or "tmrw" in msg:
        return (today_dt + timedelta(days=1)).strftime("%Y-%m-%d")

    day_map = {
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
        "friday": 4, "saturday": 5, "sunday": 6,
    }
    for day_name, day_num in day_map.items():
        if day_name in msg:
            days_ahead = (day_num - today_dt.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            return (today_dt + timedelta(days=days_ahead)).strftime("%Y-%m-%d")

    return None


# Focus synonyms — same as multi_step.py, kept here to avoid import
# coupling. Single source of truth is the FOCUS_AREAS + synonym list;
# if those change, update both.
_FOCUS_SYNONYMS: list[tuple[str, str]] = [
    ("technical drill", "technical"), ("technical", "technical"),
    ("skill work", "technical"), ("ball work", "technical"),
    ("ball mastery", "technical"), ("first touch", "technical"),
    ("passing drill", "technical"), ("shooting drill", "technical"),
    ("skills session", "technical"), ("skills", "technical"),
    ("acceleration", "speed"), ("sprint", "speed"),
    ("speed session", "speed"), ("speed work", "speed"),
    ("speed", "speed"), ("max velocity", "speed"),
    ("gym session", "strength"), ("gym", "strength"),
    ("lift", "strength"), ("weights", "strength"),
    ("strength", "strength"), ("resistance", "strength"),
    ("change of direction", "agility"), ("cod drill", "agility"),
    ("footwork", "agility"), ("agility", "agility"),
    ("conditioning", "endurance"), ("aerobic", "endurance"),
    ("cardio", "endurance"), ("endurance", "endurance"),
    ("long run", "endurance"),
    ("active recovery", "recovery"), ("mobility", "recovery"),
    ("recovery", "recovery"), ("foam roll", "recovery"),
    ("stretching", "recovery"),
]


def _extract_focus(msg: str) -> Optional[str]:
    if not msg:
        return None
    lowered = msg.lower()
    for phrase, canonical in _FOCUS_SYNONYMS:
        if phrase in lowered:
            return canonical
    return None


def _infer_intensity(msg: str, focus: Optional[str]) -> str:
    lowered = (msg or "").lower()
    if any(k in lowered for k in ("hard", "heavy", "max", "intense", "all out")):
        return "HARD"
    if any(k in lowered for k in ("light", "easy", "recovery", "mobility", "chill")):
        return "LIGHT"
    if any(k in lowered for k in ("moderate", "tempo", "steady")):
        return "MODERATE"
    f = (focus or "").lower()
    if f in ("strength", "speed"):
        return "HARD"
    if f == "recovery":
        return "LIGHT"
    return "MODERATE"


def _get_focus_options() -> list[dict]:
    return [
        {"id": "speed", "label": "Speed"},
        {"id": "strength", "label": "Strength"},
        {"id": "technical", "label": "Technical"},
        {"id": "agility", "label": "Agility"},
        {"id": "endurance", "label": "Endurance"},
        {"id": "recovery", "label": "Recovery"},
    ]


def _get_training_categories(context) -> list[dict]:
    """Get player's custom training categories or defaults."""
    # TODO: read from player_schedule_preferences once available
    return [
        {"id": "club", "label": "Club / Academy"},
        {"id": "gym", "label": "Gym"},
        {"id": "personal", "label": "Personal"},
    ]


def _build_title(focus: Optional[str]) -> str:
    if focus:
        return f"{focus.capitalize()} Session"
    return "Training Session"


def _build_headline(
    focus: Optional[str], date: Optional[str], today: str
) -> str:
    focus_label = focus.capitalize() if focus else "Training"
    if date:
        label = _day_label(date, today)
        return f"Schedule {focus_label} Session -- {label}"
    return f"Schedule {focus_label} Session"


def _day_label(date_str: str, today: str) -> str:
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
        t = datetime.strptime(today, "%Y-%m-%d")
        delta = (d - t).days
        if delta == 0:
            return "Today"
        if delta == 1:
            return "Tomorrow"
        return _DAY_NAMES[d.weekday()]
    except (ValueError, IndexError):
        return date_str


def _weekday_name(date_str: str) -> str:
    try:
        return _DAY_NAMES[datetime.strptime(date_str, "%Y-%m-%d").weekday()]
    except (ValueError, IndexError):
        return ""
