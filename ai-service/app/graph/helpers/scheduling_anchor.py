"""
Infer which calendar day a scheduling follow-up refers to.

When the athlete says "tomorrow" in turn N and then "plan rest day with family"
in turn N+1 without repeating a day, models often default get_today_events to
today. This helper picks a deterministic anchor from recent Human messages.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Optional

from langchain_core.messages import HumanMessage


def _message_text(msg: Any) -> str:
    c = getattr(msg, "content", None)
    if isinstance(c, str):
        return c.strip()
    if isinstance(c, list):
        parts: list[str] = []
        for block in c:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text") or ""))
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(parts).strip()
    return str(c or "").strip()


def _add_days(today_iso: str, days: int) -> str:
    base = datetime.strptime(today_iso, "%Y-%m-%d").date()
    return (base + timedelta(days=days)).isoformat()


def _explicit_anchor_from_text(text: str, today_iso: str) -> Optional[str]:
    """Return YYYY-MM-DD when text names a day relative to player local today."""
    if not text:
        return None
    lower = text.lower()

    if re.search(r"\bday after tomorrow\b", lower):
        return _add_days(today_iso, 2)
    if re.search(r"\btomorrow\b", lower):
        return _add_days(today_iso, 1)
    if re.search(r"\btoday\b", lower) or re.search(r"\btonight\b", lower):
        return today_iso
    if re.search(r"\byesterday\b", lower):
        return _add_days(today_iso, -1)
    if re.search(r"\bnext week\b", lower):
        return _add_days(today_iso, 7)

    return None


def _has_explicit_calendar_day(text: str) -> bool:
    lower = text.lower()
    if _explicit_anchor_from_text(text, "2000-01-01") is not None:
        return True
    if re.search(
        r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        lower,
    ):
        return True
    if re.search(
        r"\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        lower,
    ):
        return True
    return False


def _scheduling_followup_without_new_day(text: str) -> bool:
    """Calendar-ish follow-up that does not name a new day (needs anchor from earlier turns)."""
    if not text.strip():
        return False
    if _has_explicit_calendar_day(text):
        return False
    lower = text.lower()
    return bool(
        re.search(
            r"\b(rest|family|schedule|calendar|plan|book|block|slot|session|event|time|day off|day-off)\b",
            lower,
        )
    )


def _human_messages_newest_first(messages: list) -> list[str]:
    out: list[str] = []
    for m in reversed(messages or []):
        if isinstance(m, HumanMessage):
            t = _message_text(m)
            if t:
                out.append(t)
    return out


def infer_scheduling_thread_anchor_date(messages: list, today_iso: str) -> Optional[str]:
    """
    If the latest user message continues a scheduling thread without naming a day,
    return the most recent explicit calendar day from earlier user turns.

    Example: "What about tomorrow?" -> "Let's do a rest day with family"
    returns tomorrow's YYYY-MM-DD relative to today_iso.
    """
    try:
        datetime.strptime(today_iso, "%Y-%m-%d")
    except ValueError:
        return None

    humans = _human_messages_newest_first(messages)
    if not humans:
        return None

    current = humans[0]
    direct = _explicit_anchor_from_text(current, today_iso)
    if direct:
        return direct

    if not _scheduling_followup_without_new_day(current):
        return None

    for prior in humans[1:]:
        d = _explicit_anchor_from_text(prior, today_iso)
        if d:
            return d

    return None
