"""
Tomo AI Service — Validation Node
Post-agent validation that runs on every response before it reaches the user.

Layer 1: PHV Safety (ADVISORY — appends growth-phase warning, never blocks)
Layer 2: Format Validation (ensures response structure is parseable)

All guardrails are ADVISORY — warn and inform, never block the player from
acting. Tomo is a coach/friend who advises, not a gatekeeper who restricts.
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

PHV_SAFETY_WARNING = """

Just a heads up — your body's in a big growth phase right now. Some of these exercises carry extra risk while you're growing this fast. Here are safer alternatives that still build serious strength:

- Goblet squat or bodyweight squat instead of barbell squat (safer for your joints, same technique gains)
- Low box step-up with soft landing instead of depth/drop jumps (keeps the plyometric stimulus low-impact)
- Medicine ball throws or resistance band work instead of Olympic lifts (builds power without axial load)
- Tempo runs at 70% effort or sub-maximal 85% drills instead of maximal sprints
- Trap bar or partial-range bodyweight patterns instead of heavy deadlifts
- RPE-based sub-maximal testing instead of 1RM testing (track progress without the spinal load)

Your call — but I'd go with the alternatives for now. We'll get to the heavy stuff once your growth spurt settles."""


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

    # ── Layer 1: PHV Safety (ADVISORY — warn, never block) ─────
    #
    # Fires when the athlete is explicitly flagged as mid-PHV OR is a
    # growth-age group (U13/U15/U17) OR the context is too thin to rule
    # it out (eval players, unseeded test athletes). Safety must default
    # to ON for unknown age — we'd rather add a benign advisory to an
    # older athlete than skip it for a 14-year-old in the growth spurt.
    #
    # The gate is still ADVISORY: the advisory block is PREPENDED so the
    # athlete sees safe alternatives first, but the original response is
    # preserved underneath. Downstream evaluators look for the
    # `phv_safety_violation` flag as the canonical "gate fired" signal.

    phv_stage = ""
    age_band = ""
    if context:
        if getattr(context, "snapshot_enrichment", None):
            phv_stage = (context.snapshot_enrichment.phv_stage or "").lower()
        age_band = (getattr(context, "age_band", "") or "").upper()
    is_mid_phv = phv_stage in ("mid_phv", "mid", "circa")
    is_growth_age = age_band in ("U13", "U15", "U17")
    # Unknown = conservative default (eval/test athletes, freshly onboarded).
    is_unknown = not phv_stage and not age_band
    should_gate = is_mid_phv or is_growth_age or is_unknown

    if should_gate:
        for pattern in PHV_BLOCKED_PATTERNS:
            if pattern.search(agent_response):
                # `phv_safety_violation` is the canonical flag read by
                # scripts.eval_evaluators.evaluate_phv_safety and by the
                # monitoring pipeline — renaming it silently will break
                # both. Keep `phv_safety_advisory` as a legacy alias so
                # older log consumers still see something familiar.
                flags.append("phv_safety_violation")
                flags.append("phv_safety_advisory")
                logger.warning(
                    f"PHV SAFETY GATE: growth-phase movement in response "
                    f"(pattern={pattern.pattern}, stage={phv_stage or 'unknown'}, "
                    f"age={age_band or 'unknown'}) — prepending safe alternatives."
                )
                # Prepend so the safe alternatives are the first thing the
                # athlete reads. Preserves the original body for context.
                agent_response = PHV_SAFETY_WARNING.lstrip() + "\n\n" + agent_response
                break  # One advisory per response is enough

    # ── Layer 2: Tone Validation (advisory — log, don't block) ───

    tone_violations = _validate_tone(agent_response)
    if tone_violations:
        flags.append("tone_violation")
        logger.warning(
            f"TONE VALIDATION: {len(tone_violations)} violations detected: "
            f"{tone_violations[:3]}"  # log first 3
        )

    # Youth jargon leakage check — logs specific acronyms that slipped into
    # a response for a young athlete. Advisory only; never rewrites the text.
    age_band = ""
    if context:
        age_band = (getattr(context, "age_band", "") or "").upper()
    is_young = age_band in ("U13", "U15", "U17")
    if is_young:
        leaked = [t for t in _YOUTH_JARGON_TERMS
                  if re.search(rf"\b{re.escape(t)}\b", agent_response, re.I)]
        if leaked:
            flags.append("youth_jargon_leak")
            logger.warning(
                f"YOUTH JARGON LEAK ({age_band}): {leaked} — "
                f"consider plain-language rewrite in upstream prompt."
            )

    # ── Layer 3: Format Validation ───────────────────────────────

    # Check if response is valid JSON (expected format)
    has_json = bool(re.search(r"```json\s*\{", agent_response))
    if not has_json and len(agent_response) > 20:
        flags.append("plain_text_response")

    # Check for fabricated data patterns
    if re.search(r"\bdata\s+(?:shows?|indicates?)\b.*\b(?:exactly|precisely)\s+\d+\.\d{3,}", agent_response, re.I):
        flags.append("possible_data_fabrication")

    validation_passed = True  # All validation is advisory — never block
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
    # Youth-age jargon: naming acronyms in isolation without plain-language
    # context feels clinical to a 14–17 year old. These are advisory hits —
    # they are logged so we can audit tone, but never block the response.
    re.compile(r"\bacute[\s:/\\-]+chronic(?:\s+workload)?\b", re.I),
    re.compile(r"\bacute[\s:/\\-]+chronic\s+ratio\b", re.I),
]


# Jargon terms that are OK in educational contexts but should prompt
# a tone flag when dropped in a coaching answer with no plain-language
# scaffolding. Kept separate from BANNED_PATTERNS so we can be more
# nuanced about when to warn vs log.
_YOUTH_JARGON_TERMS = ("ACWR", "PHV", "acute:chronic", "acute/chronic")


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
