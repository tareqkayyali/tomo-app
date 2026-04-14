"""
Card builder: test history stat_grid
Transforms get_test_results() tool result into a stat_grid card.
"""

from __future__ import annotations


def build_test_history_card(data: dict) -> dict | None:
    """Build a stat_grid card from test results data.

    Shows the most recent result per test type (up to 6 items).
    """
    if not data or data.get("error"):
        return None

    results = data.get("results", [])
    if not results:
        return None

    # Group by test_type, take latest per type
    latest_by_type: dict[str, dict] = {}
    for r in results:
        tt = r.get("test_type", "unknown")
        if tt not in latest_by_type:
            latest_by_type[tt] = r

    items = []
    for test_type, r in list(latest_by_type.items())[:6]:
        label = _format_test_name(test_type)
        score = r.get("score")
        unit = r.get("unit", "")
        percentile = r.get("percentile")

        if score is not None:
            value = f"{score:.1f}" if isinstance(score, float) else str(score)
            if unit:
                value += f" {unit}"
        else:
            value = "--"

        # Highlight based on percentile
        if percentile is not None:
            highlight = "green" if percentile >= 60 else "yellow" if percentile >= 30 else "red"
        else:
            highlight = "green"

        items.append({"label": label, "value": value, "highlight": highlight})

    if not items:
        return None

    return {"type": "stat_grid", "items": items}


def build_test_history_headline(data: dict) -> str:
    """Deterministic headline from test history data."""
    total = data.get("total", 0)
    results = data.get("results", [])

    if total == 0:
        return "No tests logged yet"

    # Count unique test types
    types = set(r.get("test_type") for r in results if r.get("test_type"))

    if len(types) == 1:
        name = _format_test_name(results[0].get("test_type", "test"))
        return f"Your {name.lower()} results"
    return f"{total} results across {len(types)} tests"


def build_test_history_chips(data: dict) -> list[dict]:
    """Context-aware chips for test history view."""
    total = data.get("total", 0)
    if total == 0:
        return [
            {"label": "Log a test", "message": "Log a test result"},
            {"label": "What tests?", "message": "What tests can I log?"},
        ]
    return [
        {"label": "Log a test", "message": "Log a test result"},
        {"label": "Benchmarks", "message": "How do I compare to benchmarks?"},
    ]


def _format_test_name(test_type: str) -> str:
    """Convert test_type slug to readable name."""
    name_map = {
        "sprint_20m": "20m Sprint",
        "sprint_flying_20m": "Flying 20m",
        "sprint_40m": "40m Sprint",
        "sprint_10m": "10m Sprint",
        "cmj": "CMJ",
        "squat_jump": "Squat Jump",
        "agility_505": "5-0-5 Agility",
        "agility_ttest": "T-Test",
        "agility_5105": "5-10-5",
        "illinois_agility": "Illinois",
        "arrowhead_agility": "Arrowhead",
        "yo_yo_ir1": "Yo-Yo IR1",
        "beep_test": "Beep Test",
        "cooper_test": "Cooper Test",
        "1rm_squat": "1RM Squat",
        "1rm_bench": "1RM Bench",
        "1rm_deadlift": "1RM Deadlift",
        "grip_strength": "Grip Strength",
        "sit_and_reach": "Sit & Reach",
    }
    return name_map.get(test_type, test_type.replace("_", " ").title())
