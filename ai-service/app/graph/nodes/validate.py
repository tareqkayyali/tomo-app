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

PHV_SAFETY_REPLACEMENT = """⚠️ **Safety Notice — Growth Phase**

I adjusted my recommendation because you're in your peak growth phase (Mid-PHV). Some exercises I initially considered aren't safe right now:

**Safe alternatives for your growth stage:**
- Goblet squat instead of barbell squat (protects growth plates)
- Soft-landing box steps instead of depth/drop jumps
- Light dumbbells/kettlebells instead of Olympic lifts
- 85% effort accel-decel drills instead of maximal sprints
- Trap bar / partial ROM instead of heavy deadlifts

Your body is growing fast — we protect the joints and tendons now, build max strength after your growth spurt. 💪"""


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

    # ── Layer 2: Format Validation ───────────────────────────────

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
