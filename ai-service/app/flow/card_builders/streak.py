"""
Card builder: consistency/streak stat_grid
Transforms get_consistency_score() tool result into a stat_grid card.
"""

from __future__ import annotations


def build_streak_card(data: dict) -> dict | None:
    """Build a stat_grid card from consistency score data."""
    if not data or data.get("error"):
        return None

    items = []

    streak = data.get("streak_days")
    if streak is not None:
        highlight = "green" if streak >= 7 else "yellow" if streak >= 3 else "red"
        items.append({"label": "Streak", "value": f"{streak} days", "highlight": highlight})

    checkin_rate = data.get("checkin_consistency_7d")
    if checkin_rate is not None:
        pct = int(checkin_rate * 100) if checkin_rate <= 1 else int(checkin_rate)
        highlight = "green" if pct >= 80 else "yellow" if pct >= 50 else "red"
        items.append({"label": "Check-in Rate", "value": f"{pct}%", "highlight": highlight})

    compliance = data.get("plan_compliance_7d")
    if compliance is not None:
        pct = int(compliance * 100) if compliance <= 1 else int(compliance)
        highlight = "green" if pct >= 80 else "yellow" if pct >= 50 else "red"
        items.append({"label": "Plan Compliance", "value": f"{pct}%", "highlight": highlight})

    coachability = data.get("coachability_index")
    if coachability is not None:
        val = float(coachability)
        desc = "High" if val >= 0.8 else "Good" if val >= 0.5 else "Building"
        highlight = "green" if val >= 0.8 else "yellow" if val >= 0.5 else "red"
        items.append({"label": "Coachability", "value": desc, "highlight": highlight})

    journal_streak = data.get("journal_streak_days")
    if journal_streak is not None and journal_streak > 0:
        items.append({"label": "Journal Streak", "value": f"{journal_streak} days", "highlight": "green"})

    if not items:
        return None

    return {"type": "stat_grid", "items": items}


def build_streak_headline(data: dict) -> str:
    """Deterministic headline from streak data."""
    streak = data.get("streak_days", 0)
    if streak >= 14:
        return f"{streak}-day streak -- on fire"
    elif streak >= 7:
        return f"{streak} days strong -- keep it rolling"
    elif streak >= 3:
        return f"{streak}-day streak -- building momentum"
    elif streak >= 1:
        return f"{streak} day{'s' if streak > 1 else ''} -- every day counts"
    return "No streak yet -- start today"


def build_streak_chips(data: dict) -> list[dict]:
    """Context-aware chips for streak view."""
    streak = data.get("streak_days", 0)
    if streak == 0:
        return [
            {"label": "Check in", "message": "Log my daily check-in"},
            {"label": "Build session", "message": "Build me a training session"},
        ]
    return [
        {"label": "Show schedule", "message": "What's on today?"},
        {"label": "Check readiness", "message": "What's my readiness?"},
    ]
