"""
Card builder: conflict_resolution_capsule
Transforms detect_load_collision tool output into the mobile capsule shape.

Tool output:
  {
    "date": "YYYY-MM-DD",
    "days_checked": int,
    "total_events": int,
    "conflicts": [{date, issue, severity, events[], suggestions[]}],
    ...legacy fields
  }

Capsule shape (mobile ConflictResolutionCapsule.tsx):
  {
    "type": "conflict_resolution_capsule",
    "conflicts": [...],
    "daysChecked": int,
    "totalEvents": int,
  }
"""

from __future__ import annotations


def build_conflicts_card(data: dict) -> dict:
    """Build the conflict_resolution_capsule card from detect_load_collision output."""
    conflicts = data.get("conflicts") or []
    return {
        "type": "conflict_resolution_capsule",
        "conflicts": conflicts,
        "daysChecked": int(data.get("days_checked") or 0),
        "totalEvents": int(data.get("total_events") or 0),
    }


def build_conflicts_headline(data: dict) -> str:
    conflicts = data.get("conflicts") or []
    if not conflicts:
        return "Schedule looks clean"
    n = len(conflicts)
    return f"{n} Schedule Conflict{'s' if n > 1 else ''}"


def build_conflicts_chips(data: dict) -> list[dict]:
    conflicts = data.get("conflicts") or []
    if conflicts:
        return [
            {"label": "Fix all conflicts", "message": "Help me resolve all my schedule conflicts"},
            {"label": "View my week", "message": "Show me this week's full schedule"},
        ]
    return [
        {"label": "Add training", "message": "I want to add a training session"},
        {"label": "View my week", "message": "Show me this week's full schedule"},
    ]
