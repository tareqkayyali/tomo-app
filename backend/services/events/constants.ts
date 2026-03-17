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
