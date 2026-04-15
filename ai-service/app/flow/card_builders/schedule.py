"""
Card builders: schedule_list and week_schedule
Transforms get_today_events / get_week_schedule tool results into cards.
"""

from __future__ import annotations

import re
from datetime import datetime


def _format_12h(time_str: str) -> str:
    """Convert ISO timestamp or HH:MM to 12h format (e.g., '5:30 PM')."""
    if not time_str:
        return ""
    try:
        # Try ISO timestamp first (e.g., "2026-04-14 17:30:00")
        match = re.search(r"(\d{2}):(\d{2})", time_str)
        if match:
            h, m = int(match.group(1)), int(match.group(2))
            period = "PM" if h >= 12 else "AM"
            h12 = h % 12 or 12
            return f"{h12}:{m:02d} {period}"
    except (ValueError, IndexError):
        pass
    return time_str


def _format_date(date_str: str) -> str:
    """Format YYYY-MM-DD to readable 'Mon Apr 14'."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt.strftime("%a %b %d")
    except (ValueError, TypeError):
        return date_str


def _strip_emoji(text: str) -> str:
    """Remove emoji characters."""
    if not text:
        return text
    return re.sub(
        r'[\U0001F600-\U0001F9FF'
        r'\U0001F300-\U0001F5FF'
        r'\U00002600-\U000027BF'
        r'\U0000FE00-\U0000FE0F'
        r'\U0000200D'
        r'\U00002702-\U000027B0'
        r'\U0001FA00-\U0001FA6F'
        r'\U0001FA70-\U0001FAFF'
        r']+', '', text
    ).strip()


def filter_active_and_upcoming(events: list, card_date: str, context) -> list:
    """Drop events that ended before the athlete's current local time, when
    the card is for today. Future/past day cards are returned unchanged.

    Shared between data_display and format_response timeline enforcement so
    both code paths hide finished events consistently.
    """
    if not events or not isinstance(events, list) or not context:
        return events
    today_date = getattr(context, "today_date", None)
    current_time = getattr(context, "current_time", None)
    if not today_date or not current_time or card_date != today_date:
        return events
    try:
        now_hhmm = datetime.strptime(current_time, "%H:%M")
    except (ValueError, TypeError):
        return events

    kept: list = []
    for ev in events:
        start_iso = ev.get("start_time", "") or ""
        end_iso = ev.get("end_time", "") or ""
        try:
            start_hhmm = datetime.strptime(start_iso[11:16], "%H:%M") if len(start_iso) >= 16 else None
            end_hhmm = datetime.strptime(end_iso[11:16], "%H:%M") if len(end_iso) >= 16 else None
        except (ValueError, TypeError):
            kept.append(ev)
            continue

        # Drop if event clearly ended before now
        if end_hhmm is not None and end_hhmm <= now_hhmm:
            continue
        # Keep if starts now or later
        if start_hhmm is not None and start_hhmm >= now_hhmm:
            kept.append(ev)
            continue
        # Keep active (start <= now < end)
        if end_hhmm is not None and end_hhmm > now_hhmm:
            kept.append(ev)
            continue
        # No end time and start in the past -> assume done, drop
    return kept


def build_schedule_card(data: dict) -> dict | None:
    """Build a schedule_list card from get_today_events result.

    Args:
        data: {"date": str, "events": [...], "total": int}

    Returns:
        schedule_list card dict, or None on error.
    """
    if not data or data.get("error"):
        return None

    events = data.get("events", [])
    date_str = data.get("date", "")

    items = []
    for ev in events:
        time_str = _format_12h(ev.get("start_time", ""))
        items.append({
            "time": time_str or "--",
            "title": _strip_emoji(ev.get("title", "Event")),
            "type": ev.get("event_type", "other"),
        })

    if not items:
        items = [{"time": "--", "title": "Rest day -- nothing scheduled", "type": "rest"}]

    return {
        "type": "schedule_list",
        "date": _format_date(date_str),
        "items": items,
    }


def build_week_schedule_cards(data: dict) -> list[dict]:
    """Build schedule_list cards from get_week_schedule result.

    Args:
        data: {"schedule": [{"date": ..., "events": [...]}, ...], ...}

    Returns:
        List of schedule_list card dicts (one per day with events).
    """
    if not data or data.get("error"):
        return []

    schedule = data.get("schedule", [])
    cards = []

    for day in schedule:
        events = day.get("events", [])
        if not events:
            continue  # Skip rest days in week view (keeps output compact)

        items = []
        for ev in events:
            time_str = _format_12h(ev.get("start_time", ""))
            items.append({
                "time": time_str or "--",
                "title": _strip_emoji(ev.get("title", "Event")),
                "type": ev.get("event_type", "other"),
            })

        cards.append({
            "type": "schedule_list",
            "date": _format_date(day.get("date", "")),
            "items": items,
        })

    return cards


def build_schedule_headline(data: dict) -> str:
    """Deterministic headline from today's schedule data."""
    total = data.get("total", 0)
    if total == 0:
        return "Rest day -- nothing on the books"
    elif total == 1:
        event = data["events"][0] if data.get("events") else {}
        title = event.get("title", "session")
        return f"One thing today -- {title.lower()}"
    else:
        return f"{total} things on today"


def build_week_headline(data: dict) -> str:
    """Deterministic headline from week schedule data."""
    total = data.get("total_events", 0)
    schedule = data.get("schedule", [])
    rest_days = sum(1 for d in schedule if d.get("is_rest_day"))

    if total == 0:
        return "Open week -- nothing scheduled yet"
    elif rest_days == 0:
        return f"Full week -- {total} sessions, no rest days"
    else:
        return f"Your week -- {total} sessions, {rest_days} rest day{'s' if rest_days > 1 else ''}"


def build_schedule_chips(data: dict) -> list[dict]:
    """Context-aware chips for daily schedule."""
    total = data.get("total", 0)
    if total == 0:
        return [
            {"label": "Add training", "message": "Add a training session today"},
            {"label": "Show my week", "message": "What does my week look like?"},
        ]
    return [
        {"label": "Add event", "message": "Add an event to my schedule"},
        {"label": "Check collisions", "message": "Check for any schedule conflicts"},
    ]


def build_week_chips() -> list[dict]:
    """Default chips for week schedule view."""
    return [
        {"label": "Add event", "message": "Add an event to my schedule"},
        {"label": "Check collisions", "message": "Check for scheduling conflicts"},
    ]
