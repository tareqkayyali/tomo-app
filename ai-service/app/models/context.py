"""
Tomo AI Service — Player Context Models
Python equivalents of TypeScript PlayerContext, SnapshotEnrichment,
CalendarEvent, ActiveRecommendation from contextBuilder.ts.

These are Pydantic models (not TypedDicts) for validation + serialization.
Used by context_assembly_node and injected into LangGraph state.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class CalendarEvent(BaseModel):
    """Lightweight calendar event for context injection."""
    id: str
    title: str
    event_type: str
    start_at: str
    end_at: Optional[str] = None
    notes: Optional[str] = None
    intensity: Optional[str] = None


class ReadinessComponents(BaseModel):
    """Breakdown of latest checkin readiness."""
    energy: float
    soreness: float
    sleep_hours: float
    mood: float
    academic_stress: Optional[float] = None
    pain_flag: bool = False


class BenchmarkProfile(BaseModel):
    """Normative benchmark percentiles and gap analysis."""
    overall_percentile: float
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    gap_attributes: list[str] = Field(default_factory=list)
    strength_attributes: list[str] = Field(default_factory=list)


class TemporalContext(BaseModel):
    """Time-aware coaching context."""
    time_of_day: str = "morning"  # morning | afternoon | evening | night
    is_match_day: bool = False
    match_details: Optional[str] = None
    days_to_next_match: Optional[int] = None   # 0 = today, 1+ = days ahead, None = no match upcoming
    match_importance: Optional[str] = None     # league | tournament | friendly | match
    is_exam_proximity: bool = False
    exam_details: Optional[str] = None
    day_type: str = "rest"  # rest | light | training | competition | exam
    suggestion: str = ""
    periodization_phase: Optional[str] = None  # active protocol phase label


class ActiveRecommendation(BaseModel):
    """Lightweight rec summary for system prompt injection."""
    rec_type: str
    priority: int
    title: str
    body_short: str
    confidence: float


class SnapshotEnrichment(BaseModel):
    """
    Fields from athlete_snapshots that enhance context beyond legacy queries.
    90+ fields across load management, HRV/wellness, career velocity,
    PHV/growth, triangle, journal, performance science, vitals, trends,
    context, engagement, planning IP.
    """
    # Load management
    acwr: Optional[float] = None
    atl_7day: Optional[float] = None
    ctl_28day: Optional[float] = None
    injury_risk_flag: Optional[str] = None  # GREEN | AMBER | RED
    athletic_load_7day: Optional[float] = None
    academic_load_7day: Optional[float] = None
    dual_load_index: Optional[float] = None

    # Projected load
    projected_load_7day: Optional[float] = None
    projected_acwr: Optional[float] = None

    # HRV baselines
    hrv_baseline_ms: Optional[float] = None
    hrv_today_ms: Optional[float] = None
    sleep_quality: Optional[float] = None

    # Wellness trend (7-day rolling)
    wellness_7day_avg: Optional[float] = None
    wellness_trend: Optional[str] = None  # IMPROVING | STABLE | DECLINING

    # CV / accumulated metrics
    sessions_total: int = 0
    training_age_weeks: int = 0
    streak_days: int = 0
    cv_completeness: Optional[float] = None
    mastery_scores: dict[str, float] = Field(default_factory=dict)
    strength_benchmarks: dict[str, float] = Field(default_factory=dict)
    speed_profile: dict[str, float] = Field(default_factory=dict)
    coachability_index: Optional[float] = None

    # PHV
    phv_stage: Optional[str] = None
    phv_offset_years: Optional[float] = None

    # Triangle
    triangle_rag: Optional[str] = None
    readiness_rag: Optional[str] = None
    readiness_score: Optional[float] = None  # 0-100 granular
    last_checkin_at: Optional[str] = None

    # Journal
    journal_completeness_7d: Optional[float] = None  # 0–1 ratio
    journal_streak_days: int = 0
    target_achievement_rate_30d: Optional[float] = None  # 0–1 ratio
    last_journal_at: Optional[str] = None
    pending_pre_journal_count: int = 0
    pending_post_journal_count: int = 0

    # Performance Science
    training_monotony: Optional[float] = None
    training_strain: Optional[float] = None
    data_confidence_score: Optional[float] = None
    readiness_delta: Optional[float] = None
    sleep_debt_3d: Optional[float] = None

    # Vitals
    spo2_pct: Optional[float] = None
    recovery_score: Optional[float] = None

    # Trends
    hrv_trend_7d_pct: Optional[float] = None
    load_trend_7d_pct: Optional[float] = None
    acwr_trend: Optional[str] = None
    sleep_trend_7d: Optional[str] = None
    body_feel_trend_7d: Optional[float] = None
    resting_hr_trend_7d: Optional[str] = None
    readiness_distribution_7d: Optional[dict[str, float]] = None

    # Context
    matches_next_7d: Optional[int] = None
    exams_next_14d: Optional[int] = None
    season_phase: Optional[str] = None
    days_since_last_session: Optional[int] = None

    # Engagement
    rec_action_rate_30d: Optional[float] = None
    plan_compliance_7d: Optional[float] = None
    checkin_consistency_7d: Optional[float] = None
    coaching_preference: Optional[str] = None

    # Planning IP
    athlete_mode: Optional[str] = None
    dual_load_zone: Optional[str] = None
    applicable_protocol_ids: Optional[list[str]] = None
    exam_proximity_score: Optional[float] = None

    # CCRS (Cascading Confidence Readiness Score)
    ccrs: Optional[float] = None              # 0-100 continuous readiness score
    ccrs_confidence: Optional[str] = None     # very_high | high | medium | low | estimated
    ccrs_recommendation: Optional[str] = None # full_load | moderate | reduced | recovery | blocked
    ccrs_alert_flags: list[str] = Field(default_factory=list)
    data_freshness: Optional[str] = None      # FRESH | AGING | STALE | UNKNOWN


class ProtocolDetail(BaseModel):
    """Lightweight PDIL protocol detail for agent context."""
    protocol_id: str
    name: str
    category: str
    load_multiplier: Optional[float] = None
    intensity_cap: Optional[str] = None
    contraindications: list[str] = Field(default_factory=list)
    ai_system_injection: Optional[str] = None
    safety_critical: bool = False


class PlanningContext(BaseModel):
    """Planning Intelligence Protocol context from snapshot."""
    active_mode: Optional[str] = None
    mode_params: Optional[dict] = None
    applicable_protocols: list[str] = Field(default_factory=list)
    applicable_protocol_details: list[ProtocolDetail] = Field(default_factory=list)
    dual_load_zone: Optional[str] = None
    exam_proximity_score: Optional[float] = None
    data_confidence_score: Optional[float] = None


class SchedulePreferences(BaseModel):
    """
    Player schedule preferences — mirrors PlayerSchedulePreferences from TS.
    Used for scenario detection and rule context.
    """
    school_days: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5])
    school_start: str = "07:30"
    school_end: str = "14:30"
    sleep_start: str = "22:00"
    sleep_end: str = "06:00"
    day_bounds_start: str = "06:00"
    day_bounds_end: str = "22:00"
    study_days: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5])
    study_start: str = "16:00"
    study_duration_min: int = 60
    gym_days: list[int] = Field(default_factory=lambda: [1, 3, 5])
    gym_start: str = "17:00"
    gym_duration_min: int = 60
    personal_dev_days: list[int] = Field(default_factory=lambda: [6])
    personal_dev_start: str = "10:00"
    club_days: list[int] = Field(default_factory=lambda: [2, 4])
    club_start: str = "17:00"
    buffer_default_min: int = 30
    buffer_post_match_min: int = 60
    buffer_post_high_intensity_min: int = 45
    league_is_active: bool = False
    exam_period_active: bool = False
    exam_subjects: list[str] = Field(default_factory=list)
    exam_start_date: Optional[str] = None
    pre_exam_study_weeks: int = 2
    days_per_subject: int = 3


class PlayerContext(BaseModel):
    """
    Full player context assembled from 11+ parallel DB queries.
    Python equivalent of TypeScript PlayerContext in contextBuilder.ts.
    Injected into LangGraph state for all agent subgraphs.
    """
    # Identity
    user_id: str
    name: str = "Athlete"
    sport: str = "football"
    position: Optional[str] = None
    age_band: Optional[str] = None  # U13 | U15 | U17 | U19 | U21 | SEN | VET
    role: str = "player"  # player | coach | parent

    # Anthropometrics
    gender: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None

    # Today
    today_date: str  # YYYY-MM-DD
    current_time: str  # HH:MM (24h)
    today_events: list[CalendarEvent] = Field(default_factory=list)

    # Readiness
    readiness_score: Optional[str] = None  # Green | Yellow | Red
    checkin_date: Optional[str] = None
    readiness_components: Optional[ReadinessComponents] = None

    # Academic & Upcoming
    upcoming_exams: list[CalendarEvent] = Field(default_factory=list)
    upcoming_events: list[CalendarEvent] = Field(default_factory=list)
    academic_load_score: float = 0.0  # 0-10

    # Health
    recent_vitals: list[dict] = Field(default_factory=list)

    # Performance
    current_streak: int = 0
    benchmark_profile: Optional[BenchmarkProfile] = None
    recent_test_scores: list[dict] = Field(default_factory=list)

    # Temporal awareness
    temporal_context: TemporalContext = Field(default_factory=TemporalContext)

    # Schedule rules (None = user hasn't configured — don't inject phantom defaults)
    schedule_preferences: Optional[SchedulePreferences] = None
    active_scenario: str = "normal"  # normal | league_active | exam_period | league_and_exam

    # Context for routing — canonical 3-tab nav
    active_tab: str = "Chat"  # Timeline | Chat | Dashboard
    last_user_message: str = ""
    timezone: str = "UTC"

    # Layer 2 Snapshot enrichment
    snapshot_enrichment: Optional[SnapshotEnrichment] = None

    # Layer 4 Active Recommendations
    active_recommendations: list[ActiveRecommendation] = Field(default_factory=list)

    # Planning IP Context
    planning_context: Optional[PlanningContext] = None

    # Wearable integration status (authoritative source for WHOOP)
    wearable_status: Optional[dict] = None  # {"whoop": {"connected": bool, "data_fresh": bool, ...}}

    # 7-day trend arrays (oldest → newest, empty when insufficient data)
    ccrs7day: list[float] = Field(default_factory=list)
    sleep7day: list[float] = Field(default_factory=list)
