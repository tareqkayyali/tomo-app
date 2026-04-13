"""
Tomo AI Service — Greeting Handler ($0 fast-path)
Energy-matched greeting responses. No LLM call needed.

Detects the vibe of the athlete's greeting and mirrors it:
  HIGH ENERGY  — caps, exclamation, hype keywords
  NEUTRAL      — standard "hey", "yo", "what's up"
  LOW ENERGY   — short one-word, quiet tone
  LATE NIGHT   — after 10pm
  EARLY MORNING — before 7am
  RETURNING    — 5+ days since last session
  POST MATCH   — match day or day after

Two hard rules:
  1. Never open with the athlete's name — "Hey James!" feels CRM, not friend
  2. Always end with an open question or action invitation — never a dead end
"""

from __future__ import annotations

import json
import logging
import random
import re
from typing import Optional

from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.greeting")


# ── Energy Tiers ────────────────────────────────────────────────────

GREETING_TIERS = {
    "high_energy": [
        "Aye, there you are. Let's get into it.",
        "That energy — let's put it to work.",
        "Yes. Today's the day. What are we doing?",
        "Love it. Let's not waste it — what's the move?",
        "Okay okay I see you. Let's build something today.",
        "You showed up — now let's make it worth it.",
    ],
    "neutral": [
        "Hey — good to see you. How you feeling today?",
        "What's good. Ready to get into something?",
        "Yo. What are we working with today?",
        "Hey. What's the plan — training, or just checking in?",
        "Good timing. What do you need from me today?",
        "Sup. You training today or just vibing?",
    ],
    "low_energy": [
        "Hey. You good?",
        "Hey — what's going on today?",
        "Hi. How are you actually doing?",
        "Hey. Tired one or just getting started?",
        "What's up. Talk to me — what kind of day has it been?",
    ],
    "late_night": [
        "Still up? What's on your mind.",
        "Late one. Everything alright?",
        "Hey night owl. Training or just thinking?",
    ],
    "early_morning": [
        "Early start. Respect. What are we doing today?",
        "Morning. How'd you sleep?",
        "Up early — good sign. What's the plan?",
    ],
    "returning": [
        "Hey — been a minute. Good to have you back.",
        "There you are. No stress about the gap — what are we doing?",
        "Back. Good. Let's not make a thing of it — what do you need?",
        "Welcome back. How you feeling after the break?",
    ],
    "post_match": [
        "Heard you played recently — how'd it go?",
        "Post-match day. How's the body feeling?",
        "Big day recently. Recovery mode or you feeling okay?",
    ],
}


# ── High-energy detection patterns ──────────────────────────────────

HIGH_ENERGY_PATTERN = re.compile(
    r"yoo+|let'?s\s*go|i'?m\s*ready|hype|letsgo|\byes+\b|let'?s\s*do",
    re.IGNORECASE,
)


def detect_greeting_tier(
    message_text: str,
    context: Optional[PlayerContext] = None,
) -> str:
    """
    Detect greeting energy tier from message text + player context.

    Priority order (first match wins):
      1. Post-match (match today or yesterday)
      2. Returning after absence (5+ days)
      3. Late night (22:00–04:59)
      4. Early morning (05:00–06:59)
      5. High energy (caps, exclamation, keywords)
      6. Low energy (very short message)
      7. Neutral (default)
    """
    text = message_text.strip()
    local_hour = _get_local_hour(context)
    days_since = _get_days_since_last_session(context)
    is_match_context = _is_match_context(context)

    # 1. Post-match — match today or yesterday in context
    if is_match_context:
        return "post_match"

    # 2. Returning after 5+ days
    if days_since is not None and days_since >= 5:
        return "returning"

    # 3. Late night (10pm – 4:59am)
    if local_hour is not None and (local_hour >= 22 or local_hour < 5):
        return "late_night"

    # 4. Early morning (5am – 6:59am)
    if local_hour is not None and 5 <= local_hour < 7:
        return "early_morning"

    # 5. High energy — caps, exclamation marks, hype keywords
    has_caps = len(text) > 3 and text.upper() == text and text.isalpha() is False
    has_exclamation = text.count("!") >= 2
    has_hype_words = bool(HIGH_ENERGY_PATTERN.search(text))
    # Check for ALL CAPS in words (more than 50% of the message)
    words = text.split()
    caps_words = sum(1 for w in words if w.isupper() and len(w) > 1)
    mostly_caps = len(words) > 0 and caps_words / len(words) > 0.5

    if has_hype_words or has_exclamation or mostly_caps:
        return "high_energy"

    # 6. Low energy — very short, quiet greeting
    clean_text = re.sub(r"[^a-zA-Z\s]", "", text).strip()
    if len(clean_text) <= 4:
        return "low_energy"

    # 7. Default — neutral/casual
    return "neutral"


def handle_greeting(
    message_text: str,
    context: Optional[PlayerContext] = None,
) -> str:
    """
    Generate a $0 greeting response. Returns formatted JSON string
    matching the Pulse response format (headline + body, no cards).

    This short-circuits the LLM — instant, free, perfectly vibed.
    """
    tier = detect_greeting_tier(message_text, context)
    phrases = GREETING_TIERS[tier]
    response_text = random.choice(phrases)

    logger.info(f"Greeting fast-path: tier={tier} response='{response_text[:50]}...'")

    # Build Pulse-format JSON response
    # Greeting text goes in headline (bold, prominent) — body left empty.
    # This prevents duplicate rendering: mobile shows MarkdownMessage when
    # headline is empty, which duplicates the body text.
    pulse_response = {
        "headline": response_text,
        "body": "",
        "cards": [],
        "chips": [
            {"label": "Check readiness", "message": "How's my readiness today?"},
            {"label": "Build a session", "message": "Create a training session for today"},
        ],
    }

    return json.dumps(pulse_response)


# ── Helper functions ────────────────────────────────────────────────

def _get_local_hour(context: Optional[PlayerContext]) -> Optional[int]:
    """Extract local hour from player context."""
    if not context or not context.current_time:
        return None
    try:
        return int(context.current_time.split(":")[0])
    except (ValueError, IndexError):
        return None


def _get_days_since_last_session(context: Optional[PlayerContext]) -> Optional[int]:
    """Get days since the athlete's last chat session."""
    if not context or not context.snapshot_enrichment:
        return None
    return context.snapshot_enrichment.days_since_last_session


def _is_match_context(context: Optional[PlayerContext]) -> bool:
    """Check if there's a match today or recent match context."""
    if not context:
        return False

    # Check temporal context
    if context.temporal_context and context.temporal_context.is_match_day:
        return True

    # Check today's events for match/game
    for event in context.today_events:
        event_type = (event.event_type or "").lower()
        title = (event.title or "").lower()
        if event_type in ("match", "game", "competition") or "match" in title:
            return True

    return False
