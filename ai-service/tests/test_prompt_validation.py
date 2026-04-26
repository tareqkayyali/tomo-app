"""
Tests for the strict-throw prompt validator (Phase 1, 2026-04-26).

validate_safety_sections is a pure function. We test:
  - PHV missing for mid-PHV athlete → THROW
  - PHV present for mid-PHV athlete → OK
  - non-mid-PHV athletes don't trigger PHV check
  - token budget breach → THROW with RAG-truncation guidance
  - RED risk without acknowledgment → SOFT WARNING
  - CCRS known but section missing → SOFT WARNING
  - dual-load signal but block missing → SOFT WARNING
"""

from __future__ import annotations

import pytest

from app.agents.prompt_validation import (
    SafetyValidationError,
    estimate_tokens,
    validate_safety_sections,
)
from app.models.context import (
    PlayerContext,
    ReadinessComponents,
    SnapshotEnrichment,
)


def _ctx(
    *,
    phv_stage: str | None = None,
    ccrs: float | None = None,
    injury_risk_flag: str | None = None,
    dual_load_index: float | None = None,
    academic_stress: float | None = None,
    upcoming_exams=None,
) -> PlayerContext:
    """Build a minimal PlayerContext for validator tests."""
    return PlayerContext(
        user_id="athlete-1",
        today_date="2026-04-26",
        current_time="10:00",
        snapshot_enrichment=SnapshotEnrichment(
            phv_stage=phv_stage,
            ccrs=ccrs,
            injury_risk_flag=injury_risk_flag,
            dual_load_index=dual_load_index,
        ),
        readiness_components=ReadinessComponents(
            energy=3,
            soreness=3,
            sleep_hours=8,
            mood=3,
            academic_stress=academic_stress,
        ) if academic_stress is not None else None,
        upcoming_exams=upcoming_exams or [],
    )


class TestEstimateTokens:
    def test_empty_returns_zero(self):
        assert estimate_tokens("") == 0
        assert estimate_tokens(None) == 0  # type: ignore[arg-type]

    def test_returns_at_least_one_for_non_empty(self):
        assert estimate_tokens("a") >= 1

    def test_approx_4_chars_per_token(self):
        # 100 chars → ~25 tokens
        assert estimate_tokens("a" * 100) == 25


class TestPHVHardCheck:
    def test_mid_phv_with_marker_passes(self):
        ctx = _ctx(phv_stage="mid_phv")
        result = validate_safety_sections(
            ctx,
            static_block="static",
            dynamic_block="DUAL-LOAD CONTEXT...\n\nPHV AWARENESS — ATHLETE IS MID-PHV...",
        )
        assert result.warnings == [] or all("PHV" not in w for w in result.warnings)

    def test_mid_phv_without_marker_throws(self):
        ctx = _ctx(phv_stage="mid_phv")
        with pytest.raises(SafetyValidationError) as exc:
            validate_safety_sections(
                ctx,
                static_block="static",
                dynamic_block="some content without the safety marker",
            )
        assert "PHV section missing" in str(exc.value)

    def test_circa_phv_without_marker_throws(self):
        ctx = _ctx(phv_stage="circa")
        with pytest.raises(SafetyValidationError):
            validate_safety_sections(
                ctx,
                static_block="static",
                dynamic_block="no marker here",
            )

    def test_post_phv_does_not_require_marker(self):
        ctx = _ctx(phv_stage="post_phv")
        # Should not throw — only mid_phv triggers the hard check.
        result = validate_safety_sections(
            ctx,
            static_block="static",
            dynamic_block="no PHV marker but athlete is post-PHV",
        )
        assert result is not None

    def test_unknown_phv_does_not_require_marker(self):
        ctx = _ctx(phv_stage=None)
        result = validate_safety_sections(
            ctx,
            static_block="static",
            dynamic_block="no marker, unknown stage",
        )
        assert result is not None


class TestTokenBudget:
    def test_within_budget_passes(self):
        ctx = _ctx()
        result = validate_safety_sections(
            ctx,
            static_block="a" * 4000,    # ~1000 tokens
            dynamic_block="b" * 8000,   # ~2000 tokens
            max_total_tokens=8000,
        )
        assert result.total_tokens <= 8000

    def test_over_budget_throws_with_rag_guidance(self):
        ctx = _ctx()
        with pytest.raises(SafetyValidationError) as exc:
            validate_safety_sections(
                ctx,
                static_block="a" * 16000,   # ~4000 tokens
                dynamic_block="b" * 20000,  # ~5000 tokens
                max_total_tokens=8000,
                rag_token_estimate=2000,
            )
        msg = str(exc.value)
        assert "exceeds budget" in msg
        assert "Truncate RAG" in msg


class TestSoftWarnings:
    def test_red_risk_without_marker_warns(self):
        ctx = _ctx(injury_risk_flag="RED")
        result = validate_safety_sections(
            ctx,
            static_block="static",
            dynamic_block="nothing about risk here",
        )
        assert any("RED" in w for w in result.warnings)

    def test_red_risk_with_marker_no_warning(self):
        ctx = _ctx(injury_risk_flag="RED")
        result = validate_safety_sections(
            ctx,
            static_block="static",
            dynamic_block="INJURY RISK protocol active for this athlete",
        )
        assert not any("RED" in w for w in result.warnings)

    def test_ccrs_without_section_warns(self):
        ctx = _ctx(ccrs=72.0)
        result = validate_safety_sections(
            ctx,
            static_block="static",
            dynamic_block="no readiness data here",
        )
        assert any("CCRS" in w or "ccrs" in w for w in result.warnings)

    def test_ccrs_with_section_no_warning(self):
        ctx = _ctx(ccrs=72.0)
        result = validate_safety_sections(
            ctx,
            static_block="static",
            dynamic_block="READINESS (internal reference — NEVER show these numbers): 72/100",
        )
        assert not any("CCRS" in w for w in result.warnings)

    def test_academic_stress_signal_without_dual_load_warns(self):
        ctx = _ctx(academic_stress=4.5)
        result = validate_safety_sections(
            ctx,
            static_block="static",
            dynamic_block="no dual load section",
        )
        assert any("DUAL-LOAD" in w or "dual-load" in w for w in result.warnings)

    def test_dual_load_index_present_with_block_no_warning(self):
        ctx = _ctx(dual_load_index=55.0)
        result = validate_safety_sections(
            ctx,
            static_block="static",
            dynamic_block="DUAL-LOAD CONTEXT: DLI: 55/100 (MODERATE)",
        )
        assert not any("DUAL-LOAD" in w for w in result.warnings)


class TestValidationResult:
    def test_returns_token_counts(self):
        ctx = _ctx()
        result = validate_safety_sections(
            ctx,
            static_block="a" * 100,
            dynamic_block="b" * 200,
        )
        assert result.static_tokens == 25
        assert result.dynamic_tokens == 50
        assert result.total_tokens == 75

    def test_no_warnings_when_clean(self):
        ctx = _ctx()
        result = validate_safety_sections(
            ctx,
            static_block="static",
            dynamic_block="dynamic with no triggers",
        )
        assert result.warnings == []
