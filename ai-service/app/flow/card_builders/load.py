"""
Card builder: training load stat_grid
Transforms get_dual_load_score() tool result into a stat_grid card.

CRITICAL: Never show raw ACWR or HRV numbers to the athlete.
Always convert to descriptive labels (Pulse spec / zero-jargon rule).
"""

from __future__ import annotations


def build_load_card(data: dict) -> dict | None:
    """Build a stat_grid card from dual load score data."""
    if not data or data.get("error"):
        return None

    items = []

    # Training Load (from ACWR -- never show raw number)
    acwr = data.get("acwr")
    if acwr is not None:
        val = float(acwr)
        if val > 1.5:
            desc, highlight = "Spiked", "red"
        elif val > 1.3:
            desc, highlight = "Elevated", "yellow"
        elif val > 1.0:
            desc, highlight = "Building", "green"
        elif val > 0.8:
            desc, highlight = "Good", "green"
        else:
            desc, highlight = "Low", "yellow"
        items.append({"label": "Training Load", "value": desc, "highlight": highlight})

    # Injury Risk
    injury_risk = data.get("injury_risk")
    if injury_risk is not None:
        desc = "Elevated" if injury_risk else "Low"
        highlight = "red" if injury_risk else "green"
        items.append({"label": "Injury Risk", "value": desc, "highlight": highlight})

    # Dual Load Zone
    zone = data.get("dual_load_zone")
    if zone:
        highlight = {"LOW": "green", "MODERATE": "yellow", "HIGH": "red"}.get(zone.upper(), "yellow")
        items.append({"label": "Overall Load", "value": zone.title(), "highlight": highlight})

    # Intensity Modifier
    modifier = data.get("intensity_modifier")
    if modifier and modifier != "1.0x":
        items.append({"label": "Intensity Cap", "value": modifier, "highlight": "yellow"})

    # Training Monotony (variety indicator)
    monotony = data.get("training_monotony")
    if monotony is not None:
        val = float(monotony)
        if val > 2.0:
            desc, highlight = "Too repetitive", "red"
        elif val > 1.5:
            desc, highlight = "Could vary more", "yellow"
        else:
            desc, highlight = "Good variety", "green"
        items.append({"label": "Training Variety", "value": desc, "highlight": highlight})

    if not items:
        return None

    return {"type": "stat_grid", "items": items}


def build_load_headline(data: dict) -> str:
    """Deterministic headline from load data."""
    acwr = data.get("acwr")
    injury_risk = data.get("injury_risk")

    if injury_risk:
        return "Load's running hot -- watch it"
    if acwr is not None:
        val = float(acwr)
        if val > 1.5:
            return "Load spike detected -- ease off"
        elif val > 1.3:
            return "Load's climbing -- stay smart"
        elif val > 0.8:
            return "Load's in a good spot"
        else:
            return "Load's light -- room to push"
    return "Here's your training load"


def build_load_chips(data: dict) -> list[dict]:
    """Context-aware chips for load view."""
    injury_risk = data.get("injury_risk")
    if injury_risk:
        return [
            {"label": "Recovery tips", "message": "What should I do for recovery?"},
            {"label": "Show schedule", "message": "What's on today?"},
        ]
    return [
        {"label": "Build session", "message": "Build me a training session"},
        {"label": "Show schedule", "message": "What's on today?"},
    ]
