"""
Strict-throw validator for assembled system prompts.

Architect non-negotiable: a system prompt missing required safety sections
must throw, not silently omit. Token budget breaches must throw with guidance
that RAG content is truncated FIRST, never safety/dual-load.

Pure function — no I/O, no logging side effects (callers log warnings).

Active hard checks (THROW):
  1. PHV awareness present when athlete is mid-PHV.
  2. Total prompt tokens within budget.

Soft warnings (returned, not raised):
  - RED injury risk flag without any RED acknowledgment in dynamic_block.
  - CCRS score known but CCRS section absent (data injection regression).
  - Missing dual-load block when academic signal is detected.

The CMS-managed safety_gate_policy_block (last entry in build_system_prompt
dynamic_parts) is the canonical home for runtime-configurable safety rules.
This validator is a backstop, not a replacement.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from app.models.context import PlayerContext


class SafetyValidationError(Exception):
    """Raised when an assembled prompt violates a hard safety invariant."""
    pass


@dataclass(frozen=True)
class ValidationResult:
    warnings: list[str]
    static_tokens: int
    dynamic_tokens: int
    total_tokens: int


# Substring markers each safety block writes into the dynamic_block.
# Source-of-truth: prompt_builder.py block builders.
PHV_MARKER = "PHV AWARENESS"
CCRS_MARKER = "READINESS (internal reference"
DUAL_LOAD_MARKER = "DUAL-LOAD CONTEXT"
RED_RISK_MARKERS = ("RED", "INJURY RISK")  # at least one must appear

MID_PHV_STAGES = {"mid_phv", "mid", "circa"}


def estimate_tokens(text: str) -> int:
    """
    Cheap token estimate: ~4 characters per token.
    Good enough for a budget guard. Real tokenization happens at the model.
    """
    if not text:
        return 0
    return max(1, len(text) // 4)


def validate_safety_sections(
    ctx: "PlayerContext",
    static_block: str,
    dynamic_block: str,
    *,
    max_total_tokens: int = 16000,
    soft_budget_tokens: int = 8000,
    rag_token_estimate: int = 0,
) -> ValidationResult:
    """
    Validate an assembled system prompt against architect non-negotiables.

    Token budget thresholds:
      - max_total_tokens (default 16000): catastrophic-only hard throw. Prompts
        far above production reality (≈10–11K observed 2026-04-26) where a bug
        is the most likely explanation. Tuned with headroom so Phase 1's memory
        block (~800 tokens) cannot break production chat.
      - soft_budget_tokens (default 8000): architect target. Emits a warning
        rather than raising so we get telemetry on the gap. Static-block
        compression is a separate follow-up that will pull production back
        toward this target.

    Raises:
        SafetyValidationError: on any hard violation.
    Returns:
        ValidationResult with soft warnings and token measurements.
    """
    warnings: list[str] = []

    static_tokens = estimate_tokens(static_block)
    dynamic_tokens = estimate_tokens(dynamic_block)
    total_tokens = static_tokens + dynamic_tokens

    se = getattr(ctx, "snapshot_enrichment", None)
    upper_dynamic = dynamic_block.upper()

    # ── HARD CHECK 1: PHV awareness for mid-PHV athletes ─────────────────
    # build_phv_block returns content only for mid-PHV stages. If the
    # athlete is mid-PHV and the marker is missing, the prompt is unsafe.
    if se and se.phv_stage and se.phv_stage.lower() in MID_PHV_STAGES:
        if PHV_MARKER not in dynamic_block:
            raise SafetyValidationError(
                f"phv_stage={se.phv_stage!r} but PHV section missing from dynamic_block. "
                f"build_phv_block(ctx) must emit '{PHV_MARKER}' for mid-PHV athletes."
            )

    # ── HARD CHECK 2: Catastrophic token budget breach ───────────────────
    # Architect rule: truncate RAG FIRST when over budget — never safety/dual-load.
    if total_tokens > max_total_tokens:
        guidance = (
            f"prompt exceeds budget: {total_tokens} > {max_total_tokens} tokens "
            f"(static={static_tokens}, dynamic={dynamic_tokens}, rag~={rag_token_estimate}). "
            f"Truncate RAG content before reducing safety, dual-load, or PHV blocks."
        )
        raise SafetyValidationError(guidance)

    # ── SOFT BUDGET: architect 8K target ─────────────────────────────────
    if total_tokens > soft_budget_tokens:
        warnings.append(
            f"prompt over architect target: {total_tokens} > {soft_budget_tokens} tokens "
            f"(static={static_tokens}, dynamic={dynamic_tokens}); "
            f"compress static block to recover headroom."
        )

    # ── SOFT WARNING: RED injury risk lacks acknowledgment ───────────────
    if se and (se.injury_risk_flag or "").upper() == "RED":
        if not any(marker in upper_dynamic for marker in RED_RISK_MARKERS):
            warnings.append(
                "injury_risk_flag=RED but no RED/INJURY RISK marker in dynamic_block; "
                "verify safety_gate_policy_block is firing for this athlete."
            )

    # ── SOFT WARNING: CCRS known but section missing ─────────────────────
    if se and se.ccrs is not None and CCRS_MARKER not in dynamic_block:
        warnings.append(
            f"ccrs={se.ccrs} known but CCRS section absent — data injection regression."
        )

    # ── SOFT WARNING: dual-load signal but block missing ─────────────────
    has_academic_signal = bool(
        getattr(ctx, "upcoming_exams", None)
        or (
            getattr(ctx, "readiness_components", None)
            and getattr(ctx.readiness_components, "academic_stress", None) is not None
            and ctx.readiness_components.academic_stress >= 4
        )
        or (se and se.dual_load_index is not None)
    )
    if has_academic_signal and DUAL_LOAD_MARKER not in dynamic_block:
        warnings.append(
            "academic signal detected but DUAL-LOAD CONTEXT block missing; "
            "Angle 2 differentiator regression risk."
        )

    return ValidationResult(
        warnings=warnings,
        static_tokens=static_tokens,
        dynamic_tokens=dynamic_tokens,
        total_tokens=total_tokens,
    )
