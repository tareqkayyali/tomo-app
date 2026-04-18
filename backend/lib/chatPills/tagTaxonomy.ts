/**
 * Chat Pills — Tag Taxonomy
 *
 * Finite, server-owned list of context tags used to match pills to AI Chat
 * responses. Adding a tag here makes it available in the CMS admin tag
 * picker. Free-form tags are rejected by Zod at the API boundary.
 *
 * If you add a new tag:
 *   1. Add it below in the right category block.
 *   2. Emit it from the relevant builder in responseFormatter.ts / intentHandlers.ts
 *      (PR2 scope).
 *   3. Add library entries in the CMS that reference it.
 *
 * Keep this list additive. Renaming a tag is a breaking change — existing
 * library entries reference tags by string. If a rename is truly needed,
 * run a one-shot data migration on ui_config.config_value.
 */

export const CONTEXT_TAG_CATEGORIES = {
  readiness: [
    "readiness:green",
    "readiness:yellow",
    "readiness:red",
    "needs_checkin",
    "stale_checkin",
  ],
  schedule: [
    "has_clash",
    "rest_day",
    "training_today",
    "match_today",
    "exam_today",
    "exam_soon",
    "empty_week",
    "schedule_gap",
  ],
  load: [
    "acwr_high",
    "acwr_low",
    "dual_load_high",
    "high_load",
    "low_load",
  ],
  benchmarks: [
    "benchmark_weak",
    "benchmark_strong",
    "metric_missing",
    "has_benchmarks",
  ],
  programs: [
    "no_programs",
    "has_programs",
    "recommendation_ready",
  ],
  lifecycle: [
    "new_user",
    "returning_user",
    "streak_risk",
    "streak_milestone",
  ],
  domain: [
    "injury",
    "recovery",
    "nutrition",
    "sleep",
    "growth",
    "cv_incomplete",
  ],
  response_type: [
    "response:readiness",
    "response:schedule",
    "response:benchmark",
    "response:exam_week",
    "response:clash_fix",
    "response:programs",
    "response:session_plan",
    "response:text",
  ],
  fallback: ["always"],
} as const;

/**
 * Flat list of every valid tag. Used by Zod enum and the admin tag picker.
 */
export const CONTEXT_TAGS = Object.values(CONTEXT_TAG_CATEGORIES).flat();

export type ContextTag = (typeof CONTEXT_TAGS)[number];

/**
 * Human-readable labels for the admin UI.
 */
export const CONTEXT_TAG_LABELS: Record<string, string> = {
  // readiness
  "readiness:green": "Readiness — Green",
  "readiness:yellow": "Readiness — Yellow",
  "readiness:red": "Readiness — Red",
  needs_checkin: "Needs check-in",
  stale_checkin: "Stale check-in (>24h)",
  // schedule
  has_clash: "Has schedule clash",
  rest_day: "Rest day",
  training_today: "Training today",
  match_today: "Match today",
  exam_today: "Exam today",
  exam_soon: "Exam within 7 days",
  empty_week: "Empty week",
  schedule_gap: "Schedule gap",
  // load
  acwr_high: "ACWR high (>1.3)",
  acwr_low: "ACWR low (<0.8)",
  dual_load_high: "Dual load high",
  high_load: "High load",
  low_load: "Low load",
  // benchmarks
  benchmark_weak: "Weak benchmark",
  benchmark_strong: "Strong benchmark",
  metric_missing: "Metric missing",
  has_benchmarks: "Has benchmarks",
  // programs
  no_programs: "No active programs",
  has_programs: "Has active programs",
  recommendation_ready: "Recommendation ready",
  // lifecycle
  new_user: "New user",
  returning_user: "Returning user",
  streak_risk: "Streak at risk",
  streak_milestone: "Streak milestone",
  // domain
  injury: "Injury context",
  recovery: "Recovery context",
  nutrition: "Nutrition context",
  sleep: "Sleep context",
  growth: "Growth / PHV",
  cv_incomplete: "CV incomplete",
  // response type
  "response:readiness": "Response — Readiness",
  "response:schedule": "Response — Schedule",
  "response:benchmark": "Response — Benchmark",
  "response:exam_week": "Response — Exam week",
  "response:clash_fix": "Response — Clash fix",
  "response:programs": "Response — Programs",
  "response:session_plan": "Response — Session plan",
  "response:text": "Response — Text",
  // fallback
  always: "Always (last resort)",
};

/**
 * Returns a taxonomy payload safe for the admin UI: grouped categories +
 * label map. Used by GET /api/v1/admin/chat-pills.
 */
export function getTagTaxonomyPayload() {
  return {
    categories: CONTEXT_TAG_CATEGORIES,
    labels: CONTEXT_TAG_LABELS,
    all: CONTEXT_TAGS,
  };
}
