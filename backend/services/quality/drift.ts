/**
 * Drift detection for Chat Quality Engine.
 *
 * Approach — rolling-window change-point, simpler and more robust than true
 * CUSUM for this workload:
 *
 *   baseline window = days 8..35 (28d trailing, excluding the recent window)
 *   recent window   = days 0..7  (last 7d)
 *   z = (mean_recent - mean_baseline) / (std_baseline / sqrt(n_recent))
 *   alert when |z| > 2.5 AND min(n_baseline, n_recent) >= MIN_SAMPLES
 *
 * Detection runs nightly via the /api/v1/cron/quality-drift-check route and
 * writes matching rows into quality_drift_alerts.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { Dimension } from "./types";
import { DIMENSION_KEYS } from "./judgeRubric";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const BASELINE_WINDOW_DAYS = 28;
const RECENT_WINDOW_DAYS = 7;
const MIN_SAMPLES_PER_WINDOW = 20;
const Z_ALERT_THRESHOLD = 2.5;

// ---------------------------------------------------------------------------
// Segment definitions — the cartesian keys we scan
// ---------------------------------------------------------------------------

type SegmentDef =
  | { kind: "age_band"; ageBand: string }
  | { kind: "age_band_x_sport"; ageBand: string; sport: string }
  | { kind: "agent_x_rag"; agent: string; hasRag: boolean };

interface DailyRow {
  day: string;
  sport: string | null;
  age_band: string | null;
  agent: string | null;
  has_rag: boolean;
  faithfulness: number | null;
  answer_quality: number | null;
  tone: number | null;
  age_fit: number | null;
  conversational: number | null;
  empathy: number | null;
  personalization: number | null;
  actionability: number | null;
}

// ---------------------------------------------------------------------------
// Pure math helpers
// ---------------------------------------------------------------------------

function meanStd(values: number[]): { mean: number; std: number; n: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, std: 0, n: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (n < 2) return { mean, std: 0, n };
  const variance =
    values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1);
  return { mean, std: Math.sqrt(variance), n };
}

function zScore(
  recent: { mean: number; std: number; n: number },
  baseline: { mean: number; std: number; n: number }
): number {
  if (recent.n < 2 || baseline.n < 2) return 0;
  // Use the baseline std as the reference spread; divide by sqrt of recent n.
  const denom = baseline.std / Math.sqrt(Math.max(1, recent.n));
  if (denom === 0) return 0;
  return (recent.mean - baseline.mean) / denom;
}

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

export interface DriftDetectionResult {
  scanned: number;                   // rows loaded
  segmentsEvaluated: number;
  alertsCreated: number;
  alertsSkippedOpen: number;         // segment already has an open alert
}

export async function runDriftDetection(): Promise<DriftDetectionResult> {
  const db = supabaseAdmin() as any;

  const cutoff = new Date(
    Date.now() - (BASELINE_WINDOW_DAYS + RECENT_WINDOW_DAYS) * 86400000
  ).toISOString();

  const { data, error } = await db
    .from("v_quality_scores_daily_by_segment")
    .select("*")
    .gte("day", cutoff);

  if (error) throw new Error(`drift load failed: ${error.message}`);

  const rows = (data ?? []) as DailyRow[];
  logger.info("[drift] rows loaded", { count: rows.length });

  const segments = enumerateSegments(rows);
  let alertsCreated = 0;
  let alertsSkippedOpen = 0;

  for (const seg of segments) {
    for (const dim of DIMENSION_KEYS) {
      const result = evaluateSegmentDimension(rows, seg, dim);
      if (!result) continue;

      const { zScore: z, baseline, recent } = result;
      if (Math.abs(z) < Z_ALERT_THRESHOLD) continue;

      const segmentKey = serializeSegment(seg);

      // Skip if an open alert already exists for this segment × dimension.
      const { data: existing } = await db
        .from("quality_drift_alerts")
        .select("id")
        .eq("dimension", dim)
        .contains("segment_key", segmentKey)
        .in("status", ["open", "patch_proposed"])
        .limit(1);

      if (existing && existing.length > 0) {
        alertsSkippedOpen++;
        continue;
      }

      await db.from("quality_drift_alerts").insert({
        dimension: dim,
        segment_key: segmentKey,
        baseline_mean: round3(baseline.mean),
        current_mean: round3(recent.mean),
        cusum_value: round3(z), // reuse the column for the z-score
        window_days: RECENT_WINDOW_DAYS,
        status: "open",
      });
      alertsCreated++;

      logger.warn("[drift] ALERT", {
        dimension: dim,
        segment: segmentKey,
        baseline_mean: round3(baseline.mean),
        current_mean: round3(recent.mean),
        z_score: round3(z),
      });
    }
  }

  return {
    scanned: rows.length,
    segmentsEvaluated: segments.length * DIMENSION_KEYS.length,
    alertsCreated,
    alertsSkippedOpen,
  };
}

// ---------------------------------------------------------------------------
// Segment enumeration + evaluation
// ---------------------------------------------------------------------------

function enumerateSegments(rows: DailyRow[]): SegmentDef[] {
  const ageBands = unique(rows.map((r) => r.age_band).filter(Boolean) as string[]);
  const sports = unique(rows.map((r) => r.sport).filter(Boolean) as string[]);
  const agents = unique(rows.map((r) => r.agent).filter(Boolean) as string[]);

  const segs: SegmentDef[] = [];
  for (const a of ageBands) segs.push({ kind: "age_band", ageBand: a });
  for (const a of ageBands) {
    for (const s of sports) segs.push({ kind: "age_band_x_sport", ageBand: a, sport: s });
  }
  for (const g of agents) {
    segs.push({ kind: "agent_x_rag", agent: g, hasRag: true });
    segs.push({ kind: "agent_x_rag", agent: g, hasRag: false });
  }
  return segs;
}

function matchesSegment(row: DailyRow, seg: SegmentDef): boolean {
  switch (seg.kind) {
    case "age_band":
      return row.age_band === seg.ageBand;
    case "age_band_x_sport":
      return row.age_band === seg.ageBand && row.sport === seg.sport;
    case "agent_x_rag":
      return row.agent === seg.agent && row.has_rag === seg.hasRag;
  }
}

function evaluateSegmentDimension(
  rows: DailyRow[],
  seg: SegmentDef,
  dim: Dimension
): { zScore: number; baseline: ReturnType<typeof meanStd>; recent: ReturnType<typeof meanStd> } | null {
  const now = Date.now();
  const recentCutoff = now - RECENT_WINDOW_DAYS * 86400000;

  const segmentRows = rows.filter((r) => matchesSegment(r, seg));
  if (segmentRows.length === 0) return null;

  const recentVals: number[] = [];
  const baselineVals: number[] = [];
  for (const r of segmentRows) {
    const v = r[dim];
    if (v === null || v === undefined) continue;
    const t = new Date(r.day).getTime();
    if (t >= recentCutoff) recentVals.push(v);
    else baselineVals.push(v);
  }

  if (
    recentVals.length < MIN_SAMPLES_PER_WINDOW ||
    baselineVals.length < MIN_SAMPLES_PER_WINDOW
  ) {
    return null;
  }

  const recent = meanStd(recentVals);
  const baseline = meanStd(baselineVals);
  const z = zScore(recent, baseline);
  return { zScore: z, recent, baseline };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function serializeSegment(seg: SegmentDef): Record<string, string | boolean> {
  switch (seg.kind) {
    case "age_band":
      return { kind: "age_band", age_band: seg.ageBand };
    case "age_band_x_sport":
      return { kind: "age_band_x_sport", age_band: seg.ageBand, sport: seg.sport };
    case "agent_x_rag":
      return { kind: "agent_x_rag", agent: seg.agent, has_rag: seg.hasRag };
  }
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
