"""
Methodology Directive Types — Phase 0

Pydantic schemas mirroring backend/lib/validation/admin/directiveSchemas.ts.
Used by the runtime resolver to validate snapshot payloads loaded from
methodology_publish_snapshots and to expose typed accessors at the AI
service injection points.

Parity with the TypeScript schemas is enforced by a CI test that compares
this module's DIRECTIVE_PAYLOAD_FIELDS against the parsed Zod schemas.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ─── Enums ───────────────────────────────────────────────────────────────


class DirectiveType(str, Enum):
    # Identity & Voice
    IDENTITY = "identity"
    TONE = "tone"
    RESPONSE_SHAPE = "response_shape"
    # Safety & Guardrails
    GUARDRAIL_PHV = "guardrail_phv"
    GUARDRAIL_AGE = "guardrail_age"
    GUARDRAIL_LOAD = "guardrail_load"
    SAFETY_GATE = "safety_gate"
    # Decision Logic
    THRESHOLD = "threshold"
    PERFORMANCE_MODEL = "performance_model"
    MODE_DEFINITION = "mode_definition"
    PLANNING_POLICY = "planning_policy"
    SCHEDULING_POLICY = "scheduling_policy"
    # Routing & Recommendations
    ROUTING_INTENT = "routing_intent"
    ROUTING_CLASSIFIER = "routing_classifier"
    RECOMMENDATION_POLICY = "recommendation_policy"
    RAG_POLICY = "rag_policy"
    MEMORY_POLICY = "memory_policy"
    # Surface & Cross-Audience
    SURFACE_POLICY = "surface_policy"
    ESCALATION = "escalation"
    COACH_DASHBOARD_POLICY = "coach_dashboard_policy"
    PARENT_REPORT_POLICY = "parent_report_policy"
    # Meta
    META_PARSER = "meta_parser"
    META_CONFLICT = "meta_conflict"
    # Phase 7: Dashboard + Programs governance
    DASHBOARD_SECTION = "dashboard_section"
    SIGNAL_DEFINITION = "signal_definition"
    PROGRAM_RULE = "program_rule"
    # Phase 8: Bucketed verticals
    SLEEP_POLICY = "sleep_policy"
    NUTRITION_POLICY = "nutrition_policy"
    WELLBEING_POLICY = "wellbeing_policy"
    INJURY_POLICY = "injury_policy"
    CAREER_POLICY = "career_policy"


Audience = Literal["athlete", "coach", "parent", "all"]
DirectiveStatus = Literal["proposed", "approved", "published", "retired"]
AgeBand = Literal["U13", "U15", "U17", "U19", "U21", "senior", "unknown"]
PhvStage = Literal["pre_phv", "mid_phv", "post_phv", "unknown"]
IntensityLevel = Literal["rest", "light", "moderate", "full"]
LlmTier = Literal["haiku", "sonnet", "opus"]
ResponsePattern = Literal[
    "capsule_direct", "data_display", "multi_step", "write_action", "open_coaching"
]
Urgency = Literal["low", "normal", "high", "critical"]


class ZoneBoundaries(BaseModel):
    model_config = ConfigDict(extra="forbid")
    green: Optional[Tuple[float, float]] = None
    yellow: Optional[Tuple[float, float]] = None
    red: Optional[Tuple[float, float]] = None


# ─── Per-directive payload models ────────────────────────────────────────
#
# Field names and required/optional shapes must stay aligned with
# backend/lib/validation/admin/directiveSchemas.ts. See parity test.


class IdentityPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    persona_name: str = Field(min_length=1, max_length=60)
    persona_description: str = Field(min_length=1, max_length=20000)
    voice_attributes: List[str] = Field(default_factory=list, max_length=20)
    pronouns: Optional[str] = Field(default=None, max_length=20)
    emoji_policy: Literal["none", "sparing", "moderate", "frequent"] = "sparing"
    cultural_register: Optional[str] = Field(default=None, max_length=120)


class TonePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    banned_phrases: List[str] = Field(default_factory=list)
    banned_patterns: List[str] = Field(default_factory=list)
    required_companion_clauses: Dict[str, str] = Field(default_factory=dict)
    age_specific_jargon_rules: Optional[Dict[str, List[str]]] = None
    clinical_language_rules: List[str] = Field(default_factory=list)
    acronym_scaffolding_rules: List[str] = Field(default_factory=list)


class ResponseShapePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    max_length_by_intent: Dict[str, int] = Field(default_factory=dict)
    structure_template: Optional[str] = None
    opening_pattern: Optional[str] = None
    closing_pattern: Optional[str] = None
    bullet_policy: Literal["avoid", "allow", "prefer"] = "allow"
    emoji_density: Literal["none", "low", "medium", "high"] = "low"
    card_vs_text_rules: Dict[str, Literal["card", "text", "mixed"]] = Field(default_factory=dict)
    chip_suggestions: Dict[str, List[str]] = Field(default_factory=dict)


class _PhvStageRule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    blocked_exercises: List[str] = Field(default_factory=list)
    intensity_cap: Optional[IntensityLevel] = None
    load_multiplier: Optional[float] = Field(default=None, ge=0, le=1)


class GuardrailPhvPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    blocked_exercises: List[str] = Field(default_factory=list)
    # Regex source strings — patterns the runtime matches against responses.
    blocked_patterns: List[str] = Field(default_factory=list)
    phv_stage_rules: Dict[str, _PhvStageRule] = Field(default_factory=dict)
    advisory_or_blocking: Literal["advisory", "blocking"] = "advisory"
    safe_alternatives: Dict[str, List[str]] = Field(default_factory=dict)
    # Plain-text message prepended to the response when the gate fires.
    safety_warning_template: str = ""
    unknown_age_default: Literal["conservative", "permissive"] = "conservative"


class _AgeLoadCaps(BaseModel):
    model_config = ConfigDict(extra="forbid")
    max_minutes_per_session: Optional[int] = Field(default=None, gt=0)
    max_sessions_per_week: Optional[int] = Field(default=None, gt=0)


class _AgeBandOverride(BaseModel):
    model_config = ConfigDict(extra="forbid")
    blocked_exercises: List[str] = Field(default_factory=list)
    load_caps: Optional[_AgeLoadCaps] = None
    intensity_cap: Optional[IntensityLevel] = None
    language_simplification_level: Optional[Literal["none", "mild", "strong"]] = None


class GuardrailAgePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    age_band_overrides: Dict[str, _AgeBandOverride] = Field(default_factory=dict)


class _DualLoadThresholds(BaseModel):
    model_config = ConfigDict(extra="forbid")
    high_academic_load_score: Optional[float] = None
    reduce_training_when: Optional[str] = None


class GuardrailLoadPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    acwr_zones: Optional[ZoneBoundaries] = None
    dual_load_thresholds: Optional[_DualLoadThresholds] = None
    consecutive_hard_day_limit: Optional[int] = Field(default=None, gt=0)
    weekly_load_cap: Optional[float] = Field(default=None, gt=0)
    recovery_gap_hours: Optional[int] = Field(default=None, ge=0)


class SafetyGatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    trigger_condition: str = Field(min_length=1, max_length=1000)
    block_action: Literal["refuse", "redirect_to_coach", "require_override"]
    override_role: Literal["none", "coach", "institutional_pd", "super_admin"] = "none"
    user_facing_reason_template: str = Field(min_length=1, max_length=2000)


class ThresholdPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric_name: str = Field(min_length=1, max_length=100)
    zone_boundaries: ZoneBoundaries
    age_band_adjustments: Optional[Dict[str, float]] = None
    phv_adjustments: Optional[Dict[str, float]] = None
    sport_adjustments: Optional[Dict[str, float]] = None
    position_adjustments: Optional[Dict[str, float]] = None


class _PerformanceLayer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    anchor_metrics: List[str] = Field(default_factory=list)


class _GapThresholds(BaseModel):
    model_config = ConfigDict(extra="forbid")
    strength: float
    on_track: float
    developing: float
    gap: float


class PerformanceModelPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    layers: List[_PerformanceLayer] = Field(min_length=1)
    per_position_priorities: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    gap_thresholds: _GapThresholds
    phv_adjustment_rules: Optional[Dict[str, float]] = None


class _ModeDurationCaps(BaseModel):
    model_config = ConfigDict(extra="forbid")
    max_minutes_per_session: Optional[int] = Field(default=None, gt=0)
    max_sessions_per_week: Optional[int] = Field(default=None, gt=0)


class ModeDefinitionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode_name: str = Field(min_length=1, max_length=60)
    activation_conditions: Dict[str, Any] = Field(default_factory=dict)
    load_multipliers: Optional[float] = Field(default=None, ge=0, le=2)
    intensity_caps: Optional[IntensityLevel] = None
    duration_caps: Optional[_ModeDurationCaps] = None
    recommended_categories: List[str] = Field(default_factory=list)
    blocked_categories: List[str] = Field(default_factory=list)


class _PhaseDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    weeks: Optional[int] = Field(default=None, gt=0)
    focus: Optional[str] = None


class PlanningPolicyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phase_definitions: List[_PhaseDefinition]
    transition_rules: Dict[str, Any] = Field(default_factory=dict)
    taper_rules: Dict[str, Any] = Field(default_factory=dict)
    peak_rules: Dict[str, Any] = Field(default_factory=dict)
    competition_proximity_rules: Dict[str, Any] = Field(default_factory=dict)


class SchedulingPolicyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    max_sessions_per_week: Optional[int] = Field(default=None, gt=0)
    recovery_gap_hours: Optional[int] = Field(default=None, ge=0)
    exam_window_overrides: Dict[str, Any] = Field(default_factory=dict)
    school_day_constraints: Dict[str, Any] = Field(default_factory=dict)
    cognitive_window_rules: Dict[str, Any] = Field(default_factory=dict)


class RoutingIntentPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    intent_id: str = Field(min_length=1, max_length=80)
    response_pattern: ResponsePattern
    capsule_type: Optional[str] = Field(default=None, max_length=80)
    tool_chain: List[str] = Field(default_factory=list)
    agent_role: Optional[str] = Field(default=None, max_length=80)
    llm_tier: Optional[LlmTier] = None
    priority: Optional[int] = None
    multi_step_definition: Optional[Dict[str, Any]] = None


class RoutingClassifierPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    classifier_version: Literal["haiku_v1", "sonnet_v1"] = "sonnet_v1"
    intent_examples: Dict[str, List[str]] = Field(default_factory=dict)
    fallback_intent: str = Field(default="open_coaching", max_length=80)
    agent_lock_rules: Dict[str, Any] = Field(default_factory=dict)
    smalltalk_routing: Dict[str, Any] = Field(default_factory=dict)
    confidence_threshold: float = Field(default=0.6, ge=0, le=1)


class RecommendationPolicyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope_conditions: Dict[str, Any] = Field(default_factory=dict)
    blocked_categories: List[str] = Field(default_factory=list)
    mandatory_categories: List[str] = Field(default_factory=list)
    priority_override: Optional[Literal["P0", "P1", "P2", "P3"]] = None
    max_recs_per_turn: Optional[int] = Field(default=None, gt=0)
    forced_inclusions: Dict[str, Any] = Field(default_factory=dict)


class RagPolicyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    forced_domains: List[str] = Field(default_factory=list)
    blocked_domains: List[str] = Field(default_factory=list)
    chunk_count: int = Field(default=5, gt=0, le=50)
    sport_filter: List[str] = Field(default_factory=list)
    age_filter: List[str] = Field(default_factory=list)
    phv_filter: List[str] = Field(default_factory=list)
    min_similarity: float = Field(default=0.7, ge=0, le=1)


class _MemoryExtractionTrigger(BaseModel):
    model_config = ConfigDict(extra="forbid")
    on_turn_count: Optional[int] = Field(default=None, gt=0)
    on_signal: List[str] = Field(default_factory=list)


_MEMORY_DEFAULT_ATOMS = [
    "current_goals",
    "unresolved_concerns",
    "injury_history",
    "behavioral_patterns",
    "coaching_preferences",
    "last_topics",
    "key_milestones",
]


class MemoryPolicyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    extraction_prompt_template: str = Field(min_length=10, max_length=8000)
    atom_types: List[str] = Field(default_factory=lambda: list(_MEMORY_DEFAULT_ATOMS))
    truncation_tokens: int = Field(default=500, gt=0, le=4000)
    dedup_strategy: Literal["naive", "embedding", "llm_judge"] = "embedding"
    retention_days: int = Field(default=365, gt=0)
    sport_aware_rules: Dict[str, Any] = Field(default_factory=dict)
    extraction_trigger: _MemoryExtractionTrigger = Field(default_factory=_MemoryExtractionTrigger)


class SurfacePolicyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    audience: Literal["athlete", "coach", "parent"]
    what_to_show: List[str] = Field(default_factory=list)
    what_to_hide: List[str] = Field(default_factory=list)
    tone_override_id: Optional[str] = None
    format_override_id: Optional[str] = None
    language_simplification_level: Literal["none", "mild", "strong"] = "none"
    terminology_translations: Dict[str, str] = Field(default_factory=dict)


class EscalationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    trigger_conditions: Dict[str, Any]
    target_audience: Literal["coach", "parent", "both"]
    notification_template: str = Field(min_length=1, max_length=2000)
    urgency: Urgency = "normal"
    cooldown_hours: int = Field(default=24, ge=0)
    requires_athlete_consent: bool = False


class CoachDashboardPolicyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dashboard_widgets: List[str] = Field(default_factory=list)
    alert_rules: Dict[str, Any] = Field(default_factory=dict)
    summary_template: Optional[str] = Field(default=None, max_length=4000)
    roster_sort_rules: Dict[str, Any] = Field(default_factory=dict)


class ParentReportPolicyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    report_frequency: Literal["daily", "weekly", "biweekly", "monthly", "event_only"] = "weekly"
    report_template: str = Field(min_length=10, max_length=8000)
    blocked_topics: List[str] = Field(default_factory=list)
    language_simplification_level: Literal["none", "mild", "strong"] = "mild"
    consent_requirements: List[str] = Field(default_factory=list)


class MetaParserPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    extraction_prompt: str = Field(min_length=50)
    extraction_schema_version: int = Field(default=1, gt=0)
    extraction_model: str = "claude-sonnet-4-6"
    chunking_strategy: Literal["paragraph", "section", "fixed_tokens"] = "section"
    confidence_threshold_for_auto_propose: float = Field(default=0.5, ge=0, le=1)


_DEFAULT_MERGE_RULES: Dict[str, str] = {
    "load_multiplier": "MIN",
    "intensity_cap": "MOST_RESTRICTIVE",
    "arrays": "UNION",
}
_DEFAULT_TIEBREAKERS: List[str] = ["priority", "audience_specificity", "updated_at"]


class MetaConflictPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    merge_rules_per_type: Dict[str, str] = Field(default_factory=lambda: dict(_DEFAULT_MERGE_RULES))
    priority_tiebreakers: List[
        Literal["priority", "audience_specificity", "updated_at"]
    ] = Field(default_factory=lambda: list(_DEFAULT_TIEBREAKERS))
    audience_inheritance_rules: Dict[str, Any] = Field(default_factory=dict)


# ─── Phase 7: Dashboard + Programs governance ────────────────────────────


DashboardComponentType = Literal[
    "signal_hero", "status_ring", "kpi_row", "sparkline_row",
    "dual_load", "benchmark", "rec_list", "event_list",
    "growth_card", "engagement_bar", "protocol_banner", "custom_card",
]
DashboardPanelKey = Literal["main", "program", "metrics", "progress"]


class DashboardSectionPayload(BaseModel):
    """Section that the athlete sees on the Dashboard / a sub-panel."""

    model_config = ConfigDict(extra="forbid")

    section_key: str = Field(min_length=1, max_length=80)
    display_name: str = Field(min_length=1, max_length=120)
    component_type: DashboardComponentType
    panel_key: DashboardPanelKey = "main"
    sort_order: int = 100
    metric_key: Optional[str] = Field(default=None, max_length=80)
    coaching_text_template: Optional[str] = Field(default=None, max_length=2000)
    config: Dict[str, Any] = Field(default_factory=dict)
    is_enabled: bool = True


class _SignalConditionItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field: str = Field(min_length=1)
    operator: Literal["eq", "neq", "in", "not_in", "gt", "gte", "lt", "lte"]
    value: Any = None


class _SignalConditions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    match: Literal["all", "any"] = "all"
    conditions: List[_SignalConditionItem] = Field(default_factory=list)


class _SignalPillConfigItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field: str = Field(max_length=60)
    format: Optional[str] = Field(default=None, max_length=40)
    label: Optional[str] = Field(default=None, max_length=60)


class _SignalTriggerConfigItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric: str = Field(max_length=60)
    baseline_field: Optional[str] = Field(default=None, max_length=60)
    format: Optional[str] = Field(default=None, max_length=40)


class SignalDefinitionPayload(BaseModel):
    """Hero-layer signal block on the dashboard (the colored alert)."""

    model_config = ConfigDict(extra="forbid")

    signal_key: str = Field(min_length=1, max_length=60)
    display_name: str = Field(min_length=1, max_length=120)
    subtitle: Optional[str] = Field(default=None, max_length=240)
    conditions: _SignalConditions = Field(default_factory=_SignalConditions)
    color: Optional[str] = Field(default=None, max_length=32)
    hero_background: Optional[str] = Field(default=None, max_length=80)
    arc_opacity: Optional[float] = Field(default=None, ge=0, le=1)
    pill_background: Optional[str] = Field(default=None, max_length=80)
    bar_rgba: Optional[str] = Field(default=None, max_length=80)
    coaching_color: Optional[str] = Field(default=None, max_length=32)
    coaching_text_template: Optional[str] = Field(default=None, max_length=2000)
    pill_config: List[_SignalPillConfigItem] = Field(default_factory=list)
    trigger_config: List[_SignalTriggerConfigItem] = Field(default_factory=list)
    adapted_plan_name: Optional[str] = Field(default=None, max_length=120)
    adapted_plan_meta: Optional[Dict[str, Any]] = None
    show_urgency_badge: bool = False
    urgency_label: Optional[str] = Field(default=None, max_length=40)
    is_enabled: bool = True


ProgramRuleCategory = Literal[
    "safety", "development", "recovery", "performance",
    "injury_prevention", "position_specific", "load_management",
]


class ProgramRulePayload(BaseModel):
    """Program-recommendation rule. Replaces pd_program_rules at runtime."""

    model_config = ConfigDict(extra="forbid")

    rule_name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: ProgramRuleCategory = "development"
    conditions: _SignalConditions = Field(default_factory=_SignalConditions)
    mandatory_programs: List[str] = Field(default_factory=list)
    blocked_programs: List[str] = Field(default_factory=list)
    high_priority_programs: List[str] = Field(default_factory=list)
    prioritize_categories: List[str] = Field(default_factory=list)
    block_categories: List[str] = Field(default_factory=list)
    load_multiplier: Optional[float] = Field(default=None, ge=0, le=2)
    session_cap_minutes: Optional[int] = Field(default=None, gt=0)
    frequency_cap: Optional[int] = Field(default=None, gt=0)
    intensity_cap: Optional[IntensityLevel] = None
    ai_guidance_text: Optional[str] = Field(default=None, max_length=2000)
    safety_critical: bool = False
    evidence_source: Optional[str] = Field(default=None, max_length=240)
    evidence_grade: Optional[Literal["A", "B", "C"]] = None
    is_enabled: bool = True


# ─── Phase 8: Bucketed verticals ────────────────────────────────────────
#
# Five additive guidance types — sleep / nutrition / wellbeing / injury /
# career. They share a common envelope (name, description, hard_stops,
# applies_when, ai_overridable, evidence_*). Mirrors guidanceCommonFields
# in backend/lib/validation/admin/directiveSchemas.ts.


class _GuidanceCommonFields(BaseModel):
    """Shared fields for the Phase 8 bucketed-vertical guidance types."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=8000)
    notes: Optional[str] = Field(default=None, max_length=4000)
    hard_stops: List[str] = Field(default_factory=list)
    applies_when: List[str] = Field(default_factory=list)
    ai_overridable: bool = True
    evidence_source: Optional[str] = Field(default=None, max_length=240)
    evidence_grade: Optional[Literal["A", "B", "C"]] = None
    extras: Dict[str, Any] = Field(default_factory=dict)


class SleepPolicyPayload(_GuidanceCommonFields):
    recommended_sleep_hours: Optional[Tuple[float, float]] = None
    bedtime_window_local: Optional[Tuple[str, str]] = None
    pre_match_sleep_min_hours: Optional[float] = None
    blue_light_cutoff_minutes_before_bed: Optional[int] = None


class NutritionPolicyPayload(_GuidanceCommonFields):
    blocked_categories: List[str] = Field(default_factory=list)
    recommended_categories: List[str] = Field(default_factory=list)
    pre_session_window_minutes: Optional[int] = None
    post_session_window_minutes: Optional[int] = None
    hydration_ml_per_hour: Optional[int] = None
    dietary_patterns: List[str] = Field(default_factory=list)


class WellbeingPolicyPayload(_GuidanceCommonFields):
    triggers: List[str] = Field(default_factory=list)
    response_actions: List[str] = Field(default_factory=list)
    blocked_topics: List[str] = Field(default_factory=list)
    reflection_prompts: List[str] = Field(default_factory=list)


class InjuryPolicyPayload(_GuidanceCommonFields):
    injury_categories: List[str] = Field(default_factory=list)
    rtp_stages: List[str] = Field(default_factory=list)
    blocked_categories_while_injured: List[str] = Field(default_factory=list)
    requires_clinician_signoff: bool = False
    min_days_per_stage: Optional[int] = None


class CareerPolicyPayload(_GuidanceCommonFields):
    guidance_topics: List[str] = Field(default_factory=list)
    visibility_recommendations: List[str] = Field(default_factory=list)
    defer_to_advisor_when: List[str] = Field(default_factory=list)


# ─── Type registry ───────────────────────────────────────────────────────


DIRECTIVE_PAYLOAD_MODELS: Dict[DirectiveType, type[BaseModel]] = {
    DirectiveType.IDENTITY: IdentityPayload,
    DirectiveType.TONE: TonePayload,
    DirectiveType.RESPONSE_SHAPE: ResponseShapePayload,
    DirectiveType.GUARDRAIL_PHV: GuardrailPhvPayload,
    DirectiveType.GUARDRAIL_AGE: GuardrailAgePayload,
    DirectiveType.GUARDRAIL_LOAD: GuardrailLoadPayload,
    DirectiveType.SAFETY_GATE: SafetyGatePayload,
    DirectiveType.THRESHOLD: ThresholdPayload,
    DirectiveType.PERFORMANCE_MODEL: PerformanceModelPayload,
    DirectiveType.MODE_DEFINITION: ModeDefinitionPayload,
    DirectiveType.PLANNING_POLICY: PlanningPolicyPayload,
    DirectiveType.SCHEDULING_POLICY: SchedulingPolicyPayload,
    DirectiveType.ROUTING_INTENT: RoutingIntentPayload,
    DirectiveType.ROUTING_CLASSIFIER: RoutingClassifierPayload,
    DirectiveType.RECOMMENDATION_POLICY: RecommendationPolicyPayload,
    DirectiveType.RAG_POLICY: RagPolicyPayload,
    DirectiveType.MEMORY_POLICY: MemoryPolicyPayload,
    DirectiveType.SURFACE_POLICY: SurfacePolicyPayload,
    DirectiveType.ESCALATION: EscalationPayload,
    DirectiveType.COACH_DASHBOARD_POLICY: CoachDashboardPolicyPayload,
    DirectiveType.PARENT_REPORT_POLICY: ParentReportPolicyPayload,
    DirectiveType.META_PARSER: MetaParserPayload,
    DirectiveType.META_CONFLICT: MetaConflictPayload,
    # Phase 7
    DirectiveType.DASHBOARD_SECTION: DashboardSectionPayload,
    DirectiveType.SIGNAL_DEFINITION: SignalDefinitionPayload,
    DirectiveType.PROGRAM_RULE: ProgramRulePayload,
    # Phase 8
    DirectiveType.SLEEP_POLICY: SleepPolicyPayload,
    DirectiveType.NUTRITION_POLICY: NutritionPolicyPayload,
    DirectiveType.WELLBEING_POLICY: WellbeingPolicyPayload,
    DirectiveType.INJURY_POLICY: InjuryPolicyPayload,
    DirectiveType.CAREER_POLICY: CareerPolicyPayload,
}


# Field-name index used by the CI parity test against directiveSchemas.ts.
DIRECTIVE_PAYLOAD_FIELDS: Dict[str, List[str]] = {
    dt.value: sorted(model.model_fields.keys())
    for dt, model in DIRECTIVE_PAYLOAD_MODELS.items()
}


# ─── Common envelope (matches DB row shape) ──────────────────────────────


class Directive(BaseModel):
    """A single resolved directive as it appears inside a publish snapshot."""

    model_config = ConfigDict(extra="forbid")

    id: str
    document_id: Optional[str] = None
    directive_type: DirectiveType
    audience: Audience = "all"
    sport_scope: List[str] = Field(default_factory=list)
    age_scope: List[str] = Field(default_factory=list)
    phv_scope: List[str] = Field(default_factory=list)
    position_scope: List[str] = Field(default_factory=list)
    mode_scope: List[str] = Field(default_factory=list)
    priority: int = 100
    payload: Dict[str, Any]
    source_excerpt: Optional[str] = None
    confidence: Optional[float] = None
    status: DirectiveStatus = "published"
    schema_version: int = 1
    updated_at: Optional[datetime] = None

    @field_validator("payload")
    @classmethod
    def _validate_payload(cls, v: Dict[str, Any], info: Any) -> Dict[str, Any]:
        directive_type: Optional[DirectiveType] = info.data.get("directive_type")
        if directive_type is None:
            return v
        model = DIRECTIVE_PAYLOAD_MODELS[directive_type]
        # Validate but return the raw dict so callers can index by name.
        model.model_validate(v)
        return v

    def typed_payload(self) -> BaseModel:
        """Return the strongly-typed Pydantic model for this directive's payload."""
        return DIRECTIVE_PAYLOAD_MODELS[self.directive_type].model_validate(self.payload)


class DirectiveSnapshot(BaseModel):
    """Frozen set of directives loaded by the resolver from
    methodology_publish_snapshots."""

    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    directives: List[Directive]
    directive_count: int
    schema_version: int = 1
    is_live: bool
    published_at: datetime
