"""
Tomo AI Service — Response Formatting Node
Parses agent response into structured TomoResponse with cards + chips.

3-strategy parsing:
  1. Fenced JSON: ```json { ... } ```
  2. Pure JSON: { "headline": ... }
  3. Brace extraction: first { ... } block
  4. Fallback: plain text → text_card

Also handles:
  - Write action confirmation responses
  - Capsule responses (direct action results)
  - Error formatting
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from app.models.state import TomoChatState

logger = logging.getLogger("tomo-ai.format_response")

# ── Pulse layout constants ──
DATA_CARD_TYPES = frozenset({
    "stat_grid", "stat_row", "schedule_list", "zone_stack",
    "benchmark_bar", "session_plan", "program_recommendation",
    "program_detail",
    "clash_list", "phv_assessment", "drill_card", "week_schedule",
    "week_plan", "choice_card",
})

# Body text limit — keep responses tight, let cards do the heavy lifting
MAX_BODY_SENTENCES = 3


# Tools invoked from mobile capsules that are READS but were wired through
# confirmedAction → write_confirmed (see backend chat route capsuleAction mapping).
# They must not use the Pulse "done / Confirmed" write template.
_READ_ONLY_PROGRAM_CAPSULE_TOOLS = frozenset({
    "get_program_details",
    "get_program_drill_breakdown",
})

# Default block length (minutes) when the program tool has no per-drill duration —
# only patterns + sets/reps. Keeps totalDuration > 0 for session_plan card.
_DEFAULT_PROGRAM_BLOCK_MIN = 12


def _map_prescription_to_intensity(
    rpe: object,
    raw: object,
) -> str:
    """Return mobile SessionPlanItem intensity: light | moderate | hard."""
    if isinstance(rpe, (int, float)):
        if rpe >= 8:
            return "hard"
        if rpe >= 5:
            return "moderate"
        return "light"
    s = (str(raw) if raw is not None else "").lower()
    if any(x in s for x in ("max", "heavy", "hard", "sprint", "explosive")):
        return "hard"
    if any(x in s for x in ("light", "easy", "mobility", "walk", "activation")):
        return "light"
    return "moderate"


def _build_session_plan_card_from_program_drills(
    name: str,
    program_id: str | None,
    drills: list[dict],
) -> dict:
    """
    Build a session_plan card from get_program_drill_breakdown `drills` list.
    Matches mobile SessionPlan / SessionPlanItem (types/chat.ts).
    """
    safe_pid = re.sub(r"[^a-zA-Z0-9_-]+", "-", (program_id or "program").strip())[:48] or "program"
    items: list[dict] = []
    for i, d in enumerate(drills, 1):
        if not isinstance(d, dict):
            continue
        pat = (d.get("pattern") or d.get("name") or f"Block {i}").strip()
        if not pat:
            continue
        sets, reps = d.get("sets"), d.get("reps")
        label = pat
        if sets is not None or reps is not None:
            sr = f"{sets if sets is not None else '—'}×{reps if reps is not None else '—'}"
            label = f"{pat} ({sr})"
        rpe = d.get("rpe")
        raw_int = d.get("intensity")
        intensity = _map_prescription_to_intensity(rpe, raw_int)
        rest = d.get("rest")
        reason_parts = []
        if rest:
            reason_parts.append(f"Rest: {rest}")
        reason = " · ".join(reason_parts) if reason_parts else None
        items.append(
            {
                "drillId": f"cv-prog:{safe_pid}:{i}",
                "name": label,
                "category": "training",
                "duration": _DEFAULT_PROGRAM_BLOCK_MIN,
                "intensity": intensity,
                "attributeKeys": [],
                **({"reason": reason} if reason else {}),
            }
        )
    total = len(items) * _DEFAULT_PROGRAM_BLOCK_MIN
    return {
        "type": "session_plan",
        "title": f"{name} — blocks",
        "totalDuration": total,
        "readiness": "Green",
        "items": items,
    }


def _stringify_targeted_gaps(raw: object) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for g in raw:
        if isinstance(g, dict):
            lab = (g.get("label") or g.get("metric") or "").strip()
            if lab:
                out.append(lab)
        elif isinstance(g, str) and g.strip():
            out.append(g.strip())
    return out[:8]


def _program_detail_card_from_tool_data(data: dict) -> dict:
    """
    Build program_detail card (camelCase) for mobile — mirrors Programs tab ExpandedBody fields.
    Accepts get_program_drill_breakdown / get_program_details tool dict (snake_case + nested prescription).
    """
    pid = str(data.get("program_id") or data.get("programId") or "").strip()
    name = (data.get("name") or "Program").strip()
    rx_src = dict(data.get("prescription") or {}) if isinstance(data.get("prescription"), dict) else {}
    dose = data.get("dose") if isinstance(data.get("dose"), dict) else {}
    rx: dict = {**rx_src}
    for k in ("sets", "reps", "intensity", "rpe", "rest", "frequency"):
        if dose.get(k) is not None:
            rx[k] = dose[k]
    cues = (
        rx.get("coachingCues")
        or rx.get("coaching_cues")
        or data.get("coaching_cues")
        or []
    )
    if isinstance(cues, list):
        coaching_cues = [str(c).strip() for c in cues if str(c).strip()]
    else:
        coaching_cues = []
    tags = data.get("tags") or []
    if not isinstance(tags, list):
        tags = []
    tags = [str(t) for t in tags if t]
    phv = data.get("phv_warnings") or data.get("phvWarnings") or []
    if not isinstance(phv, list):
        phv = []
    phv = [str(x) for x in phv if x]
    return {
        "type": "program_detail",
        "programId": pid or name.lower().replace(" ", "-")[:48],
        "name": name,
        "source": data.get("source") if data.get("source") in ("coach", "ai_recommended", "player_added") else None,
        "category": (data.get("category") or "").strip() or None,
        "programType": (data.get("type") or "physical"),
        "priority": data.get("priority"),
        "frequency": (data.get("frequency") or rx.get("frequency") or "").strip() or None,
        "durationMin": data.get("duration_minutes") if data.get("duration_minutes") is not None else data.get("durationMin"),
        "durationWeeks": data.get("duration_weeks") if data.get("duration_weeks") is not None else data.get("durationWeeks"),
        "difficulty": (data.get("difficulty") or "").strip() or None,
        "impact": (data.get("impact") or "").strip() or None,
        "description": (data.get("description") or "").strip() or None,
        "positionNote": (data.get("position_note") or data.get("positionNote") or "").strip() or None,
        "reason": (data.get("reason") or "").strip() or None,
        "phvWarnings": phv,
        "tags": tags[:12],
        "prescription": {
            "sets": rx.get("sets"),
            "reps": rx.get("reps"),
            "rpe": rx.get("rpe"),
            "rest": rx.get("rest"),
            "intensity": rx.get("intensity"),
            "frequency": rx.get("frequency"),
            "coachingCues": coaching_cues[:12],
        },
        "targetedGaps": _stringify_targeted_gaps(data.get("targeted_gaps")),
    }


def _build_program_read_capsule_response(results: list[dict]) -> dict | None:
    """
    Turn get_program_details / get_program_drill_breakdown tool results into a normal
    coaching response. Returns None if the confirmed_results batch is not only these reads.
    """
    if not results:
        return None

    for r in results:
        tool = (r.get("tool") or "").strip()
        if tool not in _READ_ONLY_PROGRAM_CAPSULE_TOOLS:
            return None
    if not all(r.get("success") for r in results):
        return None

    for r in results:
        data = r.get("result")
        if not isinstance(data, dict):
            continue

        if data.get("error"):
            return {
                "headline": "Couldn't open that program",
                "body": str(data.get("error", "Try again in a second."))[:500],
                "cards": [],
                "chips": [
                    {"label": "What programs do I have?", "message": "What programs do I have?"},
                ],
            }

        name = (data.get("name") or "Your program").strip()
        impact_raw = (data.get("impact") or "").strip()
        # Hook line for the turn title (matches in-chat coaching style)
        if impact_raw and "—" in impact_raw[:140]:
            headline = impact_raw.split("\n")[0].strip()[:200]
        elif impact_raw:
            headline = impact_raw.split("\n")[0].strip()[:140]
        else:
            headline = name

        detail_card = _program_detail_card_from_tool_data(data)
        cards: list[dict] = [detail_card]

        pid = data.get("program_id") or data.get("programId")
        drills = data.get("drills") or []
        dict_drills = [d for d in drills if isinstance(d, dict)] if isinstance(drills, list) else []
        if dict_drills:
            sp_card = _build_session_plan_card_from_program_drills(
                name=name,
                program_id=str(pid) if pid is not None else None,
                drills=dict_drills,
            )
            if sp_card.get("items"):
                cards.append(sp_card)

        chips = [
            {"label": "Add to my week", "message": f'Add "{name}" to my training'},
            {"label": "Show my other programs", "message": "What programs do you have for me?"},
        ]

        # Full prescription / "why" / cues live in program_detail (Programs tab parity).
        # Body stays empty so _pulse_post_process does not sentence-truncate benchmark copy.
        return {
            "headline": headline,
            "body": "",
            "cards": cards,
            "chips": chips,
        }

    return None


def _build_context_stat_grid(state: TomoChatState) -> Optional[dict]:
    """
    Build a readiness stat_grid from player context when the LLM
    fails to include a data card. Returns None if no context available.
    """
    ctx = state.get("player_context")
    if not ctx:
        return None

    snapshot = getattr(ctx, "snapshot_enrichment", None)
    items = []

    # Readiness RAG
    readiness_rag = getattr(snapshot, "readiness_rag", None) if snapshot else None
    readiness_score = getattr(snapshot, "readiness_score", None) if snapshot else None
    if readiness_rag or readiness_score is not None:
        rag_val = readiness_rag or "—"
        highlight = {"Green": "green", "Yellow": "yellow", "Red": "red"}.get(
            str(rag_val).title(), "yellow"
        )
        display = f"{rag_val}" + (f" ({int(readiness_score)})" if readiness_score else "")
        items.append({"label": "Readiness", "value": display, "highlight": highlight})

    # Injury risk
    injury = getattr(snapshot, "injury_risk_flag", None) if snapshot else None
    if injury:
        highlight = {"GREEN": "green", "AMBER": "yellow", "RED": "red"}.get(
            injury.upper(), "yellow"
        )
        items.append({"label": "Injury Risk", "value": injury.title(), "highlight": highlight})

    # CCRS Readiness Score (primary readiness signal, replaces ACWR display)
    ccrs = getattr(snapshot, "ccrs", None) if snapshot else None
    ccrs_rec = getattr(snapshot, "ccrs_recommendation", None) if snapshot else None
    if ccrs is not None:
        highlight = "red" if ccrs < 45 else ("yellow" if ccrs < 70 else "green")
        label = "Readiness" if not ccrs_rec else f"Readiness ({ccrs_rec.replace('_', ' ').title()})"
        items.append({"label": label, "value": f"{ccrs:.0f}/100", "highlight": highlight})

    # Data confidence
    data_conf = getattr(snapshot, "data_confidence_score", None) if snapshot else None
    if data_conf is not None:
        highlight = "red" if data_conf < 40 else ("yellow" if data_conf < 70 else "green")
        items.append({"label": "Data Confidence", "value": f"{int(data_conf)}%", "highlight": highlight})

    if not items:
        return None

    return {"type": "stat_grid", "items": items}


def _truncate_body(body: str, max_sentences: int = MAX_BODY_SENTENCES) -> str:
    """
    Truncate body to max N sentences. Pulse: data cards do the work, not prose.
    Handles bullet lists, numbered lists, and multi-line content — not just periods.
    """
    if not body:
        return body

    text = body.strip()

    # Strip bullet/check markers for cleaner output
    # Split on: sentence boundaries, newlines, bullet prefixes
    lines = [
        ln.strip().lstrip("•✓✔✗✘-–—*▸▹›»→⇒·● ").lstrip("0123456789.)")
        .strip()
        for ln in re.split(r'\n+', text)
        if ln.strip()
    ]

    if not lines:
        return text

    # If it's a simple 1-2 line response, return as-is
    if len(lines) <= max_sentences:
        # Still check sentence count within each line
        all_sentences = []
        for ln in lines:
            all_sentences.extend(re.split(r'(?<=[.!?])\s+', ln))
        if len(all_sentences) <= max_sentences:
            return text

    # Take first N meaningful segments, join as prose
    segments = []
    for ln in lines:
        sents = re.split(r'(?<=[.!?])\s+', ln)
        segments.extend(sents)
        if len(segments) >= max_sentences:
            break

    return " ".join(segments[:max_sentences])


def _strip_emoji(text: str) -> str:
    """Remove emoji characters from text. Pulse spec: no emoji in headings."""
    if not text:
        return text
    # Remove common emoji unicode ranges
    cleaned = re.sub(
        r'[\U0001F600-\U0001F9FF'   # Emoticons + Supplemental Symbols
        r'\U0001F300-\U0001F5FF'    # Misc Symbols & Pictographs
        r'\U00002600-\U000027BF'    # Misc Symbols + Dingbats
        r'\U0000FE00-\U0000FE0F'    # Variation Selectors
        r'\U0000200D'               # Zero Width Joiner
        r'\U00002702-\U000027B0'    # Dingbats
        r'\U0001FA00-\U0001FA6F'    # Chess Symbols
        r'\U0001FA70-\U0001FAFF'    # Symbols Extended-A
        r']+', '', text
    ).strip()
    return cleaned


def _format_12h(time_24: str) -> str:
    """Convert 24h time string (HH:MM) to 12h format (e.g., '5:45 PM')."""
    try:
        parts = time_24.strip().split(":")
        h, m = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
        period = "PM" if h >= 12 else "AM"
        h12 = h % 12 or 12
        return f"{h12}:{m:02d} {period}"
    except (ValueError, IndexError):
        return time_24


def _extract_time_from_iso(iso_str: str) -> str:
    """Extract time from ISO datetime string in 12h format (e.g., '5:30 PM')."""
    if not iso_str:
        return ""
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return _format_12h(dt.strftime("%H:%M"))
    except (ValueError, TypeError, AttributeError):
        # Fallback: regex for T15:30 pattern
        match = re.search(r'T?(\d{2}:\d{2})', iso_str)
        return _format_12h(match.group(1)) if match else ""


def _filter_active_and_upcoming(
    events: list,
    card_date: str,
    state: TomoChatState | None,
) -> list:
    """Thin wrapper around the shared card_builders.schedule helper so the
    format_response enforcement path and data_display follow the same rule.
    """
    from app.flow.card_builders.schedule import filter_active_and_upcoming
    player_context = (state or {}).get("player_context") if state else None
    return filter_active_and_upcoming(events, card_date, player_context)


_PROGRAM_DETAIL_TOOLS = frozenset({
    "get_program_drill_breakdown",
    "get_program_by_name",
    "get_program_details",
    "get_program_by_id",
})


def _ensure_program_detail_card(structured: dict, state: TomoChatState) -> dict:
    """
    Enforcement: when the output agent called a program detail tool but the LLM
    generated only headline/body text (no program_detail card), auto-build the
    card from tool results. Mirrors _ensure_timeline_card pattern.
    """
    cards = structured.get("cards", [])
    has_program_card = any(
        c.get("type") in ("program_detail", "program_recommendation")
        for c in cards
    )
    if has_program_card:
        return structured

    messages = state.get("messages", [])
    for msg in reversed(messages):
        if not hasattr(msg, "tool_call_id"):
            continue
        content = getattr(msg, "content", None)
        if not content or not isinstance(content, str):
            continue
        try:
            data = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(data, dict) or data.get("error"):
            continue
        name = (data.get("name") or "").strip()
        if not name:
            continue
        if not (data.get("program_id") or data.get("programId")):
            continue
        has_detail = bool(
            data.get("prescription")
            or data.get("drills")
            or data.get("reason")
            or data.get("description")
        )
        if not has_detail:
            continue

        detail_card = _program_detail_card_from_tool_data(data)
        cards_to_add: list[dict] = [detail_card]

        drills = data.get("drills") or []
        dict_drills = [d for d in drills if isinstance(d, dict)]
        if dict_drills:
            sp_card = _build_session_plan_card_from_program_drills(
                name=name,
                program_id=str(data.get("program_id") or data.get("programId") or ""),
                drills=dict_drills,
            )
            if sp_card.get("items"):
                cards_to_add.append(sp_card)

        non_text_cards = [c for c in cards if c.get("type") not in ("text_card", "coach_note")]
        structured["cards"] = cards_to_add + non_text_cards

        if not structured.get("chips"):
            structured["chips"] = [
                {"label": "Add to my week", "message": f'Add "{name}" to my training'},
                {"label": "My other programs", "message": "What programs do you have for me?"},
            ]

        logger.info(f"Program enforcement: injected program_detail card for '{name}'")
        return structured

    return structured


def _ensure_timeline_card(structured: dict, state: TomoChatState) -> dict:
    """
    Enforce schedule_list card for timeline agent responses.
    If the LLM produced text but no schedule card, build one from tool results.
    """
    if not state or state.get("selected_agent") != "timeline":
        return structured

    # Already has a schedule card — nothing to do
    cards = structured.get("cards", [])
    has_schedule = any(
        c.get("type") in ("schedule_list", "week_schedule", "week_plan")
        for c in cards
    )
    if has_schedule:
        return structured

    # Look for schedule data in ToolMessage objects from state messages
    messages = state.get("messages", [])
    for msg in reversed(messages):
        content = getattr(msg, "content", None)
        if not content or not isinstance(content, str):
            continue
        # ToolMessage has tool_call_id attribute
        if not hasattr(msg, "tool_call_id"):
            continue
        try:
            data = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            continue

        # get_today_events result: {"date": "...", "events": [...], "total": N}
        if isinstance(data, dict) and "events" in data and "date" in data:
            # When the card is for TODAY, filter to active + upcoming
            # events only. No athlete wants to scroll past a 3 AM session
            # they already finished.
            raw_events = list(data.get("events") or [])
            raw_events = _filter_active_and_upcoming(
                raw_events,
                data.get("date", ""),
                state,
            )
            items = []
            for ev in raw_events:
                time_str = _extract_time_from_iso(ev.get("start_time", ""))
                items.append({
                    "time": time_str or "—",
                    "title": _strip_emoji(ev.get("title", "Event")),
                    "type": ev.get("event_type", "other"),
                })
            if not items:
                # Either the day had no events OR every event is already done.
                all_done = bool(data.get("events")) and not items
                rest_label = (
                    "Day's done — nothing left on the board"
                    if all_done
                    else "Rest day — nothing scheduled"
                )
                items = [{"time": "—", "title": rest_label, "type": "rest"}]
            schedule_card = {
                "type": "schedule_list",
                "date": _format_confirm_date(data["date"]),
                "items": items,
            }
            structured["cards"] = [schedule_card] + structured.get("cards", [])
            logger.info("Timeline enforcement: injected schedule_list from tool results")
            return structured

        # get_week_schedule result: {"schedule": [{"date": ..., "events": [...]}, ...]}
        if isinstance(data, dict) and "schedule" in data:
            schedule_cards = []
            for day in data["schedule"]:
                if day.get("events"):
                    items = []
                    for ev in day["events"]:
                        time_str = _extract_time_from_iso(ev.get("start_time", ""))
                        items.append({
                            "time": time_str or "—",
                            "title": _strip_emoji(ev.get("title", "Event")),
                            "type": ev.get("event_type", "other"),
                        })
                    schedule_cards.append({
                        "type": "schedule_list",
                        "date": _format_confirm_date(day["date"]),
                        "items": items,
                    })
            if schedule_cards:
                structured["cards"] = schedule_cards + structured.get("cards", [])
                logger.info(f"Timeline enforcement: injected {len(schedule_cards)} schedule_list cards")
                return structured

    return structured


def _chips_from_top_card(structured: dict, state: TomoChatState) -> list[dict]:
    """Build context-aware chips from the content of the top card.

    Fires ONLY when the agent produced no chips AND a data card exists
    AND the intent is not a conversation-open one (smalltalk/greeting).
    Conservative by design: returning [] means the downstream fallbacks
    (timeline defaults, check-in pill) take over.

    The goal is to reference what the athlete is actually looking at in
    the card -- e.g. if a stat_grid shows readiness/recovery, suggest a
    follow-up that references the top metric instead of a generic menu.
    """
    if not state:
        return []

    # Never overwrite agent-specified empty chips for conversational intents
    intent_id = state.get("intent_id", "") or ""
    if intent_id in ("smalltalk", "greeting"):
        return []

    cards = structured.get("cards", []) or []
    if not cards:
        return []

    top = cards[0]
    card_type = top.get("type", "")

    # ── Readiness card: chips reference the actual level ──
    if card_type in ("readiness_card", "readiness"):
        level_raw = str(top.get("level") or top.get("rag") or top.get("status") or "").upper()
        if "RED" in level_raw:
            return [
                {"label": "Recovery tips", "message": "What recovery should I do today?"},
                {"label": "Show schedule", "message": "What's on today?"},
            ]
        if "YELLOW" in level_raw or "AMBER" in level_raw:
            return [
                {"label": "Light session", "message": "Build me a light session"},
                {"label": "Show schedule", "message": "What's on today?"},
            ]
        if "GREEN" in level_raw:
            return [
                {"label": "Build session", "message": "Build me a training session"},
                {"label": "Show schedule", "message": "What's on today?"},
            ]

    # ── Stat grid: reference top metric label ──
    if card_type == "stat_grid":
        items = top.get("items", []) or []
        if items:
            first = items[0] if isinstance(items[0], dict) else {}
            label = str(first.get("label") or "").strip()
            if label:
                return [
                    {"label": f"More on {label.lower()}", "message": f"Tell me more about my {label.lower()}"},
                    {"label": "Full breakdown", "message": "Show my full breakdown"},
                ]

    # ── Schedule list: reference first event ──
    if card_type == "schedule_list":
        events = top.get("events", []) or top.get("items", []) or []
        if events:
            first = events[0] if isinstance(events[0], dict) else {}
            title = str(first.get("title") or first.get("label") or "").strip()
            if title:
                short = title[:24]
                return [
                    {"label": f"Move {short}", "message": f"Reschedule {title}"},
                    {"label": "Add event", "message": "Add an event to my schedule"},
                ]
        return [
            {"label": "Add event", "message": "Add an event to my schedule"},
            {"label": "Show my week", "message": "What does my week look like?"},
        ]

    # ── Session plan: already handled by _build_session_plan_chips in
    # multi_step. If a session_plan card slips through here with no chips,
    # fall back to a sensible pair.
    if card_type == "session_plan":
        return [
            {"label": "Looks good", "message": "Looks good"},
            {"label": "Make it lighter", "message": "Can you make it lighter?"},
        ]

    # ── Week plan: navigation shortcuts ──
    if card_type == "week_plan":
        return [
            {"label": "Next week", "message": "Show me next week"},
            {"label": "Add event", "message": "Add an event to my schedule"},
        ]

    return []


def _ensure_timeline_chips(structured: dict, state: TomoChatState) -> dict:
    """Add contextual chips for timeline agent responses when none exist."""
    if not state or state.get("selected_agent") != "timeline":
        return structured
    if structured.get("chips"):
        return structured  # Already has chips

    tool_calls = state.get("tool_calls", [])
    tool_names = {tc.get("name", "") for tc in tool_calls}

    if "get_today_events" in tool_names:
        structured["chips"] = [
            {"label": "Add training", "message": "Add a training session today"},
            {"label": "Show my week", "message": "What does my week look like?"},
        ]
    elif "get_week_schedule" in tool_names:
        structured["chips"] = [
            {"label": "Add event", "message": "Add an event to my schedule"},
            {"label": "Check collisions", "message": "Check for any schedule conflicts"},
        ]
    elif "detect_load_collision" in tool_names:
        structured["chips"] = [
            {"label": "Show today", "message": "What's on today?"},
            {"label": "Fix collision", "message": "Help me fix the schedule conflict"},
        ]
    elif tool_names & {"create_event", "update_event", "delete_event"}:
        structured["chips"] = [
            {"label": "Show updated", "message": "Show my updated schedule"},
            {"label": "Check collisions", "message": "Any schedule conflicts?"},
        ]
    else:
        structured["chips"] = [
            {"label": "Today's schedule", "message": "What's on today?"},
            {"label": "This week", "message": "Show my week"},
        ]

    return structured


def _pulse_post_process(structured: dict, state: TomoChatState = None) -> dict:
    """Apply Pulse layout formatting to any structured response.
    No guardrails — only structural formatting for mobile rendering."""

    # 1. Strip emoji + markdown from headline (cleaner UI)
    hl = _strip_emoji(structured.get("headline", ""))
    hl = re.sub(r"\*\*(.+?)\*\*", r"\1", hl)
    hl = re.sub(r"\*(.+?)\*", r"\1", hl)
    hl = re.sub(r"^#+\s*", "", hl)
    structured["headline"] = hl.strip()

    # 2. Enforce max 2 chips, validate chip structure
    chips = structured.get("chips", [])
    valid_chips = [
        c for c in chips
        if isinstance(c, dict) and c.get("label") and c.get("message")
    ]
    structured["chips"] = valid_chips[:2]

    # 2b. Card-content chip upgrade: if the agent produced no chips AND
    # there's a data card to reference, build chips that point at the
    # actual card content (e.g. readiness RED -> "Recovery tips",
    # stat_grid top metric -> "More on readiness"). Conservative: only
    # fires when chips are empty; never overwrites agent-specific chips.
    if not structured["chips"]:
        card_chips = _chips_from_top_card(structured, state)
        if card_chips:
            structured["chips"] = card_chips[:2]

    # 3. Reorder cards: data cards first, then text/advisory
    cards = structured.get("cards", [])
    data_cards = [c for c in cards if c.get("type") in DATA_CARD_TYPES]
    other_cards = [c for c in cards if c.get("type") not in DATA_CARD_TYPES]
    structured["cards"] = data_cards + other_cards

    # 4. Truncate body to max sentences
    structured["body"] = _truncate_body(structured.get("body", ""))

    # 4b. Sanitize body — strip raw technical metrics + markdown artifacts
    body = structured.get("body", "")
    if body:
        # Strip markdown formatting — body renders as plain text on mobile
        body = re.sub(r"\*\*(.+?)\*\*", r"\1", body)  # **bold** → bold
        body = re.sub(r"\*(.+?)\*", r"\1", body)       # *italic* → italic
        body = re.sub(r"__(.+?)__", r"\1", body)        # __underline__ → underline
        body = re.sub(r"`(.+?)`", r"\1", body)          # `code` → code
        body = re.sub(r"^#+\s*", "", body, flags=re.M)  # # heading → heading
        # Strip raw technical metrics
        body = re.sub(r"\bACWR\b\s*(?:hit|is|at|of|=)?\s*\d+\.?\d*", "training load's been building", body, flags=re.I)
        body = re.sub(r"\bACWR\b", "training load", body, flags=re.I)
        body = re.sub(r"\b\d+\.?\d*\s*ms\s*(?:HRV|hrv)", "recovery signals", body, flags=re.I)
        body = re.sub(r"\bHRV\s*(?:is|at|of|=)?\s*\d+\.?\d*\s*(?:ms)?", "recovery signals", body, flags=re.I)
        structured["body"] = body

    # 4c. Sanitize stat_grid items — convert raw values to friendly labels
    for card in structured.get("cards", []):
        if card.get("type") == "stat_grid":
            for item in card.get("items", []):
                label = (item.get("label") or "").lower()
                value = str(item.get("value", ""))
                # HRV: never show raw ms — convert to descriptive
                if "hrv" in label and re.search(r"\d+\.?\d*\s*ms", value):
                    ms_val = float(re.search(r"(\d+\.?\d*)", value).group(1))
                    item["value"] = "Strong" if ms_val > 80 else "Okay" if ms_val > 50 else "Low"
                # Energy/Mood on /5 scale → descriptive
                if ("energy" in label or "mood" in label) and re.search(r"\d+\.?\d*/5", value):
                    score = float(re.search(r"(\d+\.?\d*)/5", value).group(1))
                    item["value"] = "High" if score >= 4 else "Good" if score >= 3 else "Low"
                # ACWR → never show, convert to plain
                if "acwr" in label or "load ratio" in label:
                    item["label"] = "Training Load"
                    if re.search(r"\d+\.?\d*", value):
                        num = float(re.search(r"(\d+\.?\d*)", value).group(1))
                        item["value"] = "Spiked" if num > 1.5 else "Elevated" if num > 1.3 else "Building" if num > 1.0 else "Good"

    # 4d. Strip emojis from ALL card content — zero emoji policy
    for card in structured.get("cards", []):
        for field in ("headline", "title", "body", "note", "date", "summary"):
            if card.get(field) and isinstance(card[field], str):
                card[field] = _strip_emoji(card[field])
        # Strip from nested items (schedule_list, stat_grid, confirm_card, etc.)
        for item in card.get("items", []):
            if isinstance(item, dict):
                for field in ("label", "value", "title", "time", "date"):
                    if item.get(field) and isinstance(item[field], str):
                        item[field] = _strip_emoji(item[field])
        # Strip from week_plan days
        for day in card.get("days", []):
            if isinstance(day, dict):
                if day.get("note"):
                    day["note"] = _strip_emoji(day["note"])
                for tag in day.get("tags", []):
                    if isinstance(tag, dict) and tag.get("label"):
                        tag["label"] = _strip_emoji(tag["label"])
        # Strip from schedule events
        for evt in card.get("events", []):
            if isinstance(evt, dict):
                for field in ("title", "time"):
                    if evt.get(field) and isinstance(evt[field], str):
                        evt[field] = _strip_emoji(evt[field])
        # Strip from choice_card options
        for opt in card.get("options", []):
            if isinstance(opt, dict):
                for field in ("label", "description"):
                    if opt.get(field) and isinstance(opt[field], str):
                        opt[field] = _strip_emoji(opt[field])

    # Strip emojis from body text too
    if structured.get("body"):
        structured["body"] = _strip_emoji(structured["body"])

    # 5. Ensure body exists (mobile renderer needs it)
    #    EXCEPT: self-contained card types render their own content —
    #    injecting fallback body causes duplicate text on mobile.
    SELF_CONTAINED_CARDS = {"confirm_card", "choice_card"}
    has_self_contained = any(
        c.get("type") in SELF_CONTAINED_CARDS
        for c in structured.get("cards", [])
    )
    if not has_self_contained and not structured.get("body", "").strip():
        for card in structured.get("cards", []):
            if card.get("type") in ("text_card", "coach_note") and (card.get("body") or card.get("note")):
                structured["body"] = _truncate_body(card.get("body") or card.get("note", ""))
                break
        if not structured.get("body", "").strip():
            structured["body"] = structured.get("headline", "") or "What's on your mind?"

    # 6. DEDUPLICATION: remove text_card / coach_note cards whose content
    #    matches the body — prevents the same paragraph rendering twice on mobile.
    body_norm = (structured.get("body", "") or "").strip().lower()[:100]
    if body_norm:
        deduped_cards = []
        for card in structured["cards"]:
            card_type = card.get("type")
            if card_type == "text_card":
                card_body = (card.get("body") or "").strip().lower()[:100]
                if card_body and card_body == body_norm:
                    continue  # Skip — already rendered as body text
            elif card_type == "coach_note":
                card_note = (card.get("note") or "").strip().lower()[:100]
                if card_note and card_note == body_norm:
                    continue  # Skip — already rendered as body text
            deduped_cards.append(card)
        structured["cards"] = deduped_cards

    # 7. Program enforcement: inject program_detail card when LLM omitted it
    if state:
        structured = _ensure_program_detail_card(structured, state)

    # 7b. Timeline enforcement: ensure schedule_list card for timeline agent
    if state:
        structured = _ensure_timeline_card(structured, state)

    # 8. Timeline chip defaults: add contextual chips for timeline responses
    if state:
        structured = _ensure_timeline_chips(structured, state)

    # 9. Check-in pill: if player hasn't checked in today, prepend "Check in" chip
    #    Applies across ALL agents — not just timeline
    if state:
        ctx = state.get("player_context")
        if ctx:
            checkin_date = getattr(ctx, "checkin_date", None)
            today_date = getattr(ctx, "today_date", None)
            if today_date and checkin_date != today_date:
                chips = structured.get("chips", [])
                # Don't add if already present
                if not any(
                    (c.get("label") or "").lower().strip() == "check in"
                    for c in chips
                ):
                    checkin_chip = {"label": "Check in", "message": "Log my daily check-in"}
                    chips = [checkin_chip] + chips
                structured["chips"] = chips[:2]

    # 10. Pydantic card validation (v2) — validate every card against registry
    #     Invalid cards are dropped and logged. Unknown types pass through.
    try:
        from app.models.cards_v2 import validate_card as _validate_card
    except ImportError as _imp_err:
        logger.warning(f"cards_v2 import failed: {_imp_err} — skipping card validation")
        _validate_card = None

    if _validate_card:
        validated_cards = []
        for card in structured.get("cards", []):
            try:
                valid, cleaned, error = _validate_card(card)
                if valid and cleaned:
                    validated_cards.append(cleaned)
                elif error:
                    logger.warning(f"Card validation dropped: {error}")
            except Exception as card_err:
                logger.warning(f"Card validation error: {card_err} — passing through")
                validated_cards.append(card)  # Pass through on validation error
        structured["cards"] = validated_cards

    return structured


def _extract_json(text: str) -> Optional[dict]:
    """Extract JSON from agent response using 3 strategies."""
    if not text:
        return None

    # Strategy 1: Fenced JSON block (greedy match for nested objects)
    fenced = re.search(r"```json\s*(\{[\s\S]*\})\s*```", text)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except json.JSONDecodeError:
            pass

    # Strategy 2: Pure JSON (entire response is JSON)
    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass

    # Strategy 3: Brace extraction (first complete { ... } block)
    brace_match = re.search(r"\{[\s\S]*\}", text)
    if brace_match:
        try:
            return json.loads(brace_match.group())
        except json.JSONDecodeError:
            pass

    return None


def _build_text_response(text: str) -> dict:
    """Convert plain text to a structured text_card response."""
    # Extract first line as headline (if short enough)
    lines = text.strip().split("\n")
    headline = ""
    body = text.strip()

    if lines and len(lines[0]) <= 60:
        headline = lines[0].strip()
        body = "\n".join(lines[1:]).strip() if len(lines) > 1 else ""

    # Truncate body if too long (Gen Z: max 3 sentences)
    # Negative lookbehind for digits prevents splitting on numbered lists ("1. " "2. ")
    sentences = re.split(r'(?<!\d)(?<=[.!?])\s+', body)
    if len(sentences) > 3:
        body = " ".join(sentences[:3])

    return {
        "headline": headline or "Hey -- what's on your mind?",
        "body": body or headline or "What are you thinking?",
        "cards": [{"type": "text_card", "headline": headline, "body": body or headline or "What are you thinking?"}],
        "chips": [],
    }


def _build_confirmation_response(pending: dict) -> dict:
    """Build a confirmation card for a pending write action.

    Returns ONLY a confirm_card — no duplicate headline/body text.
    Batch actions rendered as structured items for the mobile renderer.
    """
    actions = pending.get("actions", [pending.get("primary_action", {})])

    # Build headline based on action type + count
    primary = actions[0] if actions else {}
    tool_name = primary.get("toolName", "action")
    count = len(actions)

    if count > 1:
        headline_map = {
            "create_event": f"Add {count} events to timeline?",
            "delete_event": f"Remove {count} events?",
        }
        confirm_headline = headline_map.get(tool_name, f"Confirm {count} actions?")
    else:
        headline_map = {
            "create_event": "Add to timeline?",
            "update_event": "Update this event?",
            "delete_event": "Remove this event?",
            "log_check_in": "Log your check-in?",
            "log_test_result": "Log this result?",
            "log_recovery_session": "Add recovery session?",
            "create_training_block": "Start this training block?",
            "set_goal": "Set new goal?",
            "propose_mode_change": "Switch training mode?",
            "trigger_deload_week": "Start a deload week?",
            "flag_injury_concern": "Log this concern?",
            "log_injury": "Log this injury?",
        }
        confirm_headline = headline_map.get(tool_name, "Confirm this action?")

    # Build structured items for the mobile renderer
    items = []
    for action in actions:
        inp = action.get("toolInput", {})
        # Support both old (title/event_type) and new (name/type) field names
        title = inp.get("name") or inp.get("title") or inp.get("type") or inp.get("event_type") or "Session"
        if isinstance(title, str):
            title = title.replace("_", " ").title()

        # Format date: "2026-04-13" → "Mon Apr 13"
        date_str = inp.get("date", "")
        formatted_date = _format_confirm_date(date_str) if date_str else ""

        # Format time in 12h — support both camelCase and snake_case field names
        time_str = ""
        start = inp.get("startTime") or inp.get("start_time") or ""
        end = inp.get("endTime") or inp.get("end_time") or ""
        if start:
            time_str = _format_12h(start) if ":" in start and len(start) <= 5 else start
            if end:
                end_fmt = _format_12h(end) if ":" in end and len(end) <= 5 else end
                time_str += f"–{end_fmt}"

        items.append({
            "title": title,
            "date": formatted_date,
            "time": time_str,
        })

    # Fallback body for single-item or when items render fails
    body_fallback = "Look good?"
    if items:
        body_fallback = " · ".join(
            f"{it['title']} {it['date']} {it['time']}".strip() for it in items[:3]
        )
        if len(items) > 3:
            body_fallback += f" + {len(items) - 3} more"

    return {
        "headline": "",
        "body": "",
        "cards": [{
            "type": "confirm_card",
            "headline": confirm_headline,
            "body": body_fallback,
            "items": items,
            "confirm_label": "Confirm",
            "cancel_label": "Cancel",
            "action_data": pending,
        }],
        "chips": [],
    }


def _format_confirm_date(date_str: str) -> str:
    """Format ISO date 'YYYY-MM-DD' → readable 'Mon Apr 13'."""
    try:
        from datetime import datetime
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt.strftime("%a %b %d")
    except (ValueError, TypeError):
        return date_str


def _build_done_headline(results: list[dict]) -> str:
    """Build warm, coaching-style headline from confirmed action results.

    These headlines are the FIRST thing the athlete sees after confirming an action.
    They must feel like a friend acknowledging the decision, not a system notification.
    """
    if not results:
        return "You're set"

    first = results[0]
    tool_name = first.get("tool", "")
    result_data = first.get("result", {})

    # Try extracting event details for personalized headline
    if isinstance(result_data, dict):
        event_data = result_data.get("event", result_data)
        title = event_data.get("name") or event_data.get("title") or ""
        if result_data.get("autoRepositioned"):
            suggested = result_data.get("suggestedTime", {})
            start_time = suggested.get("startTime", "")
        else:
            start_time = event_data.get("startTime") or event_data.get("start_time") or ""
        if title and start_time:
            time_display = _format_12h(start_time) if ":" in start_time and len(start_time) <= 5 else start_time
            # Warm, coaching-style confirmation
            title_lower = title.lower()
            if "recovery" in title_lower:
                return f"Smart move -- recovery at {time_display}"
            elif "speed" in title_lower or "acceleration" in title_lower:
                return f"Speed work locked in for {time_display} -- let's go"
            elif "gym" in title_lower or "strength" in title_lower:
                return f"Gym session set for {time_display} -- bring it"
            else:
                return f"{title} at {time_display} -- you're set"
        if title:
            return f"{title} -- done"

    # Warm fallback headlines by action type
    tool_headlines = {
        "create_event": "Got it -- you're all set",
        "update_event": "Updated -- looking better",
        "delete_event": "Cleared out -- all good",
        "log_check_in": "Check-in logged -- good to see you",
        "log_test_result": "Result saved -- let's see how you're tracking",
        "log_recovery_session": "Recovery locked in -- smart call",
        "create_training_block": "Block started -- here we go",
        "trigger_deload_week": "Deload week on -- your body will thank you",
        "flag_injury_concern": "Noted -- I'll keep that in mind",
        "log_injury": "Logged -- take care of yourself",
        "set_goal": "Goal set -- let's chase it",
        "propose_mode_change": "Mode switched -- adjusted for you",
    }
    return tool_headlines.get(tool_name, "Done -- you're good")


def _build_confirmed_response(results: list[dict]) -> dict:
    """Build Pulse done response — warm, natural language + green stat_grid card."""
    success_count = sum(1 for r in results if r.get("success"))
    total = len(results)

    if success_count == total:
        headline = _build_done_headline(results)
        # Build stat_grid items with green highlights showing event details
        items = []
        auto_reposition_note = ""
        for r in results:
            result_data = r.get("result", {})
            if isinstance(result_data, dict):
                # Handle nested event response (TS returns { event: {...}, autoRepositioned: ... })
                event_data = result_data.get("event", result_data)
                title = event_data.get("name") or event_data.get("title") or r.get("tool", "").replace("_", " ").title()
                date = event_data.get("date", "")

                # Check for auto-repositioning: use actual stored time, not original request
                if result_data.get("autoRepositioned"):
                    suggested = result_data.get("suggestedTime", {})
                    start_time = suggested.get("startTime", "")
                    end_time = suggested.get("endTime", "")
                    orig = result_data.get("originalTime", {})
                    orig_start = orig.get("startTime", "")
                    orig_fmt = _format_12h(orig_start) if orig_start and ":" in orig_start else orig_start
                    new_fmt = _format_12h(start_time) if start_time and ":" in start_time else start_time
                    auto_reposition_note = f"Moved from {orig_fmt} to {new_fmt} to avoid a clash."
                else:
                    start_time = event_data.get("startTime") or event_data.get("start_time") or ""

                time_display = _format_12h(start_time) if start_time and ":" in start_time and len(start_time) <= 5 else start_time
                # Format date as readable
                date_display = ""
                if date:
                    try:
                        from datetime import datetime as _dt
                        date_display = _dt.strptime(date, "%Y-%m-%d").strftime("%a %b %d")
                    except (ValueError, TypeError):
                        date_display = date
                detail = f"{date_display} {time_display}".strip() if date_display or time_display else "Confirmed"
                items.append({"label": title, "value": detail, "highlight": "green"})
            else:
                tool_display = r.get("tool", "").replace("_", " ").title()
                items.append({"label": tool_display, "value": "Confirmed", "highlight": "green"})

        # Use stat_grid for green done card (mobile renderer shows green highlights)
        done_card = {"type": "stat_grid", "items": items} if items else {
            "type": "text_card", "headline": headline, "body": "All good."
        }
        cards = [done_card]

        # Build warm body — not empty, not transactional
        if auto_reposition_note:
            body = auto_reposition_note
        else:
            # Context-aware warm body based on action type
            primary_tool = results[0].get("tool", "") if results else ""
            _warm_bodies = {
                "create_event": "Show up, put the work in, and come tell me how it went.",
                "update_event": "Schedule's looking cleaner now.",
                "delete_event": "Cleared some space -- sometimes that's the smartest move.",
                "log_check_in": "Good to have you here. That data helps me help you.",
                "log_test_result": "Every test tells a story -- let's see yours.",
                "log_recovery_session": "Recovery is how you get faster. Respect the process.",
                "create_training_block": "Consistency is where the magic is. Let's build.",
                "trigger_deload_week": "Backing off now means coming back stronger. Trust it.",
                "set_goal": "Now we've got something to chase together.",
            }
            body = _warm_bodies.get(primary_tool, "")
    else:
        # Warm error — coaching-first, never robotic
        failed = [r for r in results if not r.get("success")]
        error_detail = ""
        tool_name = ""
        if failed:
            err = failed[0].get("error", "")
            tool_name = failed[0].get("tool", "").replace("_", " ")

            # Coaching-first error messages — maintain the vibe even when things fail
            if "connection" in str(err).lower() or "connect" in str(err).lower():
                error_detail = (
                    "My system's being slow right now — but the plan's still solid. "
                    "Give it another tap and it should go through."
                )
            elif "404" in str(err) or "not found" in str(err).lower():
                error_detail = (
                    "I can't update that directly right now, but here's what I'd do: "
                    "keep that session in your calendar and adjust the focus when you get there. "
                    "Your body knows what it needs."
                )
            elif "400" in str(err) or "validation" in str(err).lower():
                error_detail = (
                    "Something didn't quite line up with the details. "
                    "Want to try a different approach?"
                )
            else:
                error_detail = (
                    "Hit a snag on my end — nothing on your side. "
                    "Give it another go or tell me what else you need."
                )

        headline = "Didn't quite land — but we're good" if not tool_name else f"Couldn't quite get that through"
        body = error_detail or "Something tripped up on my end. We'll get it next time."

        # Build a retry confirm_card so the user can tap CONFIRM again
        # instead of the "Try again" chip which restarts the full LLM pipeline.
        # The confirm_card reuses the same action data — mobile sends it as
        # confirmedAction which goes straight to execute_confirmed.
        retry_items = []
        for r in results:
            tool_display = r.get("tool", "").replace("_", " ").title()
            retry_items.append({"title": tool_display, "date": "", "time": ""})

        cards = [
            {"type": "text_card", "body": body},
            {
                "type": "confirm_card",
                "headline": "Try again?",
                "items": retry_items,
                "confirmLabel": "RETRY",
            },
        ]

    # Context-aware chips based on the action type
    primary_tool = results[0].get("tool", "") if results else ""
    if primary_tool in ("create_event", "update_event"):
        chips = [
            {"label": "Show tomorrow", "message": "Show me tomorrow's schedule"},
            {"label": "Check collisions", "message": "Check for scheduling conflicts"},
        ]
    elif primary_tool == "delete_event":
        chips = [
            {"label": "Show today", "message": "Show me today's schedule"},
            {"label": "Add training", "message": "Add a training session"},
        ]
    elif primary_tool in ("log_check_in", "log_test_result"):
        chips = [
            {"label": "Check readiness", "message": "What's my readiness?"},
            {"label": "Build session", "message": "Build me a training session"},
        ]
    else:
        chips = [{"label": "What else?", "message": "What should I do next?"}]

    return {
        "headline": headline,
        "body": body,
        "cards": cards,
        "chips": chips,
    }


async def format_response_node(state: TomoChatState) -> dict:
    """
    Format agent response into structured TomoResponse.

    Handles:
      - JSON structured responses from agent
      - Plain text fallback
      - Write action confirmations
      - Confirmed action results

    Returns state update with final_response and final_cards.
    """
    # Case 0: Flow controller already built the response -- pass through.
    # capsule_direct and future patterns set final_response directly.
    flow_pattern = state.get("_flow_pattern")
    if flow_pattern and state.get("final_response"):
        logger.info(f"Format pass-through: flow_pattern={flow_pattern}")
        return {}  # Empty dict = no state updates needed (already set by flow controller)

    agent_response = state.get("agent_response", "")
    pending_write = state.get("pending_write_action")
    write_confirmed = state.get("write_confirmed", False)

    # Case 1: Write action pending confirmation
    if pending_write and not write_confirmed:
        structured = _pulse_post_process(_build_confirmation_response(pending_write), state)
        return {
            "final_response": json.dumps(structured),
            "final_cards": structured.get("cards", []),
        }

    # Case 2: Write action was confirmed and executed
    if write_confirmed and agent_response:
        try:
            confirmed_data = json.loads(agent_response)
            results = confirmed_data.get("confirmed_results", [])
            # Mobile maps Program Details capsule → confirmedAction; Python marks write_confirmed.
            # get_program_details is a READ — must not use the calendar / "done" Pulse template.
            program_read = _build_program_read_capsule_response(results)
            if program_read is not None:
                structured = _pulse_post_process(program_read, state)
            else:
                structured = _pulse_post_process(_build_confirmed_response(results), state)
        except (json.JSONDecodeError, TypeError):
            structured = _pulse_post_process(_build_text_response(agent_response), state)

        result_dict = {
            "final_response": json.dumps(structured),
            "final_cards": structured.get("cards", []),
        }

        # If actions failed, pending_write_action is preserved by execute_confirmed.
        # Pass it through so the chat route returns it as pendingConfirmation,
        # enabling the mobile to show a retry confirm card (not "Try again" text).
        if pending_write:
            result_dict["pending_write_action"] = pending_write

        return result_dict

    # Case 3: Normal agent response — try to parse structured JSON
    parsed = _extract_json(agent_response) if agent_response else None

    if parsed:
        # Validate expected structure
        structured = {
            "headline": parsed.get("headline", ""),
            "body": parsed.get("body", ""),
            "cards": parsed.get("cards", []),
            "chips": parsed.get("chips", []),
        }

        # Validate cards have required 'type' field and visible content
        valid_cards = []
        for card in structured["cards"]:
            if not isinstance(card, dict) or "type" not in card:
                continue
            card_type = card["type"]

            # ── Validate per card type — drop empty renders ──

            # Text/advisory: must have substantive body
            if card_type == "text_card":
                card_body = (card.get("body") or "").strip()
                card_body_text = _strip_emoji(card_body)
                if not card_body_text or len(card_body_text) < 15:
                    continue  # Drop text_cards with empty/too-short body
            elif card_type == "coach_note":
                # Mobile renders card.note — body field is ignored by the renderer
                card_note = (card.get("note") or "").strip()
                card_note_text = _strip_emoji(card_note)
                if not card_note_text or len(card_note_text) < 15:
                    continue  # Drop coach_notes with empty/too-short note

            # Stat grid: must have non-empty items with label+value
            elif card_type == "stat_grid":
                items = card.get("items")
                if not isinstance(items, list) or not items:
                    continue
                # Clean items: keep only those with visible content
                clean = [
                    it for it in items
                    if isinstance(it, dict) and it.get("label") and it.get("value") is not None
                ]
                if not clean:
                    continue
                # Ensure every item has highlight field (default green)
                for it in clean:
                    if "highlight" not in it:
                        it["highlight"] = "green"
                card["items"] = clean

            # Stat row: must have label + value
            elif card_type == "stat_row":
                if not card.get("label") or card.get("value") is None:
                    continue

            # Schedule list: must have events/items
            elif card_type == "schedule_list":
                items = card.get("items") or card.get("events") or []
                if not isinstance(items, list) or not items:
                    continue
                # Normalize: always use "items" key (TypeScript ScheduleList expects "items")
                card["items"] = items
                # Normalize event_type → type for each item (TypeScript uses "type")
                for it in items:
                    if isinstance(it, dict) and "event_type" in it and "type" not in it:
                        it["type"] = it.pop("event_type")

            # Session plan: must have items. Accept legacy "drills" key
            # from LLM agent output and legacy "total_duration_min" key,
            # then normalize to the mobile SessionPlanCard contract
            # (title, totalDuration, items[], readiness). This is the
            # single normalization point for ALL session_plan emitters.
            elif card_type == "session_plan":
                items = card.get("items") or card.get("drills") or []
                if not isinstance(items, list) or not items:
                    continue

                # Coerce any drill-level "duration" to a numeric minute count.
                # LLM output occasionally lands a string (e.g. "25 min", "5-10",
                # "match pace") in the duration slot when the agent inlines
                # prescription fields. We keep the string around as "duration_label"
                # for display and materialize a clean numeric "duration_min" for
                # totalDuration arithmetic. Non-numeric values resolve to 0 so
                # sum() never crashes the whole response.
                def _coerce_duration_min(v):
                    if isinstance(v, bool):
                        return 0
                    if isinstance(v, (int, float)):
                        return int(v)
                    if isinstance(v, str):
                        import re as _re
                        m = _re.search(r"\d+", v)
                        return int(m.group()) if m else 0
                    return 0

                # Normalize each item: duration_min -> duration
                normalized_items = []
                for it in items:
                    if not isinstance(it, dict):
                        continue
                    norm = dict(it)
                    if "duration" not in norm and "duration_min" in norm:
                        norm["duration"] = norm.pop("duration_min")
                    if "reason" not in norm and "description" in norm:
                        norm["reason"] = norm.pop("description")
                    if "drillId" not in norm and "drill_id" in norm:
                        norm["drillId"] = norm.pop("drill_id")
                    raw_duration = norm.get("duration")
                    if isinstance(raw_duration, str) and raw_duration.strip():
                        norm["duration_label"] = raw_duration
                    norm["duration"] = _coerce_duration_min(raw_duration)
                    normalized_items.append(norm)
                card["items"] = normalized_items
                card.pop("drills", None)
                # Normalize top-level duration field
                if "totalDuration" not in card:
                    if "total_duration_min" in card:
                        card["totalDuration"] = _coerce_duration_min(card.pop("total_duration_min"))
                    elif "duration" in card:
                        card["totalDuration"] = _coerce_duration_min(card["duration"])
                    else:
                        card["totalDuration"] = sum(
                            _coerce_duration_min(it.get("duration"))
                            for it in normalized_items
                        )
                else:
                    card["totalDuration"] = _coerce_duration_min(card["totalDuration"])
                # Normalize readiness field
                if "readiness" not in card and "readiness_level" in card:
                    rl = (card.pop("readiness_level") or "").strip().lower()
                    card["readiness"] = {
                        "green": "Green", "yellow": "Yellow",
                        "amber": "Yellow", "red": "Red",
                    }.get(rl, "Green")
                # Title is required by the mobile renderer
                if not card.get("title"):
                    cat = card.get("category") or "Training"
                    card["title"] = f"{str(cat).title()} Session"

            # Program recommendation: must have programs
            elif card_type == "program_recommendation":
                programs = card.get("programs") or []
                if not isinstance(programs, list) or not programs:
                    continue

            # Program detail (Programs tab parity): must have id + name
            elif card_type == "program_detail":
                if not (card.get("programId") or card.get("program_id")):
                    continue
                if not (card.get("name") or "").strip():
                    continue

            # Benchmark bar: must have metric + percentile
            elif card_type == "benchmark_bar":
                if not card.get("metric") or card.get("percentile") is None:
                    continue

            # Zone stack: must have zones
            elif card_type == "zone_stack":
                zones = card.get("zones") or []
                if not isinstance(zones, list) or not zones:
                    continue

            # Benchmark bar: must have value
            elif card_type == "benchmark_bar":
                if card.get("value") is None and card.get("percentile") is None:
                    continue

            # Clash list: must have clashes
            elif card_type == "clash_list":
                clashes = card.get("clashes") or card.get("items") or []
                if not isinstance(clashes, list) or not clashes:
                    continue

            # Confirm card: always valid (has action_data)
            elif card_type == "confirm_card":
                pass

            # Week plan: must have days array
            elif card_type == "week_plan":
                days = card.get("days") or []
                if not isinstance(days, list) or not days:
                    continue

            # Choice card: must have options array
            elif card_type == "choice_card":
                options = card.get("options") or []
                if not isinstance(options, list) or not options:
                    continue

            valid_cards.append(card)
        structured["cards"] = valid_cards

        # If no cards but has body, create a text card
        if not structured["cards"] and structured.get("body"):
            structured["cards"] = [{
                "type": "text_card",
                "headline": structured.get("headline", ""),
                "body": structured["body"],
            }]

        # Apply Pulse layout enforcement (pass state for context-aware fallback)
        structured = _pulse_post_process(structured, state)

        return {
            "final_response": json.dumps(structured),
            "final_cards": structured.get("cards", []),
        }

    # Case 4: Fallback — plain text to text_card
    if agent_response:
        structured = _pulse_post_process(_build_text_response(agent_response), state)
        return {
            "final_response": json.dumps(structured),
            "final_cards": structured.get("cards", []),
        }

    # Case 5: Empty response -- warm catch with soft recovery chips.
    # The synthesis recovery returned empty; respond with a warm one-liner
    # and 1-2 soft recovery chips so the athlete has a way forward.
    # Younger athletes (U13/U15) rely on chip navigation -- zero chips
    # leaves them stranded. These are intentionally open-ended, not
    # transactional menus that terminate the conversation.
    import random as _random
    _fallback_lines = [
        "Hey -- I got lost on that one. What are you after?",
        "Hmm, didn't land on anything useful. Say more?",
        "That one slipped past me. What do you need right now?",
        "Missed what you meant there. Give me a bit more?",
        "Not sure I followed -- what's on your mind?",
    ]
    structured = _pulse_post_process(
        _build_text_response(_random.choice(_fallback_lines)),
        state,
    )
    # Soft recovery chips -- open-ended, not transactional menus.
    # Rotate between pairs so the same athlete doesn't see identical
    # chips on consecutive errors.
    _recovery_chip_pairs = [
        [
            {"label": "Check my readiness", "message": "How am I doing today?"},
            {"label": "Today's plan", "message": "What's on my schedule today?"},
        ],
        [
            {"label": "Build a session", "message": "Build me a training session"},
            {"label": "How am I doing?", "message": "What's my readiness?"},
        ],
        [
            {"label": "Show my week", "message": "What does my week look like?"},
            {"label": "Check in", "message": "I want to check in"},
        ],
    ]
    structured["chips"] = _random.choice(_recovery_chip_pairs)
    return {
        "final_response": json.dumps(structured),
        "final_cards": structured.get("cards", []),
    }
