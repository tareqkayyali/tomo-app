/**
 * CV Change Detection — Determines when AI statements need regeneration.
 *
 * Triggers:
 *   1. Never generated before
 *   2. Significant percentile jump (>10 pts on any metric)
 *   3. New career entry added
 *   4. New personal best in any benchmark
 *   5. Statement older than 30 days
 *   6. Academic entry added (university statement only)
 */

import type { FullCVBundle } from "./cvAssembler";

interface CVProfileRow {
  personal_statement_club: string | null;
  personal_statement_uni: string | null;
  statement_status: string | null;
  statement_last_generated: string | null;
  statement_data_snapshot: DataSnapshot | null;
}

interface DataSnapshot {
  career_count: number;
  academic_count: number;
  benchmark_percentiles: Record<string, number>;  // metric_key → percentile
  top_percentile: number;
  sessions_total: number;
  streak_days: number;
  coachability_score: number | null;
}

/**
 * Check if a personal statement should be regenerated.
 */
export function shouldRegenerateStatement(
  existing: CVProfileRow | null,
  current: FullCVBundle,
  cvType: "club" | "university"
): boolean {
  // Never generated
  if (!existing) return true;

  const statement = cvType === "club"
    ? existing.personal_statement_club
    : existing.personal_statement_uni;

  if (!statement) return true;

  // Statement is stale (>30 days)
  if (daysSince(existing.statement_last_generated) > 30) return true;

  // No previous data snapshot to compare against
  const prev = existing.statement_data_snapshot;
  if (!prev) return true;

  const curr = buildDataSnapshotForChangeDetection(current);

  // New career entry added
  if (curr.career_count !== prev.career_count) return true;

  // New academic entry (university CV)
  if (cvType === "university" && curr.academic_count !== prev.academic_count) return true;

  // Significant percentile jump (>10 points on any metric)
  for (const [key, pct] of Object.entries(curr.benchmark_percentiles)) {
    const prevPct = prev.benchmark_percentiles[key];
    if (prevPct != null && pct - prevPct > 10) return true;
  }

  // New benchmark metric that didn't exist before
  const newMetrics = Object.keys(curr.benchmark_percentiles).filter(
    k => !(k in (prev.benchmark_percentiles ?? {}))
  );
  if (newMetrics.length > 0) return true;

  // Major session milestone crossed (50, 100, 200)
  const milestones = [50, 100, 200, 500];
  for (const m of milestones) {
    if (prev.sessions_total < m && curr.sessions_total >= m) return true;
  }

  // Coachability score changed significantly (>0.5)
  if (prev.coachability_score != null && curr.coachability_score != null) {
    if (Math.abs(curr.coachability_score - prev.coachability_score) > 0.5) return true;
  } else if (prev.coachability_score == null && curr.coachability_score != null) {
    return true;  // Coachability computed for first time
  }

  return false;
}

/**
 * Build a lightweight data snapshot for change detection.
 * Stored as JSON in cv_profiles.statement_data_snapshot.
 */
export function buildDataSnapshotForChangeDetection(cv: FullCVBundle): DataSnapshot {
  const benchmarkPercentiles: Record<string, number> = {};
  for (const b of cv.performance.benchmarks) {
    benchmarkPercentiles[b.metric_key] = b.percentile;
  }

  return {
    career_count: cv.career.length,
    academic_count: cv.academic.length,
    benchmark_percentiles: benchmarkPercentiles,
    top_percentile: cv.performance.overall_percentile ?? 0,
    sessions_total: cv.performance.sessions_total,
    streak_days: cv.performance.streak_days,
    coachability_score: cv.performance.coachability?.score ?? null,
  };
}

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
