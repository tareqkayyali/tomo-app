"""
Standardized scheduling helpers for every timeline/calendar flow.

Single source of truth for:
  1. Parsing a time reference out of a natural-language opener
     ("5 pm", "at 17:00", "this evening").
  2. Resolving a requested slot against the athlete's real calendar
     via the backend /calendar/suggest-slots engine (respects school
     hours, buffer minutes, readiness, existing events).
  3. Classifying the outcome into one of three statuses so every flow
     can present a consistent UX:

         confirmed  -> the requested slot is clean; auto-advance
         conflict   -> the requested slot overlaps an existing event;
                       present alternatives WITH a conflict explanation
         needs_pick -> no time was stated; present the normal picker

Any future flow that needs to place something on the calendar
(build_session, reschedule_event, move_session, plan_study,
book_recovery, etc.) MUST call `resolve_slot` instead of rolling its
own conflict logic. This prevents the F5-class regression where each
flow re-invented fork/time filtering in a slightly different way.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# Default duration used when we need to validate a slot BEFORE drills
# are built. Generous enough for a typical football/padel/gym session.
# _execute_confirm_tool later uses the REAL drill total for end_time,
# so this only affects the slot-validation query shape.
DEFAULT_SESSION_DURATION_MIN = 75


# ── Public data classes ─────────────────────────────────────────────

@dataclass
class SlotAlternative:
    """One suggest-slots row, shaped for chip rendering."""
    start_24: str            # "18:00"
    end_24: str              # "19:15"
    label: str               # "6:00 PM - 7:15 PM"


@dataclass
class SlotResolution:
    """Outcome of `resolve_slot`. Flows branch on `status`."""
    status: str              # "confirmed" | "conflict" | "needs_pick"
    requested_time: Optional[str]
    start_24: Optional[str]
    end_24: Optional[str]
    duration_min: int
    conflict_event_title: Optional[str] = None
    conflict_event_time: Optional[str] = None
    alternatives: list[SlotAlternative] = field(default_factory=list)
    headline: Optional[str] = None
    body: Optional[str] = None


# ── Public functions ────────────────────────────────────────────────

def extract_time_from_message(msg: str) -> Optional[str]:
    """Best-effort parse of a time reference out of a full opener.

    Returns "HH:MM" (24h) or None. This is the counterpart of
    `_extract_date_from_message` / `_extract_focus_from_message` in
    multi_step.py, kept in this module so non-build_session flows can
    reuse the exact same logic.

    Examples:
        "build me a sprint session tomorrow at 5 pm" -> "17:00"
        "book a gym block at 17:30 wednesday"        -> "17:30"
        "move my run to 7am"                         -> "07:00"
        "this evening, technical drills"             -> "17:00"
    """
    if not msg:
        return None
    m = msg.lower()

    # 1. Explicit HH:MM
    hm = re.search(r"\b(\d{1,2}):(\d{2})\b", m)
    if hm:
        h, mm = int(hm.group(1)), int(hm.group(2))
        if 0 <= h < 24 and 0 <= mm < 60:
            return f"{h:02d}:{mm:02d}"

    # 2. "5 pm", "5pm", "5 o'clock pm", "at 5pm"
    ampm = re.search(r"\b(\d{1,2})\s*(?:o'?clock\s*)?(am|pm)\b", m)
    if ampm:
        h = int(ampm.group(1))
        period = ampm.group(2)
        if period == "pm" and h < 12:
            h += 12
        if period == "am" and h == 12:
            h = 0
        if 0 <= h < 24:
            return f"{h:02d}:00"

    # 3. "at 17" (bare 24h, no minutes, must be after "at")
    at_h = re.search(r"\bat\s+(\d{1,2})\b(?!\s*[:\d])", m)
    if at_h:
        h = int(at_h.group(1))
        if 13 <= h <= 23:
            return f"{h:02d}:00"
        # 1-7 after "at" without am/pm is almost always PM for training.
        if 1 <= h <= 7:
            return f"{h + 12:02d}:00"
        # 8-11 after "at" without am/pm is almost always AM.
        if 8 <= h <= 11:
            return f"{h:02d}:00"

    # 4. Keyword-only fall-through (kept last so explicit times win).
    if "early morning" in m:
        return "06:00"
    if "morning" in m:
        return "08:00"
    if "afternoon" in m:
        return "15:00"
    if "evening" in m:
        return "17:00"
    if "tonight" in m or "late night" in m:
        return "20:00"

    return None


async def resolve_slot(
    *,
    user_id: str,
    target_date: str,
    requested_time: Optional[str],
    duration_min: int,
    timezone: str,
) -> SlotResolution:
    """Resolve `requested_time` against the athlete's real calendar.

    Flow decision tree:
      - no requested_time              -> needs_pick (normal picker)
      - requested_time & clean         -> confirmed (flow auto-advances)
      - requested_time & conflict      -> conflict (show alternatives
                                          with an explicit explanation)
      - suggest-slots backend fails    -> needs_pick (graceful degrade)

    Never raises. On any internal exception the caller still gets a
    usable SlotResolution they can render.
    """
    from app.agents.tools.bridge import bridge_get

    try:
        result = await bridge_get(
            "/api/v1/calendar/suggest-slots",
            params={
                "date": target_date or "",
                "eventType": "training",
                "durationMin": str(duration_min),
                "timezone": timezone or "UTC",
            },
            user_id=user_id,
        )
    except Exception as e:
        logger.warning(f"resolve_slot: suggest-slots call failed: {e}")
        return SlotResolution(
            status="needs_pick",
            requested_time=requested_time,
            start_24=None,
            end_24=None,
            duration_min=duration_min,
            body="Couldn't read your schedule -- pick a rough slot.",
        )

    raw_slots = result.get("slots", []) if isinstance(result, dict) else []
    existing = result.get("existingEvents", []) if isinstance(result, dict) else []

    alternatives: list[SlotAlternative] = []
    for s in raw_slots[:5]:
        start_24 = s.get("startTime24") or ""
        end_24 = s.get("endTime24") or ""
        display = ""
        if s.get("start") and s.get("end"):
            display = f"{s['start']} - {s['end']}"
        if not start_24:
            continue
        alternatives.append(SlotAlternative(
            start_24=start_24,
            end_24=end_24,
            label=display or _to_12h(start_24),
        ))

    # Case 1: no time stated in the opener -> normal picker
    if not requested_time:
        return SlotResolution(
            status="needs_pick",
            requested_time=None,
            start_24=None,
            end_24=None,
            duration_min=duration_min,
            alternatives=alternatives,
            body=_picker_body(existing, target_date),
        )

    req_min = _hhmm_to_min(requested_time)
    if req_min is None:
        return SlotResolution(
            status="needs_pick",
            requested_time=requested_time,
            start_24=None,
            end_24=None,
            duration_min=duration_min,
            alternatives=alternatives,
            body=_picker_body(existing, target_date),
        )
    req_end_min = req_min + duration_min

    # Case 2/3: scan existing events for overlap with [req_min, req_end_min)
    conflict = _find_overlap(existing, req_min, req_end_min)

    if conflict is None:
        end_hhmm = _min_to_hhmm(req_end_min)
        logger.info(
            f"resolve_slot: requested {requested_time} clean "
            f"(duration {duration_min}min -> end {end_hhmm}) on {target_date}"
        )
        return SlotResolution(
            status="confirmed",
            requested_time=requested_time,
            start_24=requested_time,
            end_24=end_hhmm,
            duration_min=duration_min,
        )

    ev_title = str(
        conflict.get("name")
        or conflict.get("title")
        or "another session"
    )
    ev_start_hhmm = _extract_hhmm_any(
        conflict.get("startTime")
        or conflict.get("start_at")
        or conflict.get("startAt")
        or ""
    )
    ev_end_hhmm = _extract_hhmm_any(
        conflict.get("endTime")
        or conflict.get("end_at")
        or conflict.get("endAt")
        or ""
    )
    ev_time_display = ""
    if ev_start_hhmm and ev_end_hhmm:
        ev_time_display = f"{_to_12h(ev_start_hhmm)} - {_to_12h(ev_end_hhmm)}"
    elif ev_start_hhmm:
        ev_time_display = _to_12h(ev_start_hhmm)

    logger.info(
        f"resolve_slot: requested {requested_time} conflicts with "
        f"{ev_title!r} ({ev_time_display}) on {target_date}"
    )

    return SlotResolution(
        status="conflict",
        requested_time=requested_time,
        start_24=None,
        end_24=None,
        duration_min=duration_min,
        conflict_event_title=ev_title,
        conflict_event_time=ev_time_display,
        alternatives=alternatives,
        headline=f"{_to_12h(requested_time)} is taken",
        body=(
            f"{_to_12h(requested_time)} overlaps {ev_title}"
            f"{' (' + ev_time_display + ')' if ev_time_display else ''}. "
            f"Here are clean slots nearby."
        ),
    )


# ── Internal helpers ────────────────────────────────────────────────

def _hhmm_to_min(hhmm: str) -> Optional[int]:
    m = re.match(r"^(\d{1,2}):(\d{2})", hhmm or "")
    if not m:
        return None
    try:
        return int(m.group(1)) * 60 + int(m.group(2))
    except (TypeError, ValueError):
        return None


def _min_to_hhmm(mm: int) -> str:
    mm = max(0, min(mm, 24 * 60 - 1))
    return f"{mm // 60:02d}:{mm % 60:02d}"


def _extract_hhmm_any(value: str) -> Optional[str]:
    """Pull 'HH:MM' (24h) out of any time representation.

    Supports:
      - ISO datetime:           "2026-04-16T18:00:00Z"  -> "18:00"
      - 24h plain:              "18:00"                 -> "18:00"
      - 12h with AM/PM:         "6:00 PM" / "6:48 pm"   -> "18:00"
      - 12h hour-only AM/PM:    "6 PM"                  -> "18:00"

    The 12h form is the shape the backend /calendar/suggest-slots
    endpoint emits (via format12h in schedulingEngine), so every
    scheduling helper MUST speak it natively — no pre-normalization.
    """
    if not value:
        return None
    s = str(value).strip()

    # 1. ISO datetime "...T18:00..."
    m = re.search(r"T(\d{2}):(\d{2})", s)
    if m:
        return f"{m.group(1)}:{m.group(2)}"

    # 2. 12h with AM/PM, e.g. "6:00 PM", "6:48 pm", "12:30 AM"
    m = re.match(r"^\s*(\d{1,2}):(\d{2})\s*(am|pm)\s*$", s, re.IGNORECASE)
    if m:
        h = int(m.group(1))
        mm = int(m.group(2))
        period = m.group(3).lower()
        if period == "pm" and h < 12:
            h += 12
        if period == "am" and h == 12:
            h = 0
        if 0 <= h < 24 and 0 <= mm < 60:
            return f"{h:02d}:{mm:02d}"

    # 3. 12h hour-only with AM/PM, e.g. "6 PM"
    m = re.match(r"^\s*(\d{1,2})\s*(am|pm)\s*$", s, re.IGNORECASE)
    if m:
        h = int(m.group(1))
        period = m.group(2).lower()
        if period == "pm" and h < 12:
            h += 12
        if period == "am" and h == 12:
            h = 0
        if 0 <= h < 24:
            return f"{h:02d}:00"

    # 4. Bare 24h "HH:MM" (must be last so "6:00" without AM/PM doesn't
    #    get mis-read as 12h — bare 6:00 is 06:00).
    m = re.match(r"^(\d{1,2}):(\d{2})$", s)
    if m:
        h = int(m.group(1))
        mm = int(m.group(2))
        if 0 <= h < 24 and 0 <= mm < 60:
            return f"{h:02d}:{mm:02d}"

    return None


def _to_12h(hhmm: Optional[str]) -> str:
    if not hhmm:
        return ""
    m = re.match(r"^(\d{1,2}):(\d{2})", hhmm)
    if not m:
        return hhmm
    h, mm = int(m.group(1)), int(m.group(2))
    period = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return f"{h12}:{mm:02d} {period}"


def _find_overlap(
    events: list, req_start_min: int, req_end_min: int
) -> Optional[dict]:
    """Return the first event that overlaps [req_start_min, req_end_min).

    Handles the backend /calendar/suggest-slots response shape where
    events arrive as `{name, startTime: "6:00 PM", endTime: "6:48 PM"}`
    AS WELL AS ISO/24h shapes used by other calendar endpoints. The
    helper is intentionally liberal so every scheduling flow can
    consume any calendar event dict without pre-normalizing.
    """
    for ev in events:
        if not isinstance(ev, dict):
            continue
        ev_start = _extract_minutes_any(
            ev.get("startTime")
            or ev.get("start_at")
            or ev.get("startAt")
            or ""
        )
        ev_end = _extract_minutes_any(
            ev.get("endTime")
            or ev.get("end_at")
            or ev.get("endAt")
            or ""
        )
        if ev_start is None or ev_end is None:
            continue
        if req_start_min < ev_end and req_end_min > ev_start:
            return ev
    return None


def _extract_minutes_any(value: str) -> Optional[int]:
    hhmm = _extract_hhmm_any(value)
    if hhmm is None:
        return None
    return _hhmm_to_min(hhmm)


def _picker_body(existing: list, target_date: str) -> str:
    if not existing:
        return f"{target_date or 'That day'} is open -- pick any slot."
    n = len(existing)
    return (
        f"{n} thing{'s' if n != 1 else ''} already on {target_date or 'that day'}. "
        f"Here's what fits around {'them' if n != 1 else 'it'}."
    )
