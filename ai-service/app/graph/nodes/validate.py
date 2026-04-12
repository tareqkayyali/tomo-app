"""
Tomo AI Service — 4-Layer Validation Node
Post-agent guardrails that run on every response before it reaches the user.

Layer 1: PHV Safety (HARD GATE — blocks response if violation)
Layer 2: Content Safety (blocks harmful content)
Layer 3: Format Validation (ensures response structure is parseable)
Layer 4: Quality Check (coaching relevance, data accuracy)

If PHV safety fails → response is replaced with safety message.
If content safety fails → response is replaced with generic safe response.
If format fails → response is reformatted to plain text card.
Quality check is advisory (logged to LangSmith, doesn't block).
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from app.models.state import TomoChatState
from app.models.context import PlayerContext

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


# ── Content Safety Patterns ────────────────────────────────────────

CONTENT_SAFETY_PATTERNS = [
    re.compile(r"\bself.?harm\b", re.I),
    re.compile(r"\bsuicid", re.I),
    re.compile(r"\bkill\s+(?:my)?self\b", re.I),
    re.compile(r"\bsteroids?\b", re.I),
    re.compile(r"\banabolic\b", re.I),
    re.compile(r"\bPED\b"),
    re.compile(r"\bdiagnos(?:e|is|tic)\b.*(?:concussion|fracture|torn)", re.I),
]

CRISIS_RESPONSE = """I noticed something important in our conversation. If you're going through a tough time, please reach out:

🆘 **Crisis Text Line:** Text HOME to 741741
📞 **988 Suicide & Crisis Lifeline:** Call or text 988
💬 **Talk to a trusted adult** — coach, parent, school counselor

You matter. I'm here to help with training, but this is beyond my scope. ❤️"""


# ── Medical Diagnosis Patterns ─────────────────────────────────────

MEDICAL_DIAGNOSIS_PATTERNS = [
    re.compile(r"\byou\s+(?:have|might\s+have|probably\s+have)\s+(?:a\s+)?(?:torn|fractured|broken|sprained)", re.I),
    re.compile(r"\bdiagnos(?:e|is)\b", re.I),
    re.compile(r"\bthis\s+(?:is|could\s+be|looks\s+like)\s+(?:a\s+)?(?:stress\s+fracture|ACL|meniscus|labrum)", re.I),
]


# ── Main Validation Function ──────────────────────────────────────

async def validate_node(state: TomoChatState) -> dict:
    """
    4-layer validation on agent response.

    Returns state update with:
      - validation_passed: bool
      - validation_flags: list of triggered flags
      - agent_response: possibly replaced if safety gate triggered
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

    # ── Layer 2: Content Safety ──────────────────────────────────

    # Self-harm / crisis detection
    for pattern in CONTENT_SAFETY_PATTERNS[:3]:  # First 3 are crisis
        if pattern.search(agent_response):
            flags.append("crisis_content_detected")
            logger.warning("Content safety: crisis content in response")
            return {
                "agent_response": CRISIS_RESPONSE,
                "validation_passed": False,
                "validation_flags": flags,
            }

    # PED / steroid content
    for pattern in CONTENT_SAFETY_PATTERNS[3:6]:
        if pattern.search(agent_response):
            flags.append("ped_content_detected")
            logger.warning("Content safety: PED/steroid content in response")
            return {
                "agent_response": "I can't provide advice on performance-enhancing drugs or steroids. "
                                 "For supplement questions, talk to a qualified sports nutritionist. "
                                 "Let me help with your training instead! 💪",
                "validation_passed": False,
                "validation_flags": flags,
            }

    # Medical diagnosis
    for pattern in MEDICAL_DIAGNOSIS_PATTERNS:
        if pattern.search(agent_response):
            flags.append("medical_diagnosis_warning")
            # Don't replace, but append disclaimer
            agent_response += (
                "\n\n⚠️ *I'm not a medical professional. If you're experiencing pain or injury, "
                "please see a qualified healthcare provider for proper diagnosis and treatment.*"
            )
            break

    # ── Layer 3: Format Validation ───────────────────────────────

    # Check if response is valid JSON (expected format)
    has_json = bool(re.search(r"```json\s*\{", agent_response))
    if not has_json and len(agent_response) > 20:
        # Response is plain text — that's OK, format_response will handle it
        flags.append("plain_text_response")

    # Check for fabricated data patterns
    if re.search(r"\bdata\s+(?:shows?|indicates?)\b.*\b(?:exactly|precisely)\s+\d+\.\d{3,}", agent_response, re.I):
        flags.append("possible_data_fabrication")

    # ── Layer 4: Quality Check (advisory) ────────────────────────

    # Check response isn't too long (Gen Z constraint)
    sentence_count = len(re.findall(r'[.!?]+', agent_response))
    if sentence_count > 8:
        flags.append("verbose_response")

    # Check for filler phrases (Pulse banned list)
    filler_patterns = [
        re.compile(r"^(?:great\s+question|absolutely|of\s+course|certainly)", re.I | re.M),
        re.compile(r"\bgreat\s+question\b", re.I),
        re.compile(r"\babsolutely\b", re.I),
        re.compile(r"\bhere'?s\s+what\s+I\s+found\b", re.I),
        re.compile(r"\bhere'?s\s+your\s+data\b", re.I),
        re.compile(r"\blet\s+me\s+check\b", re.I),
        re.compile(r"\bsure\s+thing\b", re.I),
        re.compile(r"\bbased\s+on\s+your\s+data\b", re.I),
    ]
    for fp in filler_patterns:
        if fp.search(agent_response):
            flags.append("filler_language")
            break

    # Check readiness awareness
    if context and context.readiness_score == "Red":
        if re.search(r"\bHARD\b|\bhigh.?intensity\b|\bmax.?effort\b", agent_response, re.I):
            if not re.search(r"\bdon't|shouldn't|avoid|not\s+recommended\b", agent_response, re.I):
                flags.append("readiness_awareness_miss")
                logger.warning("Quality: RED readiness but response suggests high intensity without caveat")

    validation_passed = "phv_safety_violation" not in flags and "crisis_content_detected" not in flags
    if flags:
        logger.info(f"Validation flags: {flags}")

    return {
        "agent_response": agent_response,
        "validation_passed": validation_passed,
        "validation_flags": flags,
    }
