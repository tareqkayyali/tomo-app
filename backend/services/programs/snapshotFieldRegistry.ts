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
