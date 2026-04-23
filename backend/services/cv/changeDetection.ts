/**
 * CV Change Detection — Determines when the AI summary needs regeneration.
 *
 * Triggers regeneration when:
 *   1. Never generated before
 *   2. Summary is stale (>30 days old)
 *   3. New career entry added
 *   4. Significant percentile jump (>10 pts on any benchmark)
 *   5. New benchmark metric that didn't exist before
 *   6. Major session milestone crossed (50/100/200/500)
 *   7. Physical maturity stage changed (e.g. CIRCA -> POST)
 */

import type { FullCVBundle } from "./cvAssembler";

interface CVProfileRow {
  ai_summary: string | null;
  ai_summary_status: string | null;
  ai_summary_last_generated: string | null;
}

export interface CVSummaryDataSnapshot {
  career_count: number;
  benchmark_percentiles: Record<string, number>;
  sessions_total: number;
  streak_days: number;
  overall_percentile: number;
  phv_stage: string | null;
  position: string | null;
}

export function shouldRegenerateSummary(
  existing: CVProfileRow | null,
  current: FullCVBundle
): boolean {
  if (!existing || !existing.ai_summary) return true;

  // Approved summaries are never auto-regenerated — user must explicitly
  // request regeneration or trigger `needs_update` via significant change.
  if (existing.ai_summary_status === "approved") return false;

  if (daysSince(existing.ai_summary_last_generated) > 30) return true;

  // We don't persist the prior snapshot on cv_profiles anymore (it lives on
  // cv_ai_summary_versions.data_snapshot). Callers that want fine-grained
  // change detection against a prior version should pass that version in
  // directly via shouldRegenerateAgainstVersion.
  return false;
}

/**
 * Fine-grained check against a prior version's data snapshot.
 * Used by nightly regeneration cron (Phase 3) to decide which athletes
 * need a fresh summary.
 */
export function shouldRegenerateAgainstVersion(
  prevSnapshot: CVSummaryDataSnapshot | null,
  current: FullCVBundle
): boolean {
  if (!prevSnapshot) return true;

  const curr = buildSummaryDataSnapshot(current);

  if (curr.career_count !== prevSnapshot.career_count) return true;
  if (curr.phv_stage !== prevSnapshot.phv_stage) return true;
  if (curr.position !== prevSnapshot.position) return true;

  // Percentile jump on any metric
  for (const [key, pct] of Object.entries(curr.benchmark_percentiles)) {
    const prev = prevSnapshot.benchmark_percentiles[key];
    if (prev != null && pct - prev > 10) return true;
  }

  // New benchmark metric
  const newMetrics = Object.keys(curr.benchmark_percentiles).filter(
    (k) => !(k in (prevSnapshot.benchmark_percentiles ?? {}))
  );
  if (newMetrics.length > 0) return true;

  // Session milestone crossed
  const milestones = [50, 100, 200, 500];
  for (const m of milestones) {
    if (prevSnapshot.sessions_total < m && curr.sessions_total >= m) return true;
  }

  return false;
}

export function buildSummaryDataSnapshot(cv: FullCVBundle): CVSummaryDataSnapshot {
  const benchmarkPercentiles: Record<string, number> = {};
  for (const b of cv.verified_performance.benchmarks) {
    benchmarkPercentiles[b.metric_key] = b.percentile;
  }

  return {
    career_count: cv.career.length,
    benchmark_percentiles: benchmarkPercentiles,
    sessions_total: cv.verified_performance.sessions_total,
    streak_days: cv.verified_performance.streak_days,
    overall_percentile: cv.verified_performance.overall_percentile ?? 0,
    phv_stage: cv.physical.phv_stage,
    position: cv.positions.primary_position,
  };
}

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
