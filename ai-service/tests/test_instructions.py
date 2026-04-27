"""Phase 3 — Methodology resolver tests.

Locks in three guarantees:
  1. The seed snapshot loads cleanly and contains identity, tone, and
     guardrail_phv directives — these are required by the cutover sites
     in prompt_builder.py and validate.py.
  2. The seed values match the pre-cutover hardcoded values verbatim
     (regression guard against drift in _seed_text.py).
  3. Scope filtering on the resolver works: tone (audience='athlete')
     does not leak into a coach-scoped resolution.
"""

from __future__ import annotations

import pytest

from app.instructions.resolver import resolve_sync
from app.instructions.seed import (
    SEED_BANNED_PATTERNS,
    SEED_BANNED_PHRASES,
    SEED_PHV_BLOCKED_PATTERNS,
    build_seed_snapshot,
)
from app.instructions._seed_text import (
    COACHING_IDENTITY_TEXT,
    PHV_SAFETY_WARNING_TEXT,
)


def test_seed_snapshot_loads():
    snap = build_seed_snapshot()
    assert snap.is_live is True
    # Phase 3 seeded 3 directives (identity, tone, guardrail_phv).
    # Phase 4 added memory_policy. Future phases may add more — assert the
    # known minimum.
    types = {d.directive_type.value for d in snap.directives}
    required = {"identity", "tone", "guardrail_phv", "memory_policy"}
    assert required <= types, f"Missing required seed types: {required - types}"
    assert snap.directive_count == len(snap.directives)


def test_seed_identity_is_verbatim_pre_cutover_text():
    snap = build_seed_snapshot()
    identity = next(d for d in snap.directives if d.directive_type.value == "identity")
    assert identity.payload["persona_description"] == COACHING_IDENTITY_TEXT


def test_seed_tone_phrases_match_pre_cutover_list():
    snap = build_seed_snapshot()
    tone = next(d for d in snap.directives if d.directive_type.value == "tone")
    assert tone.payload["banned_phrases"] == SEED_BANNED_PHRASES
    assert tone.payload["banned_patterns"] == SEED_BANNED_PATTERNS


def test_seed_phv_patterns_and_warning_match_pre_cutover():
    snap = build_seed_snapshot()
    phv = next(d for d in snap.directives if d.directive_type.value == "guardrail_phv")
    assert phv.payload["blocked_patterns"] == SEED_PHV_BLOCKED_PATTERNS
    assert phv.payload["safety_warning_template"] == PHV_SAFETY_WARNING_TEXT


def test_resolver_scope_filters_audience():
    # Tone directive in seed targets audience='athlete'; coach should not see it.
    coach_view = resolve_sync(audience="coach")
    assert coach_view.tone_rules() is None

    athlete_view = resolve_sync(audience="athlete")
    tone = athlete_view.tone_rules()
    assert tone is not None
    assert "great effort" in tone.banned_phrases


def test_resolver_phv_compiled_patterns_match_response():
    rs = resolve_sync(audience="athlete", age_band="U15", phv_stage="mid_phv")
    phv = rs.guardrail_phv()
    assert phv is not None
    # 11 patterns from seed
    assert len(phv.compiled_blocked_patterns) == 11
    # The classic case
    assert any(
        p.search("Try a barbell back squat at max effort") for p in phv.compiled_blocked_patterns
    )
    # Negative: a benign response should not match anything
    assert not any(
        p.search("Get some good sleep tonight and we'll go again tomorrow")
        for p in phv.compiled_blocked_patterns
    )


def test_resolver_identity_block_is_full_text():
    rs = resolve_sync(audience="athlete")
    block = rs.identity_block()
    assert "RULE #1 — WARMTH IN EVERY RESPONSE (NON-NEGOTIABLE)" in block
    # Spot-check the closing fragment
    assert "Recovery Session locked in for 8:00 PM" in block


# ── Phase 4 — new accessors and memory policy ──────────────────────────


def test_resolver_memory_policy_returns_extraction_template():
    rs = resolve_sync(audience="athlete", sport="football")
    mp = rs.memory_policy()
    assert mp is not None
    # Must contain the placeholders the consumer expects
    assert "{sport}" in mp.extraction_prompt_template
    assert "{athlete_context_line}" in mp.extraction_prompt_template
    assert "{conv_text}" in mp.extraction_prompt_template
    # And the seven canonical atom types
    assert set(mp.atom_types) >= {
        "current_goals",
        "unresolved_concerns",
        "injury_history",
        "behavioral_patterns",
        "coaching_preferences",
        "last_topics",
        "key_milestones",
    }
    assert mp.retention_days == 365


def test_memory_policy_template_formats_with_runtime_variables():
    rs = resolve_sync(audience="athlete")
    mp = rs.memory_policy()
    assert mp is not None
    # The consumer formats it like memory_service.py does. Must not raise
    # KeyError on the canonical placeholder set.
    rendered = mp.extraction_prompt_template.format(
        sport="football",
        athlete_context_line="Athlete: football wing, U17.",
        conv_text="USER: hello\nASSISTANT: hi",
    )
    assert "football" in rendered
    assert "Athlete: football wing, U17." in rendered
    assert "USER: hello" in rendered
    # JSON-schema portion preserved verbatim
    assert '"sessionSummary"' in rendered


def test_resolver_unset_accessors_return_none_until_pd_publishes():
    rs = resolve_sync(audience="athlete")
    # These are not in the seed — consumers should expect None until the
    # PD publishes them via CMS.
    assert rs.response_shape() is None
    assert rs.recommendation_policy() is None
    assert rs.rag_policy() is None
    assert rs.routing_classifier() is None
    assert rs.routing_intent("build_session") is None
    assert rs.all_routing_intents() == []
    # Phase 5: coach + parent accessors also empty until PD publishes.
    assert rs.surface_policy() is None
    assert rs.all_surface_policies() == []
    assert rs.escalation() is None
    assert rs.all_escalations() == []
    assert rs.coach_dashboard_policy() is None
    assert rs.parent_report_policy() is None


# ── Phase 5 — coach + parent audience scoping ──────────────────────────


def _patch_snapshot_with_coach_parent_directives(monkeypatch):
    """Helper: build a snapshot containing coach+parent directives and
    point the resolver's loader cache at it."""
    from datetime import datetime, timezone
    from uuid import uuid4

    from app.instructions import loader
    from app.instructions.seed import build_seed_snapshot
    from app.instructions.types import Directive, DirectiveSnapshot, DirectiveType

    snap = build_seed_snapshot()

    extra = [
        Directive(
            id=str(uuid4()),
            directive_type=DirectiveType.SURFACE_POLICY,
            audience="coach",
            payload={
                "audience": "coach",
                "what_to_show": ["readiness_summary", "ack_alerts"],
                "what_to_hide": ["raw_chat_logs"],
                "language_simplification_level": "none",
            },
            updated_at=datetime.now(timezone.utc),
        ),
        Directive(
            id=str(uuid4()),
            directive_type=DirectiveType.SURFACE_POLICY,
            audience="parent",
            payload={
                "audience": "parent",
                "what_to_show": ["weekly_summary"],
                "what_to_hide": ["mental_health_details"],
                "language_simplification_level": "mild",
            },
            updated_at=datetime.now(timezone.utc),
        ),
        Directive(
            id=str(uuid4()),
            directive_type=DirectiveType.ESCALATION,
            audience="coach",
            payload={
                "trigger_conditions": {"description": "3 nights poor sleep in a row"},
                "target_audience": "coach",
                "notification_template": "{athlete_name} flagged for sleep.",
                "urgency": "normal",
                "cooldown_hours": 24,
                "requires_athlete_consent": False,
            },
            updated_at=datetime.now(timezone.utc),
        ),
        Directive(
            id=str(uuid4()),
            directive_type=DirectiveType.ESCALATION,
            audience="parent",
            payload={
                "trigger_conditions": {"description": "athlete reports stress 4 weeks"},
                "target_audience": "parent",
                "notification_template": "Quick update on {athlete_name}.",
                "urgency": "low",
                "cooldown_hours": 168,
                "requires_athlete_consent": True,
            },
            updated_at=datetime.now(timezone.utc),
        ),
        Directive(
            id=str(uuid4()),
            directive_type=DirectiveType.COACH_DASHBOARD_POLICY,
            audience="coach",
            payload={
                "dashboard_widgets": ["roster_alerts", "load_distribution"],
                "alert_rules": {},
                "summary_template": "Top 3 athletes needing attention today.",
                "roster_sort_rules": {"by": "alert_count_desc"},
            },
            updated_at=datetime.now(timezone.utc),
        ),
        Directive(
            id=str(uuid4()),
            directive_type=DirectiveType.PARENT_REPORT_POLICY,
            audience="parent",
            payload={
                "report_frequency": "weekly",
                "report_template": "Hi {parent_name}.",
                "blocked_topics": ["mental_health_details"],
                "language_simplification_level": "mild",
                "consent_requirements": [],
            },
            updated_at=datetime.now(timezone.utc),
        ),
    ]
    patched = DirectiveSnapshot(
        id=snap.id,
        label="test-coach-parent",
        directives=list(snap.directives) + extra,
        directive_count=len(snap.directives) + len(extra),
        schema_version=snap.schema_version,
        is_live=True,
        published_at=snap.published_at,
    )
    monkeypatch.setattr(loader, "_CACHED", patched)
    monkeypatch.setattr(loader, "_CACHED_AT", 9999999999.0)


def test_resolver_coach_scope_picks_up_coach_directives(monkeypatch):
    _patch_snapshot_with_coach_parent_directives(monkeypatch)

    coach = resolve_sync(audience="coach")
    sp = coach.surface_policy()
    assert sp is not None and sp.audience == "coach"
    assert "readiness_summary" in sp.what_to_show

    cdp = coach.coach_dashboard_policy()
    assert cdp is not None
    assert "roster_alerts" in cdp.dashboard_widgets

    esc = coach.all_escalations()
    assert len(esc) == 1
    assert esc[0].target_audience == "coach"

    # Coach should NOT pick up the parent-only surface or report policy.
    assert coach.parent_report_policy() is None


def test_resolver_parent_scope_picks_up_parent_directives(monkeypatch):
    _patch_snapshot_with_coach_parent_directives(monkeypatch)

    parent = resolve_sync(audience="parent")
    sp = parent.surface_policy()
    assert sp is not None and sp.audience == "parent"
    assert "weekly_summary" in sp.what_to_show
    assert "mental_health_details" in sp.what_to_hide

    prp = parent.parent_report_policy()
    assert prp is not None
    assert prp.report_frequency == "weekly"

    esc = parent.all_escalations()
    assert len(esc) == 1
    assert esc[0].target_audience == "parent"
    assert esc[0].requires_athlete_consent is True

    # Parent should NOT see coach widgets.
    assert parent.coach_dashboard_policy() is None


def test_resolver_athlete_scope_does_not_leak_coach_or_parent_directives(monkeypatch):
    _patch_snapshot_with_coach_parent_directives(monkeypatch)

    athlete = resolve_sync(audience="athlete")
    # Athlete sees the seed identity + tone + phv + memory_policy, but no
    # coach/parent directives.
    assert athlete.coach_dashboard_policy() is None
    assert athlete.parent_report_policy() is None
    # surface_policy is audience-specific in our test data; athlete has none.
    assert athlete.surface_policy() is None
    assert athlete.all_escalations() == []
