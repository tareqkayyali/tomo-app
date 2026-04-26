"""
Tests for performance_layers.py — Phase 2: 4-layer gap model.

All tests are pure (zero I/O) — compute_layer_gaps and build_performance_layers_block
are deterministic functions of their inputs.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.agents.performance_layers import (
    LayerGapResult,
    LayerScore,
    _gap_label,
    build_performance_layers_block,
    compute_layer_gaps,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_se(**kwargs):
    """Build a SnapshotEnrichment-like mock with specified fields."""
    se = MagicMock()
    se.ccrs = kwargs.get("ccrs", None)
    se.recovery_score = kwargs.get("recovery_score", None)
    se.wellness_7day_avg = kwargs.get("wellness_7day_avg", None)
    se.training_monotony = kwargs.get("training_monotony", None)
    se.mastery_scores = kwargs.get("mastery_scores", {})
    se.plan_compliance_7d = kwargs.get("plan_compliance_7d", None)
    se.checkin_consistency_7d = kwargs.get("checkin_consistency_7d", None)
    se.coachability_index = kwargs.get("coachability_index", None)
    se.rec_action_rate_30d = kwargs.get("rec_action_rate_30d", None)
    se.sleep_quality = kwargs.get("sleep_quality", None)
    se.phv_stage = kwargs.get("phv_stage", None)
    return se


def _make_ctx(se=None, sport="football", position="midfielder", academic_load_score=3.0, phv_stage=None):
    ctx = MagicMock()
    ctx.sport = sport
    ctx.position = position
    ctx.academic_load_score = academic_load_score
    if se is None:
        se = _make_se(
            ccrs=72.0,
            recovery_score=68.0,
            wellness_7day_avg=7.0,
            training_monotony=1.3,
            mastery_scores={"passing": 75.0, "dribbling": 60.0},
            plan_compliance_7d=0.80,
            checkin_consistency_7d=0.85,
            coachability_index=65.0,
            rec_action_rate_30d=0.70,
            sleep_quality=7.5,
        )
        se.phv_stage = phv_stage
    ctx.snapshot_enrichment = se
    return ctx


# ── Unit: _gap_label ───────────────────────────────────────────────────────────

def test_gap_label_strength():
    assert _gap_label(80.0) == "strength"
    assert _gap_label(75.0) == "strength"


def test_gap_label_on_track():
    assert _gap_label(60.0) == "on_track"
    assert _gap_label(55.0) == "on_track"


def test_gap_label_developing():
    assert _gap_label(45.0) == "developing"
    assert _gap_label(35.0) == "developing"


def test_gap_label_gap():
    assert _gap_label(20.0) == "gap"
    assert _gap_label(0.0) == "gap"


# ── Unit: compute_layer_gaps — no data ────────────────────────────────────────

def test_returns_none_when_no_snapshot():
    ctx = MagicMock()
    ctx.snapshot_enrichment = None
    assert compute_layer_gaps(ctx) is None


def test_returns_none_when_all_metrics_missing():
    # academic_load_score on PlayerContext also feeds the mental layer,
    # so must be None too for truly empty context.
    ctx = _make_ctx(se=_make_se(), academic_load_score=None)
    result = compute_layer_gaps(ctx)
    assert result is None


# ── Unit: compute_layer_gaps — happy path ─────────────────────────────────────

def test_full_data_returns_result():
    ctx = _make_ctx()
    result = compute_layer_gaps(ctx)
    assert isinstance(result, LayerGapResult)
    assert len(result.layers) == 4


def test_layer_scores_in_range():
    ctx = _make_ctx()
    result = compute_layer_gaps(ctx)
    for ls in result.layers:
        assert 0.0 <= ls.score <= 100.0, f"{ls.layer} score {ls.score} out of range"


def test_layer_names_present():
    ctx = _make_ctx()
    result = compute_layer_gaps(ctx)
    names = {ls.layer for ls in result.layers}
    assert names == {"physical", "technical", "tactical", "mental"}


def test_physical_layer_anchored_by_ccrs():
    """CCRS 90 should produce a high physical score."""
    se = _make_se(ccrs=90.0, recovery_score=85.0, wellness_7day_avg=8.0)
    ctx = _make_ctx(se=se)
    result = compute_layer_gaps(ctx)
    phys = next(ls for ls in result.layers if ls.layer == "physical")
    assert phys.score >= 70.0
    assert phys.gap_label in ("strength", "on_track")


def test_physical_layer_low_ccrs_produces_gap():
    """CCRS 30, poor recovery → gap or developing."""
    se = _make_se(ccrs=30.0, recovery_score=25.0, wellness_7day_avg=4.0)
    ctx = _make_ctx(se=se)
    result = compute_layer_gaps(ctx)
    phys = next(ls for ls in result.layers if ls.layer == "physical")
    assert phys.gap_label in ("gap", "developing")


def test_technical_layer_from_mastery():
    """High mastery scores → strong technical layer."""
    se = _make_se(
        mastery_scores={"passing": 90.0, "shooting": 88.0},
        plan_compliance_7d=0.95,
        checkin_consistency_7d=0.90,
    )
    ctx = _make_ctx(se=se)
    result = compute_layer_gaps(ctx)
    tech = next(ls for ls in result.layers if ls.layer == "technical")
    assert tech.score >= 75.0
    assert tech.gap_label == "strength"


def test_tactical_layer_from_coachability():
    """High coachability + rec adoption → strong tactical layer."""
    se = _make_se(coachability_index=88.0, rec_action_rate_30d=0.90)
    ctx = _make_ctx(se=se)
    result = compute_layer_gaps(ctx)
    tact = next(ls for ls in result.layers if ls.layer == "tactical")
    assert tact.score >= 75.0


def test_mental_layer_high_academic_load_lowers_score():
    """Academic load 9/10 should push mental score down significantly."""
    se = _make_se(wellness_7day_avg=6.0, sleep_quality=6.0)
    ctx = _make_ctx(se=se, academic_load_score=9.0)
    result = compute_layer_gaps(ctx)
    mental = next(ls for ls in result.layers if ls.layer == "mental")

    # Compare with zero academic load
    ctx_low = _make_ctx(se=se, academic_load_score=0.0)
    result_low = compute_layer_gaps(ctx_low)
    mental_low = next(ls for ls in result_low.layers if ls.layer == "mental")

    assert mental.score < mental_low.score


# ── Unit: PHV adjustment ───────────────────────────────────────────────────────

def test_mid_phv_bonus_applied_to_physical():
    """mid_phv athlete should get +8 on physical score."""
    se_base = _make_se(ccrs=50.0, recovery_score=48.0, wellness_7day_avg=5.5)
    se_phv = _make_se(ccrs=50.0, recovery_score=48.0, wellness_7day_avg=5.5)
    se_phv.phv_stage = "mid_phv"
    se_base.phv_stage = None

    ctx_base = _make_ctx(se=se_base)
    ctx_phv = _make_ctx(se=se_phv)
    ctx_phv.snapshot_enrichment = se_phv

    result_base = compute_layer_gaps(ctx_base)
    result_phv = compute_layer_gaps(ctx_phv)

    phys_base = next(ls for ls in result_base.layers if ls.layer == "physical")
    phys_phv = next(ls for ls in result_phv.layers if ls.layer == "physical")

    assert phys_phv.score > phys_base.score


def test_circa_phv_triggers_bonus():
    """'circa' phv_stage should also apply the bonus."""
    se = _make_se(ccrs=55.0)
    se.phv_stage = "circa"
    ctx = _make_ctx(se=se)
    ctx.snapshot_enrichment = se

    result = compute_layer_gaps(ctx)
    phys = next(ls for ls in result.layers if ls.layer == "physical")
    assert phys.score >= 55.0 + 8.0 - 0.1  # tolerance for weighted avg


# ── Unit: position priorities ──────────────────────────────────────────────────

def test_goalkeeper_has_high_tactical_priority():
    ctx = _make_ctx(position="goalkeeper", sport="football")
    result = compute_layer_gaps(ctx)
    tact = next(ls for ls in result.layers if ls.layer == "tactical")
    assert tact.priority == 5


def test_striker_has_high_physical_priority():
    ctx = _make_ctx(position="striker", sport="football")
    result = compute_layer_gaps(ctx)
    phys = next(ls for ls in result.layers if ls.layer == "physical")
    assert phys.priority == 5


def test_unknown_position_uses_default_priorities():
    ctx = _make_ctx(position="utility", sport="football")
    result = compute_layer_gaps(ctx)
    # All layers should exist; no crash on unknown position
    assert len(result.layers) > 0


def test_no_position_uses_default_priorities():
    ctx = _make_ctx(position=None)
    result = compute_layer_gaps(ctx)
    assert result is not None


# ── Unit: primary gap + strength ──────────────────────────────────────────────

def test_primary_gap_is_worst_weighted_layer():
    se = _make_se(
        ccrs=85.0, recovery_score=80.0,  # strong physical
        mastery_scores={"passing": 90.0}, plan_compliance_7d=0.90,  # strong technical
        coachability_index=20.0, rec_action_rate_30d=0.10,  # weak tactical
        wellness_7day_avg=8.0, sleep_quality=8.5,  # strong mental
    )
    ctx = _make_ctx(se=se, position="midfielder")
    result = compute_layer_gaps(ctx)
    # Tactical is clearly the weakest — should dominate the gap calculation given priority=5
    assert result.primary_gap == "tactical"


def test_primary_gap_not_set_when_all_strengths():
    se = _make_se(
        ccrs=90.0, recovery_score=88.0, wellness_7day_avg=9.0,
        mastery_scores={"passing": 90.0}, plan_compliance_7d=0.95,
        coachability_index=88.0, rec_action_rate_30d=0.90,
        sleep_quality=9.0,
    )
    ctx = _make_ctx(se=se)
    result = compute_layer_gaps(ctx)
    # All "strength" labels → primary_gap should be None
    assert result.primary_gap is None


# ── Unit: build_performance_layers_block ──────────────────────────────────────

def test_block_returns_empty_string_when_no_data():
    # Must null out academic_load_score too — it feeds the mental layer
    ctx = _make_ctx(se=_make_se(), academic_load_score=None)
    block = build_performance_layers_block(ctx)
    assert block == ""


def test_block_contains_layer_names():
    ctx = _make_ctx()
    block = build_performance_layers_block(ctx)
    assert "Physical" in block
    assert "Technical" in block
    assert "Tactical" in block
    assert "Mental" in block


def test_block_contains_position_and_sport():
    ctx = _make_ctx(position="striker", sport="football")
    block = build_performance_layers_block(ctx)
    assert "striker" in block.lower() or "Striker" in block
    assert "Football" in block or "football" in block


def test_block_contains_priority_labels():
    ctx = _make_ctx(position="midfielder", sport="football")
    block = build_performance_layers_block(ctx)
    assert "HIGH" in block or "VERY HIGH" in block


def test_block_contains_coaching_note_for_high_priority_gap():
    """A high-priority layer gap should trigger a coaching note."""
    se = _make_se(
        ccrs=80.0, recovery_score=75.0,  # physical OK
        mastery_scores={"passing": 85.0}, plan_compliance_7d=0.85,  # technical OK
        coachability_index=28.0, rec_action_rate_30d=0.20,  # tactical gap (priority 5 for midfielder)
        wellness_7day_avg=8.0, sleep_quality=8.0,
    )
    ctx = _make_ctx(se=se, position="midfielder")
    block = build_performance_layers_block(ctx)
    assert "→" in block  # coaching note present


def test_block_does_not_contain_phv_string():
    """PHV must never appear in athlete-facing output (post-generation filter contract)."""
    se = _make_se(ccrs=60.0)
    se.phv_stage = "mid_phv"
    ctx = _make_ctx(se=se)
    ctx.snapshot_enrichment = se
    block = build_performance_layers_block(ctx)
    assert "PHV" not in block
    assert "peak height velocity" not in block.lower()


def test_block_sports_non_football():
    """Basketball point guard should produce valid block."""
    ctx = _make_ctx(position="point guard", sport="basketball")
    block = build_performance_layers_block(ctx)
    assert "Physical" in block


def test_block_partial_data_still_renders():
    """Only physical data available — should still render physical layer."""
    se = _make_se(ccrs=65.0, recovery_score=60.0)  # no mastery/coachability/wellness
    ctx = _make_ctx(se=se)
    block = build_performance_layers_block(ctx)
    assert "Physical" in block
    # Technical/Tactical/Mental should be absent (no data)
    assert "Technical" not in block
    assert "Tactical" not in block
