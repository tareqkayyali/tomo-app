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

# Multi-step flow text generation (separate flag so we can enable warmth in
# build_session / plan_training without touching data_display cost profile).
_FLOW_STEP_TEXT_GEN_ENABLED = os.environ.get(
    "FLOW_STEP_TEXT_GEN_ENABLED", "true"
).lower() == "true"


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


async def generate_flow_step_text(
    step_kind: str,
    flow_context: dict,
    player_name: str = "",
    sport: str = "",
    position: str = "",
    age_band: str = "",
    timeout_s: float = 1.5,
) -> dict[str, str] | None:
    """Generate warm headline + body for a multi-step flow card.

    step_kind: "fork" | "pick_focus" | "session_plan" | "confirm"
    flow_context: arbitrary dict describing the current flow state
        (focus, date, drill count, existing events, etc.)

    Returns {"headline": str, "body": str} or None on failure/disabled.
    Caller MUST have a deterministic fallback for graceful degradation.
    """
    if not _FLOW_STEP_TEXT_GEN_ENABLED:
        return None

    try:
        import asyncio
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic()

        # Age-band tone hint (matches orchestrator profiles — kept terse).
        tone_hint = {
            "U13": "playful, short sentences, no jargon",
            "U15": "encouraging, simple, lightly technical",
            "U17": "direct coach, confident, sport-specific",
            "U19": "peer coach, real talk, sharp",
            "U21": "peer coach, real talk, sharp",
            "SEN": "professional peer, sharp, no fluff",
        }.get(age_band or "U17", "direct coach, warm, concise")

        # Step-specific instruction
        step_guide = {
            "fork": (
                "You are asking the athlete: do they want to build onto an "
                "existing scheduled session, or create a brand new one. "
                "DO NOT assume a training theme (do not say 'speed work', "
                "'gym', 'technical', etc.). DO NOT mention morning or evening. "
                "Stay neutral about session type. Headline must be a short "
                "generic question about picking existing vs new. Body can be "
                "one short sentence of encouragement, no specifics."
            ),
            "pick_focus": (
                "You are asking the athlete what training focus they want. "
                "The options are speed, strength, technical, agility, "
                "endurance, or recovery. Headline is a short coaching "
                "question asking them to choose a focus. Body is one sentence "
                "framing the choice with energy. Do not assume any focus."
            ),
            "session_plan": (
                "You are presenting the drills you built. Headline names the "
                "focus with confidence. Body is one sentence summarizing the "
                "total minutes and vibe — encouraging, not clinical."
            ),
            "confirm": (
                "You are asking the athlete to lock the session into their "
                "timeline. Headline is a short confirmation question. Body "
                "is one sentence reinforcing the commitment."
            ),
        }.get(step_kind, "Generate warm coaching text.")

        system = (
            "You are Tomo, an AI coach for young athletes. "
            f"Tone: {tone_hint}. "
            "No emoji. No corporate language. Never repeat the athlete's "
            "name more than once. "
            f"{step_guide} "
            "Respond in JSON only: "
            '{"headline": "...", "body": "..."}. '
            "Headline max 8 words. Body max 18 words."
        )

        ctx_lines = []
        if player_name:
            ctx_lines.append(f"Athlete: {player_name}")
        if sport:
            ctx_lines.append(f"Sport: {sport}")
        if position:
            ctx_lines.append(f"Position: {position}")
        if age_band:
            ctx_lines.append(f"Age band: {age_band}")
        ctx_lines.append(f"Step: {step_kind}")
        for k, v in flow_context.items():
            if v is None or v == "":
                continue
            ctx_lines.append(f"{k}: {v}")
        user_msg = "\n".join(ctx_lines)

        response = await asyncio.wait_for(
            client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=120,
                system=system,
                messages=[{"role": "user", "content": user_msg}],
            ),
            timeout=timeout_s,
        )

        import json
        text = response.content[0].text.strip()
        # Strip markdown fences if Haiku adds them
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        parsed = json.loads(text)
        headline = (parsed.get("headline") or "").strip()
        body = (parsed.get("body") or "").strip()
        if not headline:
            return None
        return {"headline": headline, "body": body}

    except Exception as e:
        logger.debug(f"Flow step text generation skipped: {e}")
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
