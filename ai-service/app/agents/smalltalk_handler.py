"""
Tomo AI Service -- Smalltalk Handler ($0 tier detection + LLM guidance)

Social-reciprocity and mood-statement handler. Mirrors greeting_handler.py:
this module does NOT short-circuit the LLM -- it detects the smalltalk
tier and lets agent_dispatch inject tier-specific vibe examples into the
system prompt. The full open_coaching path still runs so responses get
sport / position / age-band grounding.

Tiers:
  POSITIVE_MOOD  -- "feeling good", "im great", "doing well"
  NEUTRAL_MOOD   -- "alright", "ok", "not bad"
  NEGATIVE_MOOD  -- "tired", "rough day", "meh", "bored"
  RECIPROCAL_BID -- "...what about you?", "how are you?" (social reciprocation)
  CURIOUS        -- catch-all for casual talk that doesn't fit above

Two hard rules (same as greetings):
  1. Never open with the athlete's name
  2. Always end with an open invitation -- never a dead-end
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from app.models.context import PlayerContext

logger = logging.getLogger("tomo-ai.smalltalk")


# ── Tier phrase banks (used as inspiration, not literal scripts) ────

SMALLTALK_TIERS = {
    "positive_mood": [
        "Love hearing that. What do you want to do with the good energy?",
        "Solid. Anything you want to put it toward today?",
        "Good -- keep that rolling. What's on your mind?",
        "Nice. Training on your mind or just catching up?",
        "That's the energy. What are you thinking about today?",
    ],
    "neutral_mood": [
        "Fair. Anything on your mind or just checking in?",
        "Cool. What's going on today?",
        "Alright. Walk me through the day a bit.",
        "Fine is fine. Anything you want to talk through?",
        "Got it. What do you need from me right now?",
    ],
    "negative_mood": [
        "Rough one? Walk me through it. No rush.",
        "Hey, no stress. What's going on?",
        "Tired is real. Talk to me -- body or head?",
        "That's ok. What kind of day has it been?",
        "Appreciate you saying. What do you need from me right now?",
    ],
    "reciprocal_bid": [
        "I'm good -- more importantly, how are YOU actually doing?",
        "Solid on my end. But talk to me -- what's on your side today?",
        "Me? All good. What about you -- real answer.",
        "Good, thanks for asking. What's happening on your end?",
    ],
    "curious": [
        "Hey -- what's on your mind?",
        "Talk to me. What are you thinking about?",
        "I'm here. What do you want to get into?",
        "Go on -- what's up?",
    ],
}


# ── Detection patterns ─────────────────────────────────────────────

_POSITIVE_PATTERNS = [
    r"\b(feel|feeling|im|i'm|i am)\s+(good|great|amazing|awesome|fine|well|solid|fresh|hyped|energised|energized|pumped)\b",
    r"\bdoing (well|good|great|fine|alright)\b",
    r"\bpretty good\b",
    r"\ball good\b",
    r"\bim great\b",
]

_NEUTRAL_PATTERNS = [
    r"\b(feel|feeling|im|i'm|i am)\s+(ok|okay|alright|meh|whatever)\b",
    r"\bnot bad\b",
    r"\b(alright|okay|ok|fine)\b\s*$",
    r"\bso so\b",
    r"\bcould be better\b",
]

_NEGATIVE_PATTERNS = [
    r"\b(feel|feeling|im|i'm|i am)\s+(tired|exhausted|drained|dead|knackered|shattered|burnt out|bored|down|flat|low|rough|sluggish|slow|heavy)\b",
    r"\bdead today\b",
    r"\bhaving a (rough|tough|bad|crap|shit|hard) day\b",
    r"\btired today\b",
    r"\bbored\b",
    r"\bmeh\b",
]

_RECIPROCAL_PATTERNS = [
    r"\bwhat about you\b",
    r"\band you\??",
    r"\byou\s*\?\s*$",
    r"\bhow are you\b",
    r"\bhow's it going with you\b",
    r"\byourself\??\s*$",
    r"\bhow've you been\b",
    r"\bhow have you been\b",
]


def _matches_any(text: str, patterns: list[str]) -> bool:
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


def detect_smalltalk_tier(
    message_text: str,
    context: Optional[PlayerContext] = None,
) -> str:
    """
    Detect smalltalk tier from message text.

    Priority order (first match wins):
      1. Reciprocal bid ("what about you?", "and you?")
      2. Negative mood (takes priority -- emotional support first)
      3. Positive mood
      4. Neutral mood
      5. Curious (catch-all)
    """
    text = (message_text or "").strip()

    # 1. Reciprocal bid -- check first so "feeling good, what about you?"
    # lands in reciprocal (the social gesture is more informative than
    # the mood report for driving Tomo's response).
    if _matches_any(text, _RECIPROCAL_PATTERNS):
        return "reciprocal_bid"

    # 2. Negative mood (emotional support takes priority)
    if _matches_any(text, _NEGATIVE_PATTERNS):
        return "negative_mood"

    # 3. Positive mood
    if _matches_any(text, _POSITIVE_PATTERNS):
        return "positive_mood"

    # 4. Neutral mood
    if _matches_any(text, _NEUTRAL_PATTERNS):
        return "neutral_mood"

    # 5. Default: curious
    return "curious"


def build_smalltalk_guidance(tier: str) -> str:
    """
    Build LLM guidance for smalltalk responses based on detected tier.
    Mirrors _build_greeting_guidance in agent_dispatch.py. Used as
    inspiration -- NOT literal scripts.
    """
    TIER_GUIDANCE = {
        "positive_mood": (
            "CURRENT INTENT: SMALLTALK (POSITIVE MOOD -- athlete is feeling good)\n"
            "Match their energy warmly. Acknowledge the good mood, then open\n"
            "the door: ask what they want to do with the energy. No training\n"
            "advice unless they steer toward it.\n"
            "Vibe examples (inspiration only):\n"
            "- \"Love hearing that. What do you want to do with the good energy?\"\n"
            "- \"Solid. Anything you want to put it toward today?\"\n"
            "- \"That's the energy. What are you thinking about today?\""
        ),
        "neutral_mood": (
            "CURRENT INTENT: SMALLTALK (NEUTRAL MOOD -- athlete is fine/alright)\n"
            "Be warm and curious. Mirror their low-key tone. Invite them to\n"
            "say more without forcing it.\n"
            "Vibe examples (inspiration only):\n"
            "- \"Fair. Anything on your mind or just checking in?\"\n"
            "- \"Alright. Walk me through the day a bit.\"\n"
            "- \"Got it. What do you need from me right now?\""
        ),
        "negative_mood": (
            "CURRENT INTENT: SMALLTALK (NEGATIVE MOOD -- athlete is tired/down/bored)\n"
            "This is emotional-support territory. Acknowledge FIRST. No\n"
            "training advice, no fixes, no cards. VALIDATE, then ask gently\n"
            "what's going on. Zero judgment.\n"
            "Vibe examples (inspiration only):\n"
            "- \"Rough one? Walk me through it. No rush.\"\n"
            "- \"Tired is real. Talk to me -- body or head?\"\n"
            "- \"That's ok. What kind of day has it been?\""
        ),
        "reciprocal_bid": (
            "CURRENT INTENT: SMALLTALK (RECIPROCAL BID -- athlete asked how YOU are)\n"
            "This is a social gesture -- a friend asking how you're doing.\n"
            "Give a short, warm reply about yourself (be playful, human),\n"
            "then flip it back and ASK THEM how they're really doing. Do NOT\n"
            "ignore the reciprocation -- that makes you feel like a robot.\n"
            "Vibe examples (inspiration only):\n"
            "- \"I'm good -- more importantly, how are YOU actually doing?\"\n"
            "- \"Me? All good. What about you -- real answer.\"\n"
            "- \"Solid on my end. But talk to me -- what's on your side today?\""
        ),
        "curious": (
            "CURRENT INTENT: SMALLTALK (CURIOUS -- casual conversational bid)\n"
            "Be warm and open. Ask what's on their mind. Keep it short.\n"
            "Vibe examples (inspiration only):\n"
            "- \"Hey -- what's on your mind?\"\n"
            "- \"Talk to me. What are you thinking about?\"\n"
            "- \"I'm here. What do you want to get into?\""
        ),
    }

    base = TIER_GUIDANCE.get(tier, TIER_GUIDANCE["curious"])

    return (
        f"{base}\n\n"
        "SMALLTALK RULES:\n"
        "- NO data cards, NO stat_grids, NO benchmarks, NO tools. Just talk.\n"
        "- NEVER open with the athlete's name.\n"
        "- ALWAYS end with an open question -- never a dead-end statement.\n"
        "- Keep it to 1-2 sentences max. Short, warm, human.\n"
        "- Do NOT serve a menu of chips or options. Keep the thread open.\n"
        "- If the mood is negative, VALIDATE first -- no training pivots."
    )
