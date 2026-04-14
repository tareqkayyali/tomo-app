"""
Card builder: readiness stat_grid
Transforms get_readiness_detail() tool result into a stat_grid card.
"""

from __future__ import annotations

import re


def build_readiness_card(data: dict) -> dict | None:
    """Build a stat_grid card from readiness check-in data.

    Args:
        data: Result from get_readiness_detail tool.

    Returns:
        stat_grid card dict, or None if data has error/no usable fields.
    """
    if not data or data.get("error"):
        return None

    items = []

    # Readiness RAG (Green/Yellow/Red)
    readiness = data.get("readiness")
    if readiness:
        highlight = {"Green": "green", "Yellow": "yellow", "Red": "red"}.get(
            str(readiness).title(), "yellow"
        )
        items.append({"label": "Readiness", "value": readiness.title(), "highlight": highlight})

    # Intensity recommendation
    intensity = data.get("intensity")
    if intensity:
        highlight = {
            "LIGHT": "yellow", "MODERATE": "green", "HARD": "green",
            "REST": "red",
        }.get(intensity.upper(), "yellow")
        items.append({
            "label": "Intensity",
            "value": intensity.replace("_", " ").title(),
            "highlight": highlight,
        })

    # Energy (1-10 → descriptive)
    energy = data.get("energy")
    if energy is not None:
        val = float(energy)
        desc = "High" if val >= 7 else "Good" if val >= 5 else "Low"
        highlight = "green" if val >= 7 else "yellow" if val >= 5 else "red"
        items.append({"label": "Energy", "value": desc, "highlight": highlight})

    # Soreness (1-10 → descriptive, inverted: lower is better)
    soreness = data.get("soreness")
    if soreness is not None:
        val = float(soreness)
        desc = "Heavy" if val >= 7 else "Moderate" if val >= 4 else "Fresh"
        highlight = "red" if val >= 7 else "yellow" if val >= 4 else "green"
        items.append({"label": "Soreness", "value": desc, "highlight": highlight})

    # Sleep
    sleep_hours = data.get("sleep_hours")
    if sleep_hours is not None:
        val = float(sleep_hours)
        highlight = "green" if val >= 7 else "yellow" if val >= 5 else "red"
        items.append({"label": "Sleep", "value": f"{val:.1f}h", "highlight": highlight})

    # Mood (1-10 → descriptive)
    mood = data.get("mood")
    if mood is not None:
        val = float(mood)
        desc = "Great" if val >= 7 else "Okay" if val >= 5 else "Low"
        highlight = "green" if val >= 7 else "yellow" if val >= 5 else "red"
        items.append({"label": "Mood", "value": desc, "highlight": highlight})

    # Pain flag
    if data.get("pain_flag"):
        location = data.get("pain_location") or "Flagged"
        items.append({"label": "Pain", "value": location.title(), "highlight": "red"})

    if not items:
        return None

    return {"type": "stat_grid", "items": items}


def build_readiness_headline(data: dict) -> str:
    """Generate a warm, coaching-style headline from readiness data.
    No LLM needed -- deterministic based on readiness level."""
    readiness = (data.get("readiness") or "").lower()
    energy = data.get("energy")

    if readiness == "red":
        return "Recovery day -- listen to your body"
    elif readiness == "yellow":
        if energy and float(energy) >= 6:
            return "Not bad -- keep it controlled today"
        return "Ease into it today"
    elif readiness == "green":
        if energy and float(energy) >= 8:
            return "Feeling sharp -- go get it"
        return "You're good to go"

    return "Here's where you're at"


def build_readiness_chips(data: dict) -> list[dict]:
    """Context-aware chips based on readiness state."""
    readiness = (data.get("readiness") or "").lower()

    if readiness == "red":
        return [
            {"label": "Recovery tips", "message": "What should I do for recovery?"},
            {"label": "Show schedule", "message": "What's on today?"},
        ]
    elif readiness == "yellow":
        return [
            {"label": "Build session", "message": "Build me a light session"},
            {"label": "Show schedule", "message": "What's on today?"},
        ]
    else:
        return [
            {"label": "Build session", "message": "Build me a training session"},
            {"label": "Show schedule", "message": "What's on today?"},
        ]
