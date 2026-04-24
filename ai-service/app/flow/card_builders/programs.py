"""Program list cards for data_display — matches mobile ProgramActionCapsule (camelCase)."""

from __future__ import annotations


def _map_priority(raw) -> str:
    if raw in (1, "1", "mandatory", "high"):
        return "high"
    if raw in (2, "2", "medium"):
        return "medium"
    if raw in (3, "3", "low"):
        return "low"
    return "medium"


def _format_duration(p: dict) -> str:
    wk = p.get("duration_weeks")
    if wk is not None and wk != "":
        return f"{wk} weeks"
    dm = p.get("duration_minutes")
    if dm is not None:
        return f"~{dm} min / session"
    return "6 weeks"


def _format_frequency(p: dict) -> str:
    f = p.get("frequency")
    if f and f not in ("null", "undefined"):
        return str(f)
    return "3x/week"


def build_program_cards(data: dict) -> list[dict]:
    """
    Build program_action_capsule cards from get_my_programs tool output.

    Tool shape: { programs: [{ program_id, name, ... }], dataStatus, hint? }
    """
    if not data or not isinstance(data, dict):
        return []

    programs = data.get("programs") or []
    out: list[dict] = []
    for p in programs[:5]:
        if not isinstance(p, dict):
            continue
        pid = (p.get("program_id") or "").strip()
        name = (p.get("name") or "Training program").strip()
        reason = p.get("reason") or p.get("description") or p.get("position_note") or ""
        summary = " ".join(str(reason).split())[:200] if reason else None

        card = {
            "type": "program_action_capsule",
            "programId": pid,
            "programName": name,
            "frequency": _format_frequency(p),
            "duration": _format_duration(p),
            "priority": _map_priority(p.get("priority")),
            "currentStatus": None,
            "availableActions": ["details", "add_to_training"],
        }
        if summary:
            card["summary"] = summary
        out.append(card)

    return out


def build_programs_headline(data: dict) -> str:
    if (data or {}).get("dataStatus") == "recommendation_fallback":
        return "🏋️ Recommended Programs"
    return "Your programs"


def build_programs_chips(data: dict) -> list[dict]:
    if (data or {}).get("dataStatus") == "recommendation_fallback":
        return [
            {
                "label": "Build me a session",
                "message": "Build me a training session for today",
            },
            {
                "label": "Focus on speed",
                "message": "I want to improve my sprint speed",
            },
        ]
    return [
        {
            "label": "Recommend more",
            "message": "What programs do you recommend for me?",
        },
    ]
