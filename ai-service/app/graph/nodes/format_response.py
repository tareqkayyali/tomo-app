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
        "headline": headline or "Here's what I found",
        "body": body or headline or "Here's what I found",
        "cards": [{"type": "text_card", "headline": headline, "body": body or headline}],
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
        "create_event": "📅 Add to calendar?",
        "update_event": "✏️ Update event?",
        "delete_event": "🗑️ Delete event?",
        "log_check_in": "✅ Log check-in?",
        "log_test_result": "📝 Log test result?",
        "set_goal": "🎯 Set new goal?",
        "propose_mode_change": "🔄 Switch mode?",
    }
    headline = headline_map.get(tool_name, "Confirm action?")

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
            "confirm_label": "Yes, do it",
            "cancel_label": "Cancel",
            "action_data": pending,
        }],
        "chips": [],
    }


def _build_confirmed_response(results: list[dict]) -> dict:
    """Build response after a write action has been confirmed and executed."""
    success_count = sum(1 for r in results if r.get("success"))
    total = len(results)

    if success_count == total:
        headline = "✅ Done!"
        body_parts = []
        for r in results:
            tool_display = r.get("tool", "").replace("_", " ").title()
            body_parts.append(f"• {tool_display} completed")
        body = "\n".join(body_parts) if body_parts else "Action completed successfully."
    else:
        headline = "⚠️ Partial success"
        body = f"{success_count}/{total} actions completed."

    return {
        "headline": headline,
        "body": body,
        "cards": [{"type": "text_card", "headline": headline, "body": body}],
        "chips": [
            {"label": "What's next?", "message": "What should I do next?"},
        ],
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
        structured = _build_confirmation_response(pending_write)
        return {
            "final_response": json.dumps(structured),
            "final_cards": structured.get("cards", []),
        }

    # Case 2: Write action was confirmed and executed
    if write_confirmed and agent_response:
        try:
            confirmed_data = json.loads(agent_response)
            results = confirmed_data.get("confirmed_results", [])
            structured = _build_confirmed_response(results)
        except (json.JSONDecodeError, TypeError):
            structured = _build_text_response(agent_response)

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
            # Drop text/note cards with empty body (renders as blank UI block)
            card_type = card["type"]
            if card_type in ("text_card", "coach_note"):
                if not card.get("body", "").strip():
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

        return {
            "final_response": json.dumps(structured),
            "final_cards": structured.get("cards", []),
        }

    # Case 4: Fallback — plain text to text_card
    if agent_response:
        structured = _build_text_response(agent_response)
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
