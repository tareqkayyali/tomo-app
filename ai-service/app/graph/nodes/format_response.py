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
    "clash_list", "phv_assessment", "drill_card", "week_schedule",
    "week_plan", "choice_card",
})

# Body text limit — keep responses tight, let cards do the heavy lifting
MAX_BODY_SENTENCES = 3


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
            items = []
            for ev in data["events"]:
                time_str = _extract_time_from_iso(ev.get("start_time", ""))
                items.append({
                    "time": time_str or "—",
                    "title": _strip_emoji(ev.get("title", "Event")),
                    "type": ev.get("event_type", "other"),
                })
            if not items:
                items = [{"time": "—", "title": "Rest day — nothing scheduled", "type": "rest"}]
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

    # 7. Timeline enforcement: ensure schedule_list card for timeline agent
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
        validated_cards = []
        for card in structured.get("cards", []):
            valid, cleaned, error = _validate_card(card)
            if valid and cleaned:
                validated_cards.append(cleaned)
            elif error:
                logger.warning(f"Card validation dropped: {error}")
        structured["cards"] = validated_cards
    except ImportError:
        pass  # cards_v2 not available — skip validation

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
    """Build natural-language headline from confirmed action results."""
    if not results:
        return "Done"

    first = results[0]
    tool_name = first.get("tool", "")
    result_data = first.get("result", {})

    # Try extracting event details for natural language headline
    if isinstance(result_data, dict):
        # Handle nested event response from TS backend
        event_data = result_data.get("event", result_data)
        title = event_data.get("name") or event_data.get("title") or ""
        # Use actual time (may have been auto-repositioned)
        if result_data.get("autoRepositioned"):
            suggested = result_data.get("suggestedTime", {})
            start_time = suggested.get("startTime", "")
        else:
            start_time = event_data.get("startTime") or event_data.get("start_time") or ""
        if title and start_time:
            time_display = _format_12h(start_time) if ":" in start_time and len(start_time) <= 5 else start_time
            return f"{title} locked in for {time_display}"
        if title:
            return f"{title} confirmed"

    # Fallback: natural language from tool name
    tool_headlines = {
        "create_event": "Locked in",
        "update_event": "Updated -- you're set",
        "delete_event": "Removed -- all clear",
        "log_check_in": "Check-in saved",
        "log_test_result": "Result saved",
        "log_recovery_session": "Recovery session added -- smart move",
        "create_training_block": "Training block started -- let's go",
        "trigger_deload_week": "Deload week is on -- your body will thank you",
        "flag_injury_concern": "Noted -- keeping an eye on it",
        "log_injury": "Logged -- take care of yourself",
        "set_goal": "Goal locked in",
        "propose_mode_change": "Mode switched -- you're set",
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
        body = auto_reposition_note
    else:
        # Warm error — never robotic "X of Y actions"
        failed = [r for r in results if not r.get("success")]
        error_detail = ""
        tool_name = ""
        if failed:
            err = failed[0].get("error", "")
            tool_name = failed[0].get("tool", "").replace("_", " ")
            if "connection" in str(err).lower() or "connect" in str(err).lower():
                error_detail = f"Tried to {tool_name} but the server's not responding right now. Worth another shot in a sec."
            elif "404" in str(err) or "not found" in str(err).lower():
                error_detail = f"That {tool_name} feature is still being set up on my end. Should be ready soon."
            elif "400" in str(err) or "validation" in str(err).lower():
                error_detail = f"Something didn't line up with the {tool_name} details. Want to try with different info?"
            else:
                error_detail = f"Ran into something unexpected trying to {tool_name}. Want to give it another go?"

        headline = f"Didn't quite land" if not tool_name else f"Couldn't get the {tool_name} through"
        body = error_detail or "Something tripped up on my end. Want to try again?"

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

            # Session plan: must have drills
            elif card_type == "session_plan":
                drills = card.get("drills") or []
                if not isinstance(drills, list) or not drills:
                    continue

            # Program recommendation: must have programs
            elif card_type == "program_recommendation":
                programs = card.get("programs") or []
                if not isinstance(programs, list) or not programs:
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

    # Case 5: Empty response
    return {
        "final_response": json.dumps({
            "headline": "Hey -- what can I help with?",
            "body": "I'm ready whenever you are. What's on your mind?",
            "cards": [],
            "chips": [
                {"label": "How am I doing?", "message": "What's my readiness?"},
                {"label": "Today's plan", "message": "What's on today?"},
            ],
        }),
        "final_cards": [],
    }
