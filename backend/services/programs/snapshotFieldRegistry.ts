/**
 * Snapshot Field Registry — Single source of truth for athlete_snapshots fields.
 *
 * Both the CMS Rule Builder UI and programGuardrails.ts consume this registry.
 * When a new column is added to athlete_snapshots:
 *   1. Run `npx supabase gen types typescript --local > types/database.ts`
 *   2. Add the column to SNAPSHOT_COLUMNS below (one line)
 *   3. Optionally add a label override to LABEL_OVERRIDES
 *   4. It automatically appears in the CMS dropdown + guardrail SELECT query
 */

// ── Types ──

export interface FieldEntry {
  value: string; // camelCase key used in SnapshotState & rule conditions
  dbColumn: string; // snake_case DB column ("__derived__" for computed fields)
  label: string; // human-readable label for CMS dropdown
  type: "number" | "string" | "json";
}

// ── Configuration ──

/**
 * Columns excluded from the Rule Builder dropdown.
 * These are identity/meta fields that don't make sense as rule conditions.
 */
const EXCLUDED_COLUMNS = new Set([
  "athlete_id",
  "snapshot_at",
  "last_event_id",
  "last_session_at",
  "last_checkin_at",
  "last_chat_at",
  "wearable_last_sync_at",
  "mode_changed_at",
  "dob",
  "sport",
  "position",
  "academic_year",
  "height_cm",
  "weight_kg",
]);

/**
 * Human-readable label overrides for existing fields.
 * Keys are snake_case DB column names.
 * Columns not listed here get auto-generated labels.
 */
const LABEL_OVERRIDES: Record<string, string> = {
  acwr: "ACWR",
  atl_7day: "Acute Load (7d)",
  ctl_28day: "Chronic Load (28d)",
  dual_load_index: "Dual Load Index",
  athletic_load_7day: "Athletic Load (7d)",
  academic_load_7day: "Academic Load (7d)",
  readiness_score: "Readiness Score",
  readiness_rag: "Readiness RAG",
  hrv_today_ms: "HRV Today (ms)",
  hrv_baseline_ms: "HRV Baseline (ms)",
  sleep_quality: "Sleep Quality (0-10)",
  wellness_7day_avg: "Wellness 7d Avg",
  wellness_trend: "Wellness Trend",
  injury_risk_flag: "Injury Risk Flag",
  phv_stage: "PHV Stage",
  sessions_total: "Sessions Total",
  training_age_weeks: "Training Age (weeks)",
  streak_days: "Streak (days)",
  resting_hr_bpm: "Resting HR (bpm)",
  hrv_recorded_at: "HRV Recorded At",
  sleep_recorded_at: "Sleep Recorded At",
  cv_completeness: "CV Completeness (%)",
  coachability_index: "Coachability Index",
  triangle_rag: "Triangle RAG",
  phv_offset_years: "PHV Offset (years)",
  mastery_scores: "Mastery Scores",
  speed_profile: "Speed Profile",
  strength_benchmarks: "Strength Benchmarks",
  // Planning IP
  athlete_mode: "Athlete Mode",
  dual_load_zone: "Dual Load Zone",
  applicable_protocol_ids: "Applicable Protocols",
  exam_proximity_score: "Exam Proximity Score",
  study_training_balance_ratio: "Study/Training Balance",
  // Snapshot 360
  training_monotony: "Training Monotony (Banister)",
  training_strain: "Training Strain",
  data_confidence_score: "Data Confidence Score",
  data_confidence_breakdown: "Data Confidence Breakdown",
  season_phase: "Season Phase",
  readiness_delta: "Readiness Delta (Subjective − Objective)",
  resting_hr_trend_7d: "Resting HR Trend (7d)",
  spo2_pct: "SpO₂ (%)",
  skin_temp_c: "Skin Temperature (°C)",
  recovery_score: "Recovery Score",
  sleep_hours: "Sleep Hours",
  sleep_consistency_score: "Sleep Consistency Score",
  sleep_debt_3d: "Sleep Debt (3d)",
  hrv_trend_7d_pct: "HRV Trend 7d (%)",
  load_trend_7d_pct: "Load Trend 7d (%)",
  readiness_distribution_7d: "Readiness Distribution (7d)",
  acwr_trend: "ACWR Trend",
  sleep_trend_7d: "Sleep Trend (7d)",
  body_feel_trend_7d: "Body Feel Trend (7d)",
  matches_next_7d: "Matches Next 7d",
  exams_next_14d: "Exams Next 14d",
  in_exam_period: "In Exam Period",
  active_injury_count: "Active Injury Count",
  injury_locations: "Injury Locations",
  days_since_injury: "Days Since Injury",
  rec_action_rate_30d: "Rec Action Rate (30d)",
  plan_compliance_7d: "Plan Compliance (7d)",
  checkin_consistency_7d: "Check-in Consistency (7d)",
  triangle_engagement_score: "Triangle Engagement Score",
  overall_percentile: "Overall Percentile",
};

// ── Column Registry ──

/**
 * Every athlete_snapshots column mapped to [snake_case, camelCase, type].
 * This is the ONE place to add new columns.
 *
 * Type must match the generated database.ts type:
 *   number | null  →  "number"
 *   string | null  →  "string"
 *   Json           →  "json"
 */
const SNAPSHOT_COLUMNS: Array<[string, string, "number" | "string" | "json"]> =
  [
    // Load metrics
    ["acwr", "acwr", "number"],
    ["atl_7day", "atl7day", "number"],
    ["ctl_28day", "ctl28day", "number"],
    ["dual_load_index", "dualLoadIndex", "number"],
    ["athletic_load_7day", "athleticLoad7day", "number"],
    ["academic_load_7day", "academicLoad7day", "number"],
    // Readiness
    ["readiness_score", "readinessScore", "number"],
    ["readiness_rag", "readinessRag", "string"],
    ["hrv_today_ms", "hrvTodayMs", "number"],
    ["hrv_baseline_ms", "hrvBaselineMs", "number"],
    ["sleep_quality", "sleepQuality", "number"],
    ["resting_hr_bpm", "restingHrBpm", "number"],
    // Vitals freshness timestamps
    ["hrv_recorded_at", "hrvRecordedAt", "string"],
    ["sleep_recorded_at", "sleepRecordedAt", "string"],
    // Wellness
    ["wellness_7day_avg", "wellness7dayAvg", "number"],
    ["wellness_trend", "wellnessTrend", "string"],
    // Injury & flags
    ["injury_risk_flag", "injuryRiskFlag", "string"],
    ["triangle_rag", "triangleRag", "string"],
    // PHV
    ["phv_stage", "phvStage", "string"],
    ["phv_offset_years", "phvOffsetYears", "number"],
    // Performance history
    ["sessions_total", "sessionsTotal", "number"],
    ["training_age_weeks", "trainingAgeWeeks", "number"],
    ["streak_days", "streakDays", "number"],
    ["cv_completeness", "cvCompleteness", "number"],
    ["coachability_index", "coachabilityIndex", "number"],
    // JSON blobs
    ["mastery_scores", "masteryScores", "json"],
    ["speed_profile", "speedProfile", "json"],
    ["strength_benchmarks", "strengthBenchmarks", "json"],

    // ── Planning IP (Phase 1) ──
    ["athlete_mode", "athleteMode", "string"],
    ["mode_changed_at", "modeChangedAt", "string"],
    ["study_training_balance_ratio", "studyTrainingBalanceRatio", "number"],
    ["dual_load_zone", "dualLoadZone", "string"],
    ["applicable_protocol_ids", "applicableProtocolIds", "json"],
    ["exam_proximity_score", "examProximityScore", "number"],

    // ── Snapshot 360: Performance Science ──
    ["training_monotony", "trainingMonotony", "number"],
    ["training_strain", "trainingStrain", "number"],
    ["data_confidence_score", "dataConfidenceScore", "number"],
    ["data_confidence_breakdown", "dataConfidenceBreakdown", "json"],
    ["season_phase", "seasonPhase", "string"],
    ["season_phase_week", "seasonPhaseWeek", "number"],
    ["readiness_delta", "readinessDelta", "number"],
    ["resting_hr_trend_7d", "restingHrTrend7d", "string"],

    // ── Snapshot 360: Vitals Enrichment ──
    ["spo2_pct", "spo2Pct", "number"],
    ["skin_temp_c", "skinTempC", "number"],
    ["recovery_score", "recoveryScore", "number"],
    ["sleep_hours", "sleepHours", "number"],
    ["sleep_consistency_score", "sleepConsistencyScore", "number"],
    ["sleep_debt_3d", "sleepDebt3d", "number"],

    // ── Snapshot 360: Trends ──
    ["hrv_trend_7d_pct", "hrvTrend7dPct", "number"],
    ["load_trend_7d_pct", "loadTrend7dPct", "number"],
    ["readiness_distribution_7d", "readinessDistribution7d", "json"],
    ["acwr_trend", "acwrTrend", "string"],
    ["sleep_trend_7d", "sleepTrend7d", "string"],
    ["body_feel_trend_7d", "bodyFeelTrend7d", "number"],

    // ── Snapshot 360: Schedule & Context ──
    ["matches_next_7d", "matchesNext7d", "number"],
    ["exams_next_14d", "examsNext14d", "number"],
    ["in_exam_period", "inExamPeriod", "string"],
    ["sessions_scheduled_next_7d", "sessionsScheduledNext7d", "number"],
    ["days_since_last_session", "daysSinceLastSession", "number"],

    // ── Snapshot 360: Injury Detail ──
    ["active_injury_count", "activeInjuryCount", "number"],
    ["injury_locations", "injuryLocations", "json"],
    ["days_since_injury", "daysSinceInjury", "number"],

    // ── Snapshot 360: Engagement & Behavioral ──
    ["chat_sessions_7d", "chatSessions7d", "number"],
    ["chat_messages_7d", "chatMessages7d", "number"],
    ["last_chat_at", "lastChatAt", "string"],
    ["rec_action_rate_30d", "recActionRate30d", "number"],
    ["notification_action_rate_7d", "notificationActionRate7d", "number"],
    ["drills_completed_7d", "drillsCompleted7d", "number"],
    ["avg_drill_rating_30d", "avgDrillRating30d", "number"],
    ["active_program_count", "activeProgramCount", "number"],
    ["program_compliance_rate", "programComplianceRate", "number"],
    ["plan_compliance_7d", "planCompliance7d", "number"],
    ["checkin_consistency_7d", "checkinConsistency7d", "number"],
    ["total_points_7d", "totalPoints7d", "number"],
    ["longest_streak", "longestStreak", "number"],

    // ── Snapshot 360: Triangle Engagement ──
    ["days_since_coach_interaction", "daysSinceCoachInteraction", "number"],
    ["days_since_parent_interaction", "daysSinceParentInteraction", "number"],
    ["triangle_engagement_score", "triangleEngagementScore", "number"],

    // ── Snapshot 360: Academic Detail ──
    ["study_hours_7d", "studyHours7d", "number"],
    ["academic_stress_latest", "academicStressLatest", "number"],
    ["exam_count_active", "examCountActive", "number"],

    // ── Snapshot 360: CV & Recruiting ──
    ["cv_views_total", "cvViewsTotal", "number"],
    ["cv_views_7d", "cvViews7d", "number"],
    ["cv_statement_status", "cvStatementStatus", "string"],
    ["cv_sections_complete", "cvSectionsComplete", "json"],

    // ── Snapshot 360: Benchmark & Performance ──
    ["overall_percentile", "overallPercentile", "number"],
    ["top_strengths", "topStrengths", "json"],
    ["key_gaps", "keyGaps", "json"],

    // ── Snapshot 360: Longitudinal AI Context ──
    ["active_goals_count", "activeGoalsCount", "number"],
    ["unresolved_concerns_count", "unresolvedConcernsCount", "number"],
    ["coaching_preference", "coachingPreference", "string"],

    // ── Snapshot 360: Wearable Status ──
    ["wearable_connected", "wearableConnected", "string"],
    ["wearable_last_sync_at", "wearableLastSyncAt", "string"],

    // ── Snapshot 360: Journal Quality ──
    ["pre_journal_completion_rate", "preJournalCompletionRate", "number"],
    ["post_journal_completion_rate", "postJournalCompletionRate", "number"],
    ["avg_post_body_feel_7d", "avgPostBodyFeel7d", "number"],

    // Identity / meta (will be filtered out by EXCLUDED_COLUMNS)
    ["athlete_id", "athleteId", "string"],
    ["snapshot_at", "snapshotAt", "string"],
    ["last_event_id", "lastEventId", "string"],
    ["last_session_at", "lastSessionAt", "string"],
    ["last_checkin_at", "lastCheckinAt", "string"],
    ["dob", "dob", "string"],
    ["sport", "sport", "string"],
    ["position", "position", "string"],
    ["academic_year", "academicYear", "number"],
    ["height_cm", "heightCm", "number"],
    ["weight_kg", "weightKg", "number"],
  ];

/**
 * Derived fields — computed at runtime, not stored in DB.
 * Each needs a corresponding handler in resolveField() in programGuardrails.ts.
 */
const DERIVED_FIELDS: FieldEntry[] = [
  {
    value: "hrvRatio",
    dbColumn: "__derived__",
    label: "HRV Ratio (today/baseline)",
    type: "number",
  },
];

// ── Auto-label generator ──

function autoLabel(snakeCase: string): string {
  return snakeCase
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Build exports ──

/** All snapshot fields available for rule conditions (excludes meta columns). */
export const SNAPSHOT_FIELDS: FieldEntry[] = [
  ...SNAPSHOT_COLUMNS.filter(([dbCol]) => !EXCLUDED_COLUMNS.has(dbCol)).map(
    ([dbCol, camelKey, type]) => ({
      value: camelKey,
      dbColumn: dbCol,
      label: LABEL_OVERRIDES[dbCol] ?? autoLabel(dbCol),
      type,
    })
  ),
  ...DERIVED_FIELDS,
];

/** DB-backed fields only (for SELECT queries — excludes derived and excluded). */
export const DB_FIELDS: FieldEntry[] = SNAPSHOT_FIELDS.filter(
  (f) => f.dbColumn !== "__derived__"
);

/** All DB columns including excluded (for getSnapshotState SELECT). */
export const ALL_DB_COLUMNS: Array<{
  dbColumn: string;
  camelKey: string;
  type: "number" | "string" | "json";
}> = SNAPSHOT_COLUMNS.map(([dbCol, camelKey, type]) => ({
  dbColumn: dbCol,
  camelKey,
  type,
}));

/** Fields suitable for simple rule conditions (excludes JSON — need dot-path). */
export const RULE_BUILDER_FIELDS: FieldEntry[] = SNAPSHOT_FIELDS.filter(
  (f) => f.type !== "json"
);

/** Lookup: camelCase → snake_case */
export const CAMEL_TO_SNAKE: Record<string, string> = Object.fromEntries(
  SNAPSHOT_COLUMNS.map(([dbCol, camelKey]) => [camelKey, dbCol])
);

/** Lookup: snake_case → camelCase */
export const SNAKE_TO_CAMEL: Record<string, string> = Object.fromEntries(
  SNAPSHOT_COLUMNS.map(([dbCol, camelKey]) => [dbCol, camelKey])
);

/**
 * Build the SELECT column string for getSnapshotState().
 * Excludes meta columns that aren't needed for guardrail evaluation,
 * but includes all data columns.
 */
export function buildSelectColumns(): string {
  return SNAPSHOT_COLUMNS.filter(([dbCol]) => !EXCLUDED_COLUMNS.has(dbCol))
    .map(([dbCol]) => dbCol)
    .join(", ");
}

/**
 * Map a Supabase row (snake_case) to a camelCase state object.
 * Only maps non-excluded columns.
 */
export function mapRowToState(
  data: Record<string, unknown>
): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const [dbCol, camelKey] of SNAPSHOT_COLUMNS) {
    if (EXCLUDED_COLUMNS.has(dbCol)) continue;
    state[camelKey] = data[dbCol] ?? null;
  }
  return state;
}
