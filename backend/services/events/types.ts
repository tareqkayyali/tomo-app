/**
 * Athlete Data Fabric — Type definitions
 *
 * Core types for the three-tier event-sourced architecture:
 *   Layer 1: AthleteEvent (immutable event stream)
 *   Layer 2: AthleteSnapshot (pre-computed, O(1) reads)
 *   Layer 3: Enhanced calendar_events (planning layer)
 */

import { EVENT_TYPES, SOURCE_TYPES, type EventType, type SourceType } from './constants';

// ---------------------------------------------------------------------------
// Layer 1: Event Stream
// ---------------------------------------------------------------------------

export interface AthleteEvent {
  event_id: string;
  athlete_id: string;
  event_type: EventType;
  occurred_at: string;          // ISO 8601 timestamptz
  source: SourceType;
  payload: EventPayload;
  created_by: string;
  created_at: string;
  correction_of: string | null;
}

/** Union of all possible event payloads, keyed by event_type */
export type EventPayload =
  | VitalReadingPayload
  | WearableSyncPayload
  | SleepRecordPayload
  | SessionLogPayload
  | DrillCompletedPayload
  | SessionSkippedPayload
  | WellnessCheckinPayload
  | InjuryFlagPayload
  | InjuryClearedPayload
  | AcademicEventPayload
  | StudySessionLogPayload
  | AssessmentResultPayload
  | PhvMeasurementPayload
  | MilestoneHitPayload
  | CoachNotePayload
  | CoachAssessmentPayload
  | ParentInputPayload
  | TriangleFlagPayload
  | CompetitionResultPayload
  | ClubViewPayload
  | CvExportedPayload
  | JournalPreSessionPayload
  | JournalPostSessionPayload
  | ModeChangePayload
  | PlanProposedPayload
  | PlanCommittedPayload
  | DliAlertPayload
  | Record<string, unknown>;    // fallback for extensibility

// ---------------------------------------------------------------------------
// Payload shapes (matching spec Section 3.3)
// ---------------------------------------------------------------------------

export interface VitalReadingPayload {
  hrv_ms?: number;
  resting_hr_bpm?: number;
  spo2_percent?: number;
  skin_temp_celsius?: number;
  wearable_device?: string;
  measurement_window?: 'MORNING' | 'INTRA_SESSION' | 'POST_SESSION';
}

export interface WearableSyncPayload {
  device: string;
  readings: VitalReadingPayload[];
  sync_timestamp: string;
}

export interface SleepRecordPayload {
  sleep_duration_hours: number;
  sleep_quality_score?: number;   // 0–10
  bed_time?: string;
  wake_time?: string;
  deep_sleep_min?: number;
  rem_sleep_min?: number;
  light_sleep_min?: number;
  awake_min?: number;
  source?: string;
}

export interface SetRecord {
  exercise: string;
  set_number: number;
  reps?: number;
  weight_kg?: number;
  duration_seconds?: number;
  rpe?: number;
}

export interface SessionLogPayload {
  planned_session_id?: string;
  calendar_event_id?: string;
  actual_duration_min: number;
  planned_duration_min?: number;
  total_volume_kg?: number;
  session_rpe: number;            // 1–10 CR10 scale
  training_load_au: number;       // RPE × duration
  session_type?: string;          // training | match | gym | recovery
  sport?: string;
  sets_completed?: SetRecord[];
  adaptations_applied?: string[];
}

export interface DrillCompletedPayload {
  drill_id: string;
  drill_name: string;
  duration_min: number;
  score?: number;
  rating?: number;                // 1–5
  notes?: string;
}

export interface SessionSkippedPayload {
  planned_session_id?: string;
  calendar_event_id?: string;
  reason: string;
}

export interface WellnessCheckinPayload {
  energy: number;                 // 1–10
  soreness: number;               // 1–10
  sleep_hours: number;
  pain_flag: boolean;
  pain_location?: string | null;
  mood: number;                   // 1–10
  effort_yesterday?: number;      // 1–10
  academic_stress?: number | null; // 1–10
  // Computed fields added by handler
  computed_readiness_level?: 'Green' | 'Yellow' | 'Red';
  computed_readiness_score?: number;
  computed_intensity?: string;
}

export interface InjuryFlagPayload {
  location: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE';
  description?: string;
  reported_by: 'ATHLETE' | 'COACH' | 'PARENT';
}

export interface InjuryClearedPayload {
  original_injury_event_id: string;
  cleared_by: string;
  notes?: string;
}

export interface AcademicEventPayload {
  academic_event_type: 'EXAM' | 'ASSIGNMENT' | 'PRESENTATION' | 'TRAVEL' | 'COMPETITION';
  subject?: string;
  estimated_prep_hours?: number;
  academic_load_score?: number;
  entered_by: 'ATHLETE' | 'PARENT';
}

export interface StudySessionLogPayload {
  subject: string;
  duration_min: number;
  quality_rating?: number;        // 1–5
  notes?: string;
}

export interface AssessmentResultPayload {
  test_type: string;
  primary_value: number;
  primary_unit: string;
  derived_metrics?: Record<string, number>;
  raw_inputs?: Record<string, unknown>;
  percentile?: number;
  zone?: string;
  is_new_pb?: boolean;
  // Optional anthropometric data (triggers PHV recompute)
  height_cm?: number;
  weight_kg?: number;
}

export interface PhvMeasurementPayload {
  height_cm: number;
  weight_kg: number;
  sitting_height_cm?: number;
  leg_length_cm?: number;
  computed_phv_offset_years?: number;
  computed_phv_stage?: 'PRE' | 'CIRCA' | 'POST';
}

export interface MilestoneHitPayload {
  milestone_type: string;
  title: string;
  description?: string;
  metric_key?: string;
  threshold_value?: number;
}

export interface CoachNotePayload {
  note: string;
  category?: string;
  session_id?: string;
}

export interface CoachAssessmentPayload {
  assessment_type: string;
  scores: Record<string, number>;
  notes?: string;
  overall_rating?: number;
}

export interface ParentInputPayload {
  input_type: 'ACADEMIC_LOAD' | 'SCHEDULE_CONFLICT' | 'WELLNESS_CONCERN' | 'OTHER';
  description: string;
  data?: Record<string, unknown>;
}

export interface TriangleFlagPayload {
  flag_type: 'OVERLOAD' | 'CONFLICT' | 'CONCERN' | 'WELLNESS_ALERT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  involved_roles: string[];
}

export interface CompetitionResultPayload {
  competition_name: string;
  opponent?: string;
  result?: string;               // W/L/D or score
  minutes_played?: number;
  performance_notes?: string;
  stats?: Record<string, number>;
}

export interface ClubViewPayload {
  viewer_id?: string;
  viewer_type?: string;
  sections_viewed?: string[];
}

export interface CvExportedPayload {
  export_format: 'PDF' | 'LINK' | 'QR';
  sections_included: string[];
}

// ---------------------------------------------------------------------------
// Planning Intelligence Payloads
// ---------------------------------------------------------------------------

export interface ModeChangePayload {
  previous_mode: string | null;
  new_mode: string;
  mode_params: Record<string, unknown>;
  trigger: 'manual' | 'auto' | 'system';
}

export interface PlanProposedPayload {
  plan_type: 'training' | 'study' | 'weekly' | 'adjustment';
  planning_session_id: string;
  mode_id: string;
  protocols_applied: string[];
  plan_summary: string;
}

export interface PlanCommittedPayload {
  planning_session_id: string;
  calendar_events_created: string[];
  protocols_applied: string[];
}

export interface DliAlertPayload {
  dual_load_index: number;
  dual_load_zone: 'amber' | 'red' | 'critical';
  previous_zone: string | null;
  training_load_component: number;
  academic_load_component: number;
}

// ---------------------------------------------------------------------------
// Journal Payloads
// ---------------------------------------------------------------------------

export interface JournalPreSessionPayload {
  calendar_event_id: string;
  journal_id: string;
  training_category: string;
  training_name: string;
  pre_target: string;
  pre_mental_cue?: string;
  pre_focus_tag?: string;
  event_date: string;              // YYYY-MM-DD
  journal_variant: 'standard' | 'recovery' | 'match';
}

export interface JournalPostSessionPayload {
  calendar_event_id: string;
  journal_id: string;
  training_category: string;
  training_name: string;
  post_outcome: 'fell_short' | 'hit_it' | 'exceeded';
  post_reflection: string;
  post_next_focus?: string;
  post_body_feel?: number;          // 1–10
  event_date: string;
  journal_variant: 'standard' | 'recovery' | 'match';
  // Computed by handler
  computed_journal_completeness_7d?: number;
  computed_journal_streak_days?: number;
  computed_target_achievement_rate_30d?: number;
  computed_pending_pre_count?: number;
  computed_pending_post_count?: number;
}

// ---------------------------------------------------------------------------
// Layer 2: Athlete Snapshot
// ---------------------------------------------------------------------------

export interface AthleteSnapshot {
  // Identity
  athlete_id: string;
  snapshot_at: string;

  // Core profile
  dob: string | null;
  sport: string | null;
  position: string | null;
  academic_year: number | null;

  // PHV
  phv_stage: string | null;        // PRE | CIRCA | POST
  phv_offset_years: number | null;
  height_cm: number | null;
  weight_kg: number | null;

  // Today's readiness
  readiness_score: number | null;   // 0–100
  hrv_baseline_ms: number | null;
  hrv_today_ms: number | null;
  resting_hr_bpm: number | null;
  sleep_quality: number | null;
  injury_risk_flag: string | null;  // GREEN | AMBER | RED
  readiness_rag: string | null;     // GREEN | AMBER | RED

  // Load metrics
  acwr: number | null;
  atl_7day: number | null;
  ctl_28day: number | null;
  dual_load_index: number | null;
  academic_load_7day: number | null;
  athletic_load_7day: number | null;

  // Accumulated performance (CV)
  sessions_total: number;
  training_age_weeks: number;
  streak_days: number;
  cv_completeness: number | null;
  mastery_scores: Record<string, number>;
  strength_benchmarks: Record<string, number>;
  speed_profile: Record<string, number>;
  coachability_index: number | null;

  // Wellness trend (Triangle)
  wellness_7day_avg: number | null;
  wellness_trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | null;
  triangle_rag: 'GREEN' | 'AMBER' | 'RED' | null;

  // Journal
  journal_completeness_7d: number | null;
  journal_streak_days: number;
  target_achievement_rate_30d: number | null;
  last_journal_at: string | null;
  pending_pre_journal_count: number;
  pending_post_journal_count: number;

  // ── Planning IP (migration 036) ──
  athlete_mode: string | null;
  mode_changed_at: string | null;
  study_training_balance_ratio: number | null;
  dual_load_zone: string | null;
  applicable_protocol_ids: string[] | null;
  exam_proximity_score: number | null;

  // ── Snapshot 360: Performance Science (migration 037) ──
  training_monotony: number | null;
  training_strain: number | null;
  data_confidence_score: number | null;
  data_confidence_breakdown: Record<string, number> | null;
  season_phase: string | null;
  season_phase_week: number | null;
  readiness_delta: number | null;
  resting_hr_trend_7d: 'IMPROVING' | 'STABLE' | 'DECLINING' | null;

  // ── Snapshot 360: Vitals Enrichment ──
  spo2_pct: number | null;
  skin_temp_c: number | null;
  recovery_score: number | null;
  sleep_hours: number | null;
  sleep_consistency_score: number | null;
  sleep_debt_3d: number | null;

  // ── Snapshot 360: Trends ──
  hrv_trend_7d_pct: number | null;
  load_trend_7d_pct: number | null;
  readiness_distribution_7d: Record<string, number> | null;
  acwr_trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | null;
  sleep_trend_7d: 'IMPROVING' | 'STABLE' | 'DECLINING' | null;
  body_feel_trend_7d: number | null;

  // ── Snapshot 360: Schedule & Context ──
  matches_next_7d: number | null;
  exams_next_14d: number | null;
  in_exam_period: boolean | null;
  sessions_scheduled_next_7d: number | null;
  days_since_last_session: number | null;

  // ── Snapshot 360: Injury Detail ──
  active_injury_count: number | null;
  injury_locations: string[] | null;
  days_since_injury: number | null;

  // ── Snapshot 360: Engagement & Behavioral ──
  chat_sessions_7d: number | null;
  chat_messages_7d: number | null;
  last_chat_at: string | null;
  rec_action_rate_30d: number | null;
  notification_action_rate_7d: number | null;
  drills_completed_7d: number | null;
  avg_drill_rating_30d: number | null;
  active_program_count: number | null;
  program_compliance_rate: number | null;
  plan_compliance_7d: number | null;
  checkin_consistency_7d: number | null;
  total_points_7d: number | null;
  longest_streak: number | null;

  // ── Snapshot 360: Triangle Engagement ──
  days_since_coach_interaction: number | null;
  days_since_parent_interaction: number | null;
  triangle_engagement_score: number | null;

  // ── Snapshot 360: Academic Detail ──
  study_hours_7d: number | null;
  academic_stress_latest: number | null;
  exam_count_active: number | null;

  // ── Snapshot 360: CV & Recruiting ──
  cv_views_total: number | null;
  cv_views_7d: number | null;
  cv_statement_status: string | null;
  cv_sections_complete: Record<string, number> | null;

  // ── Snapshot 360: Benchmark & Performance ──
  overall_percentile: number | null;
  top_strengths: Array<{ category: string; percentile: number }> | null;
  key_gaps: Array<{ category: string; percentile: number }> | null;

  // ── Snapshot 360: Longitudinal AI Context ──
  active_goals_count: number | null;
  unresolved_concerns_count: number | null;
  coaching_preference: string | null;

  // ── Snapshot 360: Wearable Status ──
  wearable_connected: boolean | null;
  wearable_last_sync_at: string | null;

  // ── Snapshot 360: Journal Quality ──
  pre_journal_completion_rate: number | null;
  post_journal_completion_rate: number | null;
  avg_post_body_feel_7d: number | null;

  // Meta
  last_event_id: string | null;
  last_session_at: string | null;
  last_checkin_at: string | null;
}

/** Triangle role for snapshot visibility filtering */
export type TriangleRole = 'ATHLETE' | 'COACH' | 'PARENT';

// ---------------------------------------------------------------------------
// Event Emitter Input
// ---------------------------------------------------------------------------

export interface EmitEventParams {
  athleteId: string;
  eventType: EventType;
  occurredAt?: string;          // defaults to now()
  source: SourceType;
  payload: Record<string, unknown>;
  createdBy: string;
  correctionOf?: string;
}

// ---------------------------------------------------------------------------
// Daily Load (ACWR pre-aggregation)
// ---------------------------------------------------------------------------

export interface AthleteDailyLoad {
  athlete_id: string;
  load_date: string;
  training_load_au: number;
  academic_load_au: number;
  session_count: number;
}
