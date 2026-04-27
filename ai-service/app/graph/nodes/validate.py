"""
Tomo AI Service — Validation Node

Post-agent validation that runs on every response before it reaches the user.

Layer 1: PHV Safety (ADVISORY — appends growth-phase warning, never blocks)
Layer 2: Format Validation (ensures response structure is parseable)

All guardrails are ADVISORY — warn and inform, never block the player from
acting. Tomo is a coach/friend who advises, not a gatekeeper who restricts.

Phase 3 cutover (2026-04-27): all hardcoded PHV patterns, banned phrases,
and the safety-warning text now read from the methodology resolver
(`app.instructions.resolver.resolve`). When the PD has not yet published
a snapshot, the resolver falls back to the in-memory seed (verbatim
restoration of the previous hardcoded values), so behaviour is identical
on a fresh install.
"""

from __future__ import annotations

import logging
import re

from app.instructions.resolver import resolve
from app.models.state import TomoChatState

logger = logging.getLogger("tomo-ai.validate")


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

    # Resolve once for this turn — scope-filtered to athlete + the relevant
    # age_band / phv_stage. Cached by the loader (60s TTL) so this is cheap.
    phv_stage = ""
    age_band = ""
    sport = None
    if context:
        if getattr(context, "snapshot_enrichment", None):
            phv_stage = (context.snapshot_enrichment.phv_stage or "").lower()
        age_band = (getattr(context, "age_band", "") or "").upper()
        sport = getattr(context, "sport", None)

    rules = await resolve(
        audience="athlete",
        sport=sport,
        age_band=age_band or None,
        phv_stage=phv_stage or None,
    )

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

    is_mid_phv = phv_stage in ("mid_phv", "mid", "circa")
    is_growth_age = age_band in ("U13", "U15", "U17")
    is_unknown = not phv_stage and not age_band

    phv = rules.guardrail_phv()
    # If the PD set unknown_age_default to 'permissive' we don't gate on
    # missing context. Default is 'conservative' (preserves prior behaviour).
    unknown_conservative = (phv is None) or phv.unknown_age_default == "conservative"
    should_gate = is_mid_phv or is_growth_age or (is_unknown and unknown_conservative)

    if should_gate and phv is not None:
        for pattern in phv.compiled_blocked_patterns:
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
                warning = phv.safety_warning.lstrip()
                if warning:
                    agent_response = warning + "\n\n" + agent_response
                break  # One advisory per response is enough

    # ── Layer 2: Tone Validation (advisory — log, don't block) ───

    tone_violations = _validate_tone(agent_response, rules)
    if tone_violations:
        flags.append("tone_violation")
        logger.warning(
            f"TONE VALIDATION: {len(tone_violations)} violations detected: "
            f"{tone_violations[:3]}"  # log first 3
        )

    # Youth jargon leakage check — logs specific acronyms that slipped into
    # a response for a young athlete. Advisory only; never rewrites the text.
    is_young = age_band in ("U13", "U15", "U17")
    if is_young:
        tone = rules.tone_rules()
        jargon_terms = list(tone.youth_jargon_terms) if tone else []
        leaked = [
            t
            for t in jargon_terms
            if re.search(rf"\b{re.escape(t)}\b", agent_response, re.I)
        ]
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
    if re.search(
        r"\bdata\s+(?:shows?|indicates?)\b.*\b(?:exactly|precisely)\s+\d+\.\d{3,}",
        agent_response,
        re.I,
    ):
        flags.append("possible_data_fabrication")

    validation_passed = True  # All validation is advisory — never block
    if flags:
        logger.info(f"Validation flags: {flags}")

    return {
        "agent_response": agent_response,
        "validation_passed": validation_passed,
        "validation_flags": flags,
    }


# ── Tone Validation — read banned phrases/patterns from resolver ─────


def _validate_tone(text: str, rules) -> list[str]:
    """
    Check response text against the tone directive's banned phrases and
    compiled regex patterns. Returns list of violations found.
    Advisory only — log violations, never block the response.
    """
    tone = rules.tone_rules() if rules else None
    if tone is None:
        return []

    violations: list[str] = []
    text_lower = text.lower()

    for phrase in tone.banned_phrases:
        if phrase in text_lower:
            violations.append(f'Banned phrase: "{phrase}"')

    for pattern in tone.compiled_banned_patterns:
        if pattern.search(text):
            violations.append(f"Banned pattern: {pattern.pattern}")

    return violations
