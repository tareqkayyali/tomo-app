/**
 * Athlete Data Fabric — Constants
 *
 * Event type enums, source types, and snapshot visibility matrices.
 */

// ---------------------------------------------------------------------------
// Event Types (Layer 1)
// ---------------------------------------------------------------------------

export const EVENT_TYPES = {
  // Biometric / wearable
  VITAL_READING: 'VITAL_READING',
  WEARABLE_SYNC: 'WEARABLE_SYNC',
  SLEEP_RECORD: 'SLEEP_RECORD',

  // Training
  SESSION_LOG: 'SESSION_LOG',
  DRILL_COMPLETED: 'DRILL_COMPLETED',
  SESSION_SKIPPED: 'SESSION_SKIPPED',
  INTRA_SESSION_ADAPT: 'INTRA_SESSION_ADAPT',

  // Wellness / mental
  WELLNESS_CHECKIN: 'WELLNESS_CHECKIN',
  INJURY_FLAG: 'INJURY_FLAG',
  INJURY_CLEARED: 'INJURY_CLEARED',

  // Academic (Angle 2)
  ACADEMIC_EVENT: 'ACADEMIC_EVENT',
  STUDY_SESSION_LOG: 'STUDY_SESSION_LOG',
  ACADEMIC_STRESS_FLAG: 'ACADEMIC_STRESS_FLAG',

  // Assessment / testing
  ASSESSMENT_RESULT: 'ASSESSMENT_RESULT',
  PHV_MEASUREMENT: 'PHV_MEASUREMENT',
  MILESTONE_HIT: 'MILESTONE_HIT',

  // Stakeholder inputs (Angle 4)
  COACH_NOTE: 'COACH_NOTE',
  COACH_ASSESSMENT: 'COACH_ASSESSMENT',
  PARENT_INPUT: 'PARENT_INPUT',
  TRIANGLE_FLAG: 'TRIANGLE_FLAG',

  // CV / recruiting (Angle 3)
  COMPETITION_RESULT: 'COMPETITION_RESULT',
  CLUB_VIEW: 'CLUB_VIEW',
  CV_EXPORTED: 'CV_EXPORTED',

  // Journal
  JOURNAL_PRE_SESSION: 'JOURNAL_PRE_SESSION',
  JOURNAL_POST_SESSION: 'JOURNAL_POST_SESSION',

  // Planning Intelligence
  MODE_CHANGE: 'MODE_CHANGE',
  PLAN_PROPOSED: 'PLAN_PROPOSED',
  PLAN_COMMITTED: 'PLAN_COMMITTED',
  DLI_AMBER: 'DLI_AMBER',
  DLI_RED: 'DLI_RED',

  // Week Planner
  WEEK_PLAN_CREATED: 'WEEK_PLAN_CREATED',
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

// Set of all valid event type strings (for runtime validation)
export const VALID_EVENT_TYPES = new Set<string>(Object.values(EVENT_TYPES));

// ---------------------------------------------------------------------------
// Source Types
// ---------------------------------------------------------------------------

export const SOURCE_TYPES = {
  WEARABLE: 'WEARABLE',
  MANUAL: 'MANUAL',
  SYSTEM: 'SYSTEM',
  COACH: 'COACH',
  PARENT: 'PARENT',
  // Pre-Tomo, self-reported historical data (Profile > Historical Data).
  // Handlers skip current-profile/load aggregation for HISTORICAL events so
  // a 2022 sprint doesn't overwrite current speed_profile or pollute ACWR.
  HISTORICAL: 'HISTORICAL',
} as const;

export type SourceType = typeof SOURCE_TYPES[keyof typeof SOURCE_TYPES];

export const VALID_SOURCES = new Set<string>(Object.values(SOURCE_TYPES));

// ---------------------------------------------------------------------------
// Snapshot Visibility Matrix (Angle 4 — Triangle)
// ---------------------------------------------------------------------------

/** Fields each role can see on the athlete snapshot */
export const SNAPSHOT_VISIBILITY = {
  ATHLETE: ['*'] as const, // full access — athlete owns all their data

  COACH: [
    'athlete_id', 'snapshot_at',
    'sport', 'position',
    'phv_stage', 'phv_offset_years',
    'readiness_score', 'readiness_rag',
    'hrv_baseline_ms', 'hrv_today_ms', 'resting_hr_bpm',
    'injury_risk_flag',
    'acwr', 'atl_7day', 'ctl_28day',
    'athletic_load_7day',
    'sessions_total', 'training_age_weeks', 'streak_days',
    'mastery_scores', 'strength_benchmarks', 'speed_profile',
    'coachability_index',
    'cv_completeness',
    'wellness_7day_avg', 'wellness_trend',
    'last_session_at', 'last_checkin_at',
    // Planning IP (Phase 1)
    'athlete_mode', 'dual_load_zone', 'applicable_protocol_ids', 'exam_proximity_score',
    // Snapshot 360 — Performance Science
    'training_monotony', 'training_strain', 'data_confidence_score', 'data_confidence_breakdown',
    'season_phase', 'season_phase_week', 'readiness_delta', 'resting_hr_trend_7d',
    // Snapshot 360 — Vitals
    'spo2_pct', 'skin_temp_c', 'recovery_score', 'sleep_hours',
    'sleep_consistency_score', 'sleep_debt_3d',
    // Snapshot 360 — Trends
    'hrv_trend_7d_pct', 'load_trend_7d_pct', 'readiness_distribution_7d',
    'acwr_trend', 'sleep_trend_7d', 'body_feel_trend_7d',
    // Snapshot 360 — Schedule & Context
    'matches_next_7d', 'sessions_scheduled_next_7d', 'days_since_last_session',
    // Snapshot 360 — Injury
    'active_injury_count', 'injury_locations', 'days_since_injury',
    // Snapshot 360 — Engagement
    'chat_sessions_7d', 'chat_messages_7d', 'last_chat_at',
    'rec_action_rate_30d', 'drills_completed_7d', 'avg_drill_rating_30d',
    'active_program_count', 'program_compliance_rate', 'plan_compliance_7d',
    'checkin_consistency_7d',
    // Snapshot 360 — CV/Benchmark
    'cv_views_total', 'cv_views_7d', 'cv_statement_status', 'cv_sections_complete',
    'overall_percentile', 'top_strengths', 'key_gaps',
    // Snapshot 360 — Longitudinal
    'active_goals_count', 'unresolved_concerns_count', 'coaching_preference',
    // Snapshot 360 — Wearable & Journal
    'wearable_connected', 'wearable_last_sync_at',
    'pre_journal_completion_rate', 'post_journal_completion_rate', 'avg_post_body_feel_7d',
    // CCRS — Cascading Confidence Readiness
    'ccrs', 'ccrs_confidence', 'ccrs_recommendation', 'ccrs_alert_flags', 'data_freshness',
  ] as const,

  PARENT: [
    'athlete_id', 'snapshot_at',
    'readiness_rag',          // traffic light only — no raw biometric values
    'dual_load_index',
    'academic_load_7day', 'athletic_load_7day',
    'streak_days',
    'wellness_7day_avg', 'wellness_trend',
    'triangle_rag',
    'last_checkin_at',
    // Planning IP (Phase 1)
    'athlete_mode', 'dual_load_zone',
    // Snapshot 360 — visible to parent
    'season_phase',
    'sleep_hours', 'sleep_consistency_score', 'sleep_debt_3d',
    'readiness_distribution_7d', 'sleep_trend_7d',
    'matches_next_7d', 'exams_next_14d', 'in_exam_period',
    'active_injury_count',
    'checkin_consistency_7d',
    'study_hours_7d', 'academic_stress_latest', 'exam_count_active',
    // CCRS — parent sees score + recommendation (no component breakdown)
    'ccrs', 'ccrs_confidence', 'ccrs_recommendation', 'data_freshness',
  ] as const,
} as const;

// ---------------------------------------------------------------------------
// ACWR Thresholds
// ---------------------------------------------------------------------------

export const ACWR_SAFE_LOW = 0.8;
export const ACWR_SAFE_HIGH = 1.3;
export const ACWR_DANGER_HIGH = 1.5;

// ---------------------------------------------------------------------------
// Readiness RAG Mapping (to match existing Green/Yellow/Red → GREEN/AMBER/RED)
// ---------------------------------------------------------------------------

export function readinessToRag(level: 'Green' | 'Yellow' | 'Red' | string): 'GREEN' | 'AMBER' | 'RED' {
  switch (level) {
    case 'Green': return 'GREEN';
    case 'Yellow': return 'AMBER';
    case 'Red': return 'RED';
    default: return 'AMBER';
  }
}

// ---------------------------------------------------------------------------
// Wellness Trend Thresholds
// ---------------------------------------------------------------------------

export const WELLNESS_TREND_IMPROVING_DELTA = 0.5;   // avg increased by 0.5+ over prior week
export const WELLNESS_TREND_DECLINING_DELTA = -0.5;   // avg decreased by 0.5+ over prior week
