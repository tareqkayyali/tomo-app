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
})

# Body text limit — Pulse spec says 1-2 sentences max
MAX_BODY_SENTENCES = 2


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

    # ACWR
    acwr = getattr(snapshot, "acwr", None) if snapshot else None
    if acwr is not None:
        if acwr > 1.5:
            highlight = "red"
        elif acwr > 1.3:
            highlight = "yellow"
        else:
            highlight = "green"
        items.append({"label": "ACWR", "value": f"{acwr:.2f}", "highlight": highlight})

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


def _enforce_headline_priority(headline: str, cards: list, state: TomoChatState) -> str:
    """
    Pulse safety rule: if RED injury risk or ACWR danger zone exists,
    the headline MUST lead with the most critical signal — never GREEN.

    "TODAY: Green readiness" when ACWR is 1.55 = dangerous misguidance.
    """
    hl_lower = headline.lower()

    # Check stat_grid cards for danger signals
    has_red = False
    acwr_danger = False
    acwr_val = None

    for card in cards:
        if card.get("type") != "stat_grid":
            continue
        for item in card.get("items", []):
            label = str(item.get("label", "")).lower()
            value = str(item.get("value", "")).lower()
            highlight = str(item.get("highlight", "")).lower()

            if highlight == "red":
                has_red = True
            if "acwr" in label:
                try:
                    acwr_val = float(re.sub(r"[^\d.]", "", str(item.get("value", "0"))))
                    if acwr_val > 1.3:
                        acwr_danger = True
                except (ValueError, TypeError):
                    pass

    # Also check player context directly
    ctx = state.get("player_context") if state else None
    if ctx:
        snapshot = getattr(ctx, "snapshot_enrichment", None)
        if snapshot:
            injury = getattr(snapshot, "injury_risk_flag", None)
            if str(injury).lower() in ("red", "high"):
                has_red = True
            snap_acwr = getattr(snapshot, "acwr_7_28", None) or getattr(snapshot, "acwr", None)
            if snap_acwr and float(snap_acwr) > 1.3:
                acwr_danger = True
                acwr_val = float(snap_acwr)

    # If headline leads with GREEN but danger signals exist, rewrite it
    if (has_red or acwr_danger) and "green" in hl_lower:
        if acwr_danger and has_red:
            return f"ACWR {acwr_val:.2f} — deload required" if acwr_val else "Danger zone — deload required"
        elif acwr_danger:
            return f"ACWR {acwr_val:.2f} — reduce load this week" if acwr_val else "High load — reduce this week"
        elif has_red:
            return "RED flag — recovery priority"

    return headline


def _pulse_post_process(structured: dict, state: TomoChatState = None) -> dict:
    """Apply Pulse layout enforcement to any structured response."""
    # 1. Strip emoji from headline
    structured["headline"] = _strip_emoji(structured.get("headline", ""))

    # 2. Ban filler headlines even if LLM sneaks them through
    hl = structured.get("headline", "").lower()
    banned_starts = (
        "here's what", "here's your", "great question",
        "absolutely", "sure thing", "let me check",
    )
    if any(hl.startswith(b) for b in banned_starts):
        structured["headline"] = "Your update"

    # 2b. HEADLINE PRIORITY: danger signals must override GREEN in headline
    #     If stat_grid has RED injury risk or ACWR >1.3, headline must not lead with GREEN
    if state:
        structured["headline"] = _enforce_headline_priority(
            structured.get("headline", ""), structured.get("cards", []), state
        )

    # 3. Enforce max 2 chips, validate chip structure
    chips = structured.get("chips", [])
    valid_chips = [
        c for c in chips
        if isinstance(c, dict) and c.get("label") and c.get("message")
    ]
    structured["chips"] = valid_chips[:2]

    # 4. Reorder cards: data cards first, then text/advisory
    cards = structured.get("cards", [])
    data_cards = [c for c in cards if c.get("type") in DATA_CARD_TYPES]
    other_cards = [c for c in cards if c.get("type") not in DATA_CARD_TYPES]

    # 5. PULSE RULE: If no data card exists, inject stat_grid from player context
    if not data_cards and state:
        fallback_grid = _build_context_stat_grid(state)
        if fallback_grid:
            data_cards = [fallback_grid]

    structured["cards"] = data_cards + other_cards

    # 6. Truncate body — Pulse: 1-2 sentences, let data cards do the work
    structured["body"] = _truncate_body(structured.get("body", ""))

    # 7. Ensure body exists (mobile renderer needs it)
    if not structured.get("body", "").strip():
        for card in structured.get("cards", []):
            if card.get("type") in ("text_card", "coach_note") and (card.get("body") or card.get("note")):
                structured["body"] = _truncate_body(card.get("body") or card.get("note", ""))
                break
        if not structured.get("body", "").strip():
            structured["body"] = structured.get("headline", "") or "Your update"

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
        "headline": headline or "Your update",
        "body": body or headline or "Your update",
        "cards": [{"type": "text_card", "headline": headline, "body": body or headline or "Your update"}],
        "chips": [],
    }


def _build_confirmation_response(pending: dict) -> dict:
    """Build a confirmation card for a pending write action."""
    actions = pending.get("actions", [pending.get("primary_action", {})])
    preview = pending.get("preview", "")

    # Build headline based on action type
    primary = actions[0] if actions else {}
    tool_name = primary.get("toolName", "action")
    headline_map = {
        "create_event": "Add to timeline?",
        "update_event": "Update this event?",
        "delete_event": "Remove this event?",
        "log_check_in": "Log your check-in?",
        "log_test_result": "Log this result?",
        "set_goal": "Set new goal?",
        "propose_mode_change": "Switch training mode?",
    }
    headline = headline_map.get(tool_name, "Confirm this action?")

    body_parts = [preview] if preview else []
    for action in actions:
        inp = action.get("toolInput", {})
        if inp.get("title"):
            body_parts.append(f"• {inp['title']}")
        if inp.get("date"):
            body_parts.append(f"  Date: {inp['date']}")
        if inp.get("start_time"):
            body_parts.append(f"  Time: {inp['start_time']}")

    return {
        "headline": headline,
        "body": "\n".join(body_parts) if body_parts else "Ready to proceed?",
        "cards": [{
            "type": "confirm_card",
            "headline": headline,
            "body": "\n".join(body_parts),
            "confirm_label": "Confirm",
            "cancel_label": "Cancel",
            "action_data": pending,
        }],
        "chips": [],
    }


def _build_done_headline(results: list[dict]) -> str:
    """Build natural-language headline from confirmed action results."""
    if not results:
        return "Done"

    first = results[0]
    tool_name = first.get("tool", "")
    result_data = first.get("result", {})

    # Try extracting event details for natural language headline
    if isinstance(result_data, dict):
        title = result_data.get("title", "")
        start_time = result_data.get("start_time", "")
        if title and start_time:
            return f"{title} added for {start_time}"
        if title:
            return f"{title} confirmed"

    # Fallback: natural language from tool name
    tool_headlines = {
        "create_event": "Added to timeline",
        "update_event": "Event updated",
        "delete_event": "Event removed",
        "log_check_in": "Check-in logged",
        "log_test_result": "Result logged",
        "set_goal": "Goal set",
        "propose_mode_change": "Mode updated",
    }
    return tool_headlines.get(tool_name, "Done")


def _build_confirmed_response(results: list[dict]) -> dict:
    """Build Pulse done response — natural language + green stat_grid card."""
    success_count = sum(1 for r in results if r.get("success"))
    total = len(results)

    if success_count == total:
        headline = _build_done_headline(results)
        # Build stat_grid items with green highlights showing event details
        items = []
        for r in results:
            result_data = r.get("result", {})
            if isinstance(result_data, dict):
                title = result_data.get("title", r.get("tool", "").replace("_", " ").title())
                date = result_data.get("date", "")
                start_time = result_data.get("start_time", "")
                detail = f"{date} {start_time}".strip() if date or start_time else "Confirmed"
                items.append({"label": title, "value": detail, "highlight": "green"})
            else:
                tool_display = r.get("tool", "").replace("_", " ").title()
                items.append({"label": tool_display, "value": "Confirmed", "highlight": "green"})

        # Use stat_grid for green done card (mobile renderer shows green highlights)
        done_card = {"type": "stat_grid", "items": items} if items else {
            "type": "text_card", "headline": headline, "body": "Action completed."
        }
        body = ""
    else:
        headline = f"{success_count} of {total} actions completed"
        body = "Some actions could not be completed."
        done_card = {"type": "text_card", "headline": headline, "body": body}

    return {
        "headline": headline,
        "body": body,
        "cards": [done_card],
        "chips": [{"label": "What's next?", "message": "What should I do next?"}],
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

        return {
            "final_response": json.dumps(structured),
            "final_cards": structured.get("cards", []),
        }

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
            if card_type in ("text_card", "coach_note"):
                # coach_note uses "note" field, text_card uses "body"
                card_body = (card.get("body") or card.get("note") or "").strip()
                # Strip emoji to check actual text content
                card_body_text = _strip_emoji(card_body)
                if not card_body_text or len(card_body_text) < 15:
                    continue  # Drop cards with empty/emoji-only/too-short body

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
                events = card.get("events") or card.get("items") or []
                if not isinstance(events, list) or not events:
                    continue

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
            "headline": "I'm here to help",
            "body": "Could you tell me more about what you need? Try asking about your readiness, schedule, or training.",
            "cards": [{"type": "text_card", "body": "Try: 'What's my readiness?' or 'Show my schedule'"}],
            "chips": [
                {"label": "My readiness", "message": "What's my readiness?"},
                {"label": "Today's schedule", "message": "What's on today?"},
            ],
        }),
        "final_cards": [],
    }
