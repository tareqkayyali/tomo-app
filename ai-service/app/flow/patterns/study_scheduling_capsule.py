"""
Tomo AI Service -- Study Scheduling Capsule Pattern

Single interactive card for study session planning. Mirrors the training
scheduling_capsule but tailored for study: subjects instead of focus areas,
school-day awareness, exam urgency sorting, and study-specific durations.

Pre-fetches in parallel:
  1. Player schedule preferences (school_days, study_subjects, exam_schedule,
     study_duration_min, study_days, school_start/end)
  2. 5 days of calendar data (existing events + available study slots)

User flow:
  1. User: "study math tomorrow" / "plan my study" / "study session"
  2. Backend: pre-fetch rules + calendar in parallel, assemble card context
  3. Mobile: render StudySchedulingCapsule with schedule + prefilled fields
  4. User: picks subject + day + slot + duration + taps Confirm
  5. CapsuleAction(toolName="create_event", event_type="study") -> done

Cost: $0 (no LLM). Latency: ~250ms (parallel fetches).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Optional

from app.flow.registry import FlowConfig
from app.models.state import TomoChatState

logger = logging.getLogger("tomo-ai.flow.study_scheduling_capsule")

# How many days of schedule to pre-fetch
_LOOKAHEAD_DAYS = 5

# Default study block duration (minutes) if player has no preference
_DEFAULT_STUDY_DURATION_MIN = 45

# Maximum slots to show per day
_DEFAULT_SLOT_LIMIT = 6

# Duration options exposed to the capsule
DURATION_OPTIONS = [
    {"id": 30, "label": "30 min"},
    {"id": 45, "label": "45 min"},
    {"id": 60, "label": "60 min"},
    {"id": 90, "label": "90 min"},
    {"id": 120, "label": "2 hours"},
]

# Fallback subjects when player has none configured
_DEFAULT_SUBJECTS = ["Math", "Physics", "English", "Biology", "Chemistry"]

_DAY_NAMES = [
    "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday",
]


# -- Public API --------------------------------------------------------

async def execute_study_scheduling_capsule(
    config: FlowConfig, state: TomoChatState
) -> dict:
    """Build a study_scheduling_capsule card with pre-fetched data.

    Returns a state update dict with final_response and final_cards.
    """
    context = state.get("player_context")
    user_id = state.get("user_id", "")
    tz = getattr(context, "timezone", None) or "UTC" if context else "UTC"
    today = (
        getattr(context, "today_date", None)
        if context
        else datetime.utcnow().strftime("%Y-%m-%d")
    ) or datetime.utcnow().strftime("%Y-%m-%d")

    # -- Extract prefilled values from the opener --
    opener = _get_user_message(state)
    prefilled_date = _extract_date(opener, today)
    prefilled_subject = _extract_subject(opener)

    # -- Pre-fetch schedule rules + calendar in parallel --
    dates = [
        (datetime.strptime(today, "%Y-%m-%d") + timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(_LOOKAHEAD_DAYS)
    ]

    rules_task = _fetch_schedule_rules(user_id)
    days_task = _fetch_days_parallel(
        user_id=user_id,
        dates=dates,
        timezone=tz,
        today=today,
    )

    rules, days = await asyncio.gather(rules_task, days_task)

    # -- Extract study config from rules --
    prefs = rules.get("preferences", {}) if isinstance(rules, dict) else {}
    study_subjects = prefs.get("study_subjects") or prefs.get("exam_subjects") or []
    if not study_subjects:
        study_subjects = _DEFAULT_SUBJECTS

    study_duration_min = prefs.get("study_duration_min") or _DEFAULT_STUDY_DURATION_MIN
    school_days = prefs.get("school_days", [0, 1, 2, 3, 4])  # Default Sun-Thu
    school_start = prefs.get("school_start", "08:00")
    school_end = prefs.get("school_end", "15:00")
    study_days = prefs.get("study_days", [0, 1, 2, 3])
    exam_schedule = prefs.get("exam_schedule") or []

    # -- Sort subjects by exam urgency --
    subject_options = _build_subject_options(study_subjects, exam_schedule, today)

    # -- If subject extracted from opener, try to match --
    if prefilled_subject:
        matched = _match_subject(prefilled_subject, study_subjects)
        if matched:
            prefilled_subject = matched

    # -- Annotate days with school day info --
    for day in days:
        date_str = day.get("date", "")
        day_of_week = _day_of_week_num(date_str)
        day["isSchoolDay"] = day_of_week in school_days
        day["schoolStart"] = school_start if day["isSchoolDay"] else None
        day["schoolEnd"] = school_end if day["isSchoolDay"] else None
        day["isStudyDay"] = day_of_week in study_days

    # -- Assemble card --
    capsule_card = {
        "type": "study_scheduling_capsule",
        "context": {
            "prefilledSubject": prefilled_subject,
            "prefilledDate": prefilled_date,
            "days": days,
            "subjectOptions": subject_options,
            "durationOptions": DURATION_OPTIONS,
            "durationMin": study_duration_min,
            "schoolDays": school_days,
            "schoolHours": {"start": school_start, "end": school_end},
            "studyDays": study_days,
            "examSchedule": exam_schedule,
        },
    }

    headline = _build_headline(prefilled_subject, prefilled_date, today)

    structured = {
        "headline": headline,
        "body": "",
        "cards": [capsule_card],
        "chips": [],
    }

    logger.info(
        f"study_scheduling_capsule: {len(days)} days fetched, "
        f"{len(subject_options)} subjects, "
        f"prefilled subject={prefilled_subject} date={prefilled_date} "
        f"($0, parallel fetch)"
    )

    return {
        "final_response": json.dumps(structured),
        "final_cards": [capsule_card],
        "_flow_pattern": "study_scheduling_capsule",
        "route_decision": "flow_handled",
        "total_cost_usd": 0.0,
        "total_tokens": 0,
    }


# -- Parallel fetchers ------------------------------------------------

async def _fetch_schedule_rules(user_id: str) -> dict:
    """Fetch player schedule preferences from TS backend."""
    from app.agents.tools.bridge import bridge_get

    try:
        result = await bridge_get(
            "/api/v1/schedule/rules",
            user_id=user_id,
        )
        return result if isinstance(result, dict) else {}
    except Exception as e:
        logger.warning(f"study_scheduling_capsule: rules fetch failed: {e}")
        return {}


async def _fetch_days_parallel(
    *,
    user_id: str,
    dates: list[str],
    timezone: str,
    today: str,
) -> list[dict]:
    """Fetch suggest-slots for each date in parallel (study event type)."""
    from app.agents.tools.bridge import bridge_get

    async def fetch_one(date_str: str) -> dict:
        try:
            result = await bridge_get(
                "/api/v1/calendar/suggest-slots",
                params={
                    "date": date_str,
                    "eventType": "study",
                    "durationMin": str(_DEFAULT_STUDY_DURATION_MIN),
                    "timezone": timezone,
                    "limit": str(_DEFAULT_SLOT_LIMIT),
                },
                user_id=user_id,
            )
        except Exception as e:
            logger.warning(f"study_scheduling_capsule: fetch failed for {date_str}: {e}")
            result = {}

        raw_events = result.get("existingEvents", []) if isinstance(result, dict) else []
        raw_slots = result.get("slots", []) if isinstance(result, dict) else []

        existing_events = []
        for ev in raw_events:
            if not isinstance(ev, dict):
                continue
            existing_events.append({
                "id": ev.get("id", ""),
                "name": ev.get("name", ""),
                "startTime": ev.get("startTime", ""),
                "endTime": ev.get("endTime", ""),
                "type": ev.get("type", ""),
            })

        available_slots = []
        for s in raw_slots[:_DEFAULT_SLOT_LIMIT]:
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

        return {
            "date": date_str,
            "label": _day_label(date_str, today),
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
            logger.warning(f"study_scheduling_capsule: day fetch exception: {r}")
            continue
        if isinstance(r, dict):
            days.append(r)
    return days


# -- Subject helpers ---------------------------------------------------

_SUBJECT_SYNONYMS: dict[str, list[str]] = {
    "math": ["math", "maths", "mathematics", "algebra", "calculus", "geometry"],
    "physics": ["physics", "phys"],
    "english": ["english", "eng", "literature", "essay"],
    "biology": ["biology", "bio"],
    "chemistry": ["chemistry", "chem"],
    "arabic": ["arabic", "arabi"],
    "history": ["history", "hist"],
    "geography": ["geography", "geo"],
    "computer science": ["cs", "computer", "programming", "coding", "comp sci"],
    "economics": ["economics", "econ"],
    "french": ["french"],
    "spanish": ["spanish"],
    "science": ["science"],
    "islamic studies": ["islamic", "islam", "islamiat", "quran"],
}


def _extract_subject(msg: str) -> Optional[str]:
    """Extract a study subject from the user's message."""
    import re

    if not msg:
        return None
    lowered = msg.lower()

    # Build a flat list of (synonym, canonical) sorted by synonym length
    # descending — longest match wins, prevents "cs" matching inside "physics"
    all_pairs: list[tuple[str, str]] = []
    for canonical, synonyms in _SUBJECT_SYNONYMS.items():
        for syn in synonyms:
            all_pairs.append((syn, canonical))
    all_pairs.sort(key=lambda x: -len(x[0]))

    for syn, canonical in all_pairs:
        # Word boundary match to prevent substring false positives
        pattern = r'\b' + re.escape(syn) + r'\b'
        if re.search(pattern, lowered):
            return canonical.title()
    return None


def _match_subject(extracted: str, available: list[str]) -> Optional[str]:
    """Match an extracted subject to the player's configured subjects."""
    lowered = extracted.lower()
    for subj in available:
        if subj.lower() == lowered:
            return subj
        # Fuzzy: check if the extracted subject is a synonym for a configured subject
        for canonical, synonyms in _SUBJECT_SYNONYMS.items():
            if lowered in synonyms or canonical == lowered:
                if subj.lower() == canonical or subj.lower() in synonyms:
                    return subj
    return extracted  # Keep the extracted subject even if not in player's list


def _build_subject_options(
    subjects: list[str],
    exam_schedule: list[dict],
    today: str,
) -> list[dict]:
    """Build subject options sorted by exam urgency.

    Subjects with upcoming exams are shown first with exam info.
    """
    today_dt = datetime.strptime(today, "%Y-%m-%d")

    # Build exam map: subject -> nearest exam date + days until
    exam_map: dict[str, dict] = {}
    for exam in exam_schedule:
        if not isinstance(exam, dict):
            continue
        subj = exam.get("subject", "")
        exam_date_str = exam.get("examDate", "")
        if not subj or not exam_date_str:
            continue
        try:
            exam_dt = datetime.strptime(exam_date_str, "%Y-%m-%d")
            days_until = (exam_dt - today_dt).days
            if days_until < 0:
                continue  # Past exam
            if subj not in exam_map or days_until < exam_map[subj]["daysUntil"]:
                exam_map[subj] = {
                    "examDate": exam_date_str,
                    "examType": exam.get("examType", ""),
                    "daysUntil": days_until,
                }
        except ValueError:
            continue

    options: list[dict] = []
    for subj in subjects:
        opt: dict = {"id": subj, "label": subj}
        exam_info = exam_map.get(subj)
        if exam_info:
            opt["examDate"] = exam_info["examDate"]
            opt["examType"] = exam_info["examType"]
            opt["daysUntil"] = exam_info["daysUntil"]
            opt["urgency"] = (
                "high" if exam_info["daysUntil"] <= 3
                else "medium" if exam_info["daysUntil"] <= 7
                else "low"
            )
        options.append(opt)

    # Sort: subjects with exams first (by urgency), then rest alphabetically
    def sort_key(o: dict) -> tuple:
        if "daysUntil" in o:
            return (0, o["daysUntil"])
        return (1, o["label"].lower())

    options.sort(key=sort_key)
    return options


# -- Date extraction (shared with scheduling_capsule) ------------------

def _extract_date(msg: str, today: str) -> Optional[str]:
    """Extract date from opener message."""
    import re

    if not msg or not today:
        return None

    lowered = msg.lower()
    today_dt = datetime.strptime(today, "%Y-%m-%d")

    if "day after tomorrow" in lowered or "after tomorrow" in lowered:
        return (today_dt + timedelta(days=2)).strftime("%Y-%m-%d")

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

    if "next week" in lowered:
        return (today_dt + timedelta(days=7)).strftime("%Y-%m-%d")

    if any(k in lowered for k in ("today", "tonight", "this evening", "this morning")):
        return today

    if "tomorrow" in lowered or "tmrw" in lowered:
        return (today_dt + timedelta(days=1)).strftime("%Y-%m-%d")

    day_map = {
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
        "friday": 4, "saturday": 5, "sunday": 6,
    }
    for day_name, day_num in day_map.items():
        if day_name in lowered:
            days_ahead = (day_num - today_dt.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            return (today_dt + timedelta(days=days_ahead)).strftime("%Y-%m-%d")

    return None


# -- Misc helpers ------------------------------------------------------

def _get_user_message(state: TomoChatState) -> str:
    from app.utils.message_helpers import get_msg_type, get_msg_content
    messages = state.get("messages", [])
    for msg in reversed(messages):
        if get_msg_type(msg) == "human":
            return get_msg_content(msg)
    return ""


def _day_of_week_num(date_str: str) -> int:
    """Return JS-style day of week (0=Sun, 1=Mon, ..., 6=Sat)."""
    try:
        # Python weekday(): Mon=0, Sun=6 -> JS: Sun=0, Mon=1, ..., Sat=6
        py_weekday = datetime.strptime(date_str, "%Y-%m-%d").weekday()
        return (py_weekday + 1) % 7
    except ValueError:
        return -1


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


def _build_headline(
    subject: Optional[str], date: Optional[str], today: str
) -> str:
    subj_label = subject if subject else "Study"
    if date:
        label = _day_label(date, today)
        return f"Plan {subj_label} -- {label}"
    return f"Plan your study session"
