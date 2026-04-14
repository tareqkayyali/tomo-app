"""
Tomo AI Service -- Constrained Text Generator
Optional Haiku call for warm headline/body text (200 token budget).

Used by data_display pattern when deterministic headlines aren't enough.
If the Haiku call fails or is disabled, falls back to deterministic text.

Cost: ~$0.0003 per call (200 input + 200 output tokens).
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger("tomo-ai.flow.text_generator")

# Feature flag: skip Haiku text generation entirely for $0 data_display
_TEXT_GEN_ENABLED = os.environ.get("FLOW_TEXT_GEN_ENABLED", "false").lower() == "true"


async def generate_warm_text(
    intent_id: str,
    card_data: dict,
    player_name: str = "",
    sport: str = "",
) -> dict[str, str] | None:
    """Generate warm headline + body text using Haiku (200 token budget).

    Returns {"headline": str, "body": str} or None if disabled/failed.
    Falls back gracefully -- caller should always have deterministic fallback.
    """
    if not _TEXT_GEN_ENABLED:
        return None

    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic()

        # Build a tiny, focused prompt
        system = (
            "You are Tomo, a warm AI coach for young athletes. "
            "Generate a headline (max 8 words) and body (max 2 sentences) "
            "for a data card. Be warm, encouraging, and coaching-first. "
            "No emoji. No technical jargon. Respond in JSON: "
            '{"headline": "...", "body": "..."}'
        )

        context_parts = []
        if player_name:
            context_parts.append(f"Athlete: {player_name}")
        if sport:
            context_parts.append(f"Sport: {sport}")
        context_parts.append(f"Intent: {intent_id}")
        context_parts.append(f"Data summary: {_summarize_card(card_data)}")

        user_msg = "\n".join(context_parts)

        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        )

        import json
        text = response.content[0].text
        parsed = json.loads(text)
        return {
            "headline": parsed.get("headline", ""),
            "body": parsed.get("body", ""),
        }

    except Exception as e:
        logger.debug(f"Text generation skipped: {e}")
        return None


def _summarize_card(card_data: dict) -> str:
    """Create a 1-line summary of card data for the Haiku prompt."""
    card_type = card_data.get("type", "")
    if card_type == "stat_grid":
        items = card_data.get("items", [])
        parts = [f"{it.get('label')}: {it.get('value')}" for it in items[:4]]
        return ", ".join(parts)
    elif card_type == "schedule_list":
        items = card_data.get("items", [])
        return f"{len(items)} events today"
    return str(card_data)[:200]
