"""
Tomo AI Service — Validation Node
Post-agent validation that runs on every response before it reaches the user.

Layer 1: PHV Safety (HARD GATE — blocks response if Mid-PHV violation)
Layer 2: Format Validation (ensures response structure is parseable)

All other guardrails (content safety, RED risk, quality checks) have been
removed from code. They will be re-added as CMS-configurable rules in a
future phase. PHV is the only non-negotiable hard gate.
"""

from __future__ import annotations

import logging
import re

from app.models.state import TomoChatState

logger = logging.getLogger("tomo-ai.validate")


# ── PHV Contraindicated Movements ──────────────────────────────────

PHV_BLOCKED_PATTERNS = [
    re.compile(r"\bbarbell\s+(?:back\s+)?squat", re.I),
    re.compile(r"\bdepth\s+jump", re.I),
    re.compile(r"\bdrop\s+jump", re.I),
    re.compile(r"\bolympic\s+lift", re.I),
    re.compile(r"\bclean\s+and\s+jerk", re.I),
    re.compile(r"\bsnatch\b", re.I),
    re.compile(r"\bmax(?:imal)?\s+sprint", re.I),
    re.compile(r"\bheavy\s+deadlift", re.I),
    re.compile(r"\bmax\s+(?:effort\s+)?(?:squat|deadlift|bench)", re.I),
    re.compile(r"\b1\s*rm\b", re.I),  # 1RM testing
    re.compile(r"\bplyometric.*max", re.I),
]

PHV_SAFETY_REPLACEMENT = """Hey — heads up on this one 💪

I tweaked my suggestion because your body's in a big growth phase right now. Some of those exercises aren't a great idea while you're growing this fast — but here's what works just as well:

**What to do instead:**
- Goblet squat instead of barbell squat (way safer for your joints)
- Soft-landing box steps instead of depth/drop jumps
- Light dumbbells or kettlebells instead of Olympic lifts
- 85% effort drills instead of maximal sprints
- Trap bar or partial range instead of heavy deadlifts

We'll get you to the heavy stuff once your growth spurt settles — for now, these alternatives still build serious strength without the risk. You've got this."""


# ── Main Validation Function ──────────────────────────────────────

async def validate_node(state: TomoChatState) -> dict:
    """
    Validation on agent response. Only PHV safety is enforced as a hard gate.

    Returns state update with:
      - validation_passed: bool
      - validation_flags: list of triggered flags
      - agent_response: possibly replaced if PHV safety gate triggered
    """
    agent_response = state.get("agent_response", "")
    context = state.get("player_context")
    flags: list[str] = []

    if not agent_response:
        return {"validation_passed": True, "validation_flags": []}

    # ── Layer 1: PHV Safety (HARD GATE) ──────────────────────────

    is_mid_phv = False
    if context and context.snapshot_enrichment:
        phv_stage = (context.snapshot_enrichment.phv_stage or "").lower()
        is_mid_phv = phv_stage in ("mid_phv", "mid", "circa")

    if is_mid_phv:
        for pattern in PHV_BLOCKED_PATTERNS:
            if pattern.search(agent_response):
                flags.append("phv_safety_violation")
                logger.warning(
                    f"PHV SAFETY GATE: Blocked movement detected in response. "
                    f"Pattern: {pattern.pattern}"
                )
                # Replace response with safety message
                return {
                    "agent_response": PHV_SAFETY_REPLACEMENT,
                    "validation_passed": False,
                    "validation_flags": flags,
                }

    # ── Layer 2: Tone Validation (advisory — log, don't block) ───

    tone_violations = _validate_tone(agent_response)
    if tone_violations:
        flags.append("tone_violation")
        logger.warning(
            f"TONE VALIDATION: {len(tone_violations)} violations detected: "
            f"{tone_violations[:3]}"  # log first 3
        )

    # ── Layer 3: Format Validation ───────────────────────────────

    # Check if response is valid JSON (expected format)
    has_json = bool(re.search(r"```json\s*\{", agent_response))
    if not has_json and len(agent_response) > 20:
        flags.append("plain_text_response")

    # Check for fabricated data patterns
    if re.search(r"\bdata\s+(?:shows?|indicates?)\b.*\b(?:exactly|precisely)\s+\d+\.\d{3,}", agent_response, re.I):
        flags.append("possible_data_fabrication")

    validation_passed = "phv_safety_violation" not in flags
    if flags:
        logger.info(f"Validation flags: {flags}")

    return {
        "agent_response": agent_response,
        "validation_passed": validation_passed,
        "validation_flags": flags,
    }


# ── Tone Validation — Companion Clause enforcement ─────────────

BANNED_PHRASES = [
    "great effort", "fantastic work", "amazing job", "keep it up",
    "you've got this", "believe in yourself", "stay focused",
    "crushing it", "optimal performance", "according to your data",
    "your metrics indicate", "it is recommended", "you should consider",
    "thank you for your input", "session has been generated",
    "based on your performance", "incredible work", "amazing progress",
    "keep pushing", "stay motivated", "excellent work",
]

BANNED_PATTERNS = [
    re.compile(r"today'?s session (will|focuses|is designed)", re.I),
    re.compile(r"the programme (requires|states|indicates)", re.I),
    re.compile(r"research shows that", re.I),
    re.compile(r"it is important to (note|understand|remember)", re.I),
    re.compile(r"according to (your|the) data", re.I),
    re.compile(r"your (ACWR|HRV|readiness score) (is|indicates|shows)", re.I),
    re.compile(r"based on (your|the) (data|metrics|performance)", re.I),
    re.compile(r"I recommend that you", re.I),
    re.compile(r"studies (show|suggest|indicate)", re.I),
]


def _validate_tone(text: str) -> list[str]:
    """
    Check response text against banned phrases and patterns.
    Returns list of violations found. Empty = passed.
    Advisory only in v1 — log violations, do not block response.
    """
    violations: list[str] = []
    text_lower = text.lower()

    for phrase in BANNED_PHRASES:
        if phrase in text_lower:
            violations.append(f'Banned phrase: "{phrase}"')

    for pattern in BANNED_PATTERNS:
        if pattern.search(text):
            violations.append(f"Banned pattern: {pattern.pattern}")

    return violations
