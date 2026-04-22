/**
 * Shadow + Canary evaluator.
 *
 * A prompt_shadow_runs row is created (by ops / admin) when a new system-
 * prompt variant starts shadow or canary. While it's live, quality scores
 * accumulate tagged with that variant elsewhere — for this first cut we
 * compare the variant's cost + aggregate scores against the baseline over
 * the run's time window.
 *
 * The evaluator:
 *   - Pulls chat_quality_scores rows in the run's window
 *   - Aggregates mean score per dimension for the variant and baseline cohorts
 *   - Applies a Welch's t-test per dimension; p < 0.05 + variant >= baseline
 *     on >= 2 of 3 reviewed dims (tone, answer_quality, faithfulness) = promote
 *   - Writes baseline_scores, variant_scores, implicit_delta, p_values,
 *     decision, decision_reason onto the prompt_shadow_runs row.
 *
 * Variant tagging is carried on the chat_quality_scores row via the
 * `trace_id` (prefixed with `variant:<name>:`) OR a sampling_stratum value
 * chosen by the serving layer. This evaluator accepts both.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { writeAuditEvent } from "@/lib/autoHealAudit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const REVIEWED_DIMENSIONS = ["tone", "answer_quality", "faithfulness"] as const;
type ReviewedDim = (typeof REVIEWED_DIMENSIONS)[number];

const MIN_SAMPLES = 30;           // per cohort
const PROMOTE_PVALUE = 0.05;

interface ShadowRunRow {
  id: string;
  variant_name: string;
  variant_commit_hash: string | null;
  phase: string;
  canary_traffic_pct: number | null;
  started_at: string;
  ended_at: string | null;
}

interface ScoreRow {
  trace_id: string;
  sampling_stratum: string;
  a_tone: number | null;
  b_tone: number | null;
  c_tone: number | null;
  a_answer_quality: number | null;
  b_answer_quality: number | null;
  c_answer_quality: number | null;
  a_faithfulness: number | null;
  b_faithfulness: number | null;
  c_faithfulness: number | null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export interface ShadowEvaluationResult {
  runsEvaluated: number;
  runsPromoted: number;
  runsRolledBack: number;
  runsPending: number;
}

export async function runShadowEvaluation(): Promise<ShadowEvaluationResult> {
  const db = supabaseAdmin() as any;

  const { data, error } = await db
    .from("prompt_shadow_runs")
    .select("*")
    .in("phase", ["shadow", "canary_5", "canary_10", "canary_25"])
    .is("decision", null);

  if (error) throw new Error(`shadow load failed: ${error.message}`);

  const runs = (data ?? []) as ShadowRunRow[];
  logger.info("[shadow-eval] runs active", { count: runs.length });

  let runsPromoted = 0;
  let runsRolledBack = 0;
  let runsPending = 0;

  for (const run of runs) {
    const outcome = await evaluateOne(run);

    const patch: Record<string, unknown> = {
      baseline_scores: outcome.baselineScores,
      variant_scores: outcome.variantScores,
      p_values: outcome.pValues,
      turns_evaluated: outcome.variantN + outcome.baselineN,
    };

    if (outcome.decision === "promoted") {
      patch.decision = "promoted";
      patch.decision_reason = outcome.reason;
      patch.phase = "promoted";
      patch.ended_at = new Date().toISOString();
      runsPromoted++;
    } else if (outcome.decision === "rolled_back") {
      patch.decision = "rolled_back";
      patch.decision_reason = outcome.reason;
      patch.phase = "rolled_back";
      patch.ended_at = new Date().toISOString();
      runsRolledBack++;
    } else {
      // Extend — not enough data yet.
      patch.decision_reason = outcome.reason;
      runsPending++;
    }

    await db.from("prompt_shadow_runs").update(patch).eq("id", run.id);

    // Audit (Phase 4, CQE integration mandate #6). Only log terminal
    // decisions (promoted / rolled_back); 'extend' is a non-event.
    if (outcome.decision === "promoted" || outcome.decision === "rolled_back") {
      await writeAuditEvent({
        actor: "cron:shadow-evaluate",
        action:
          outcome.decision === "promoted"
            ? "shadow_run_promoted"
            : "shadow_run_rolled_back",
        target_table: "prompt_shadow_runs",
        target_id: run.id,
        before_state: { phase: run.phase },
        after_state: {
          phase: patch.phase,
          decision: outcome.decision,
          turns_evaluated: outcome.variantN + outcome.baselineN,
        },
        reason: outcome.reason,
      });
    }
  }

  return {
    runsEvaluated: runs.length,
    runsPromoted,
    runsRolledBack,
    runsPending,
  };
}

// ---------------------------------------------------------------------------
// Per-run evaluation
// ---------------------------------------------------------------------------

interface RunOutcome {
  decision: "promoted" | "rolled_back" | "extend";
  reason: string;
  variantN: number;
  baselineN: number;
  variantScores: Record<string, number | null>;
  baselineScores: Record<string, number | null>;
  pValues: Record<string, number | null>;
}

async function evaluateOne(run: ShadowRunRow): Promise<RunOutcome> {
  const db = supabaseAdmin() as any;

  const until = run.ended_at ?? new Date().toISOString();
  const { data, error } = await db
    .from("chat_quality_scores")
    .select(
      `trace_id, sampling_stratum,
       a_tone, b_tone, c_tone,
       a_answer_quality, b_answer_quality, c_answer_quality,
       a_faithfulness, b_faithfulness, c_faithfulness`
    )
    .gte("created_at", run.started_at)
    .lte("created_at", until);

  if (error) {
    return noDataOutcome(`load error: ${error.message}`);
  }

  const rows = (data ?? []) as ScoreRow[];
  const variantPrefix = `variant:${run.variant_name}:`;
  const variantStratum = `variant_${run.variant_name}`;

  const variantRows: ScoreRow[] = [];
  const baselineRows: ScoreRow[] = [];
  for (const r of rows) {
    const isVariant =
      r.trace_id?.startsWith(variantPrefix) ||
      r.sampling_stratum === variantStratum;
    if (isVariant) variantRows.push(r);
    else baselineRows.push(r);
  }

  if (variantRows.length < MIN_SAMPLES || baselineRows.length < MIN_SAMPLES) {
    return {
      decision: "extend",
      reason: `insufficient samples (variant=${variantRows.length}, baseline=${baselineRows.length}, need ≥${MIN_SAMPLES})`,
      variantN: variantRows.length,
      baselineN: baselineRows.length,
      variantScores: {},
      baselineScores: {},
      pValues: {},
    };
  }

  const variantScores: Record<string, number | null> = {};
  const baselineScores: Record<string, number | null> = {};
  const pValues: Record<string, number | null> = {};
  let wins = 0;
  let losses = 0;

  for (const dim of REVIEWED_DIMENSIONS) {
    const vVals = extractDim(variantRows, dim);
    const bVals = extractDim(baselineRows, dim);
    const vm = meanOrNull(vVals);
    const bm = meanOrNull(bVals);
    variantScores[dim] = vm;
    baselineScores[dim] = bm;

    const p = welchTTest(vVals, bVals);
    pValues[dim] = p;

    if (vm !== null && bm !== null && p !== null && p < PROMOTE_PVALUE) {
      if (vm > bm) wins++;
      else if (vm < bm) losses++;
    }
  }

  // Decision rules — must be true:
  //   - no significant loss on any dimension
  //   - significant win on at least 2 dimensions
  if (losses > 0) {
    return {
      decision: "rolled_back",
      reason: `${losses} dimension(s) regressed significantly`,
      variantN: variantRows.length,
      baselineN: baselineRows.length,
      variantScores,
      baselineScores,
      pValues,
    };
  }
  if (wins >= 2) {
    return {
      decision: "promoted",
      reason: `${wins}/${REVIEWED_DIMENSIONS.length} dimensions improved significantly`,
      variantN: variantRows.length,
      baselineN: baselineRows.length,
      variantScores,
      baselineScores,
      pValues,
    };
  }
  return {
    decision: "extend",
    reason: `insufficient signal: ${wins} wins, ${losses} losses — extending`,
    variantN: variantRows.length,
    baselineN: baselineRows.length,
    variantScores,
    baselineScores,
    pValues,
  };
}

function noDataOutcome(reason: string): RunOutcome {
  return {
    decision: "extend",
    reason,
    variantN: 0,
    baselineN: 0,
    variantScores: {},
    baselineScores: {},
    pValues: {},
  };
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

function extractDim(rows: ScoreRow[], dim: ReviewedDim): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const vs = [
      (r as any)[`a_${dim}`],
      (r as any)[`b_${dim}`],
      (r as any)[`c_${dim}`],
    ].filter((v) => v !== null && v !== undefined) as number[];
    if (vs.length === 0) continue;
    out.push(vs.reduce((a, b) => a + b, 0) / vs.length);
  }
  return out;
}

function meanOrNull(vs: number[]): number | null {
  if (vs.length === 0) return null;
  return vs.reduce((a, b) => a + b, 0) / vs.length;
}

/** Welch's two-sample t-test; returns approximate two-tailed p-value. */
export function welchTTest(a: number[], b: number[]): number | null {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 2 || n2 < 2) return null;

  const m1 = a.reduce((s, v) => s + v, 0) / n1;
  const m2 = b.reduce((s, v) => s + v, 0) / n2;
  const v1 = a.reduce((s, v) => s + (v - m1) ** 2, 0) / (n1 - 1);
  const v2 = b.reduce((s, v) => s + (v - m2) ** 2, 0) / (n2 - 1);

  const seDiff = Math.sqrt(v1 / n1 + v2 / n2);
  if (seDiff === 0) return 1;
  const t = (m1 - m2) / seDiff;

  // Welch–Satterthwaite
  const df =
    (v1 / n1 + v2 / n2) ** 2 /
    ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));

  // Two-tailed p from the t CDF approximation
  return 2 * (1 - studentTcdf(Math.abs(t), df));
}

/** Standard Student's-t CDF approximation (Hill's algorithm). Good enough. */
function studentTcdf(t: number, df: number): number {
  const x = df / (t * t + df);
  const beta = incompleteBeta(df / 2, 0.5, x);
  return 1 - 0.5 * beta;
}

function incompleteBeta(a: number, b: number, x: number): number {
  if (x < 0 || x > 1) return 0;
  if (x === 0 || x === 1) return x;

  const bt = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

function betacf(a: number, b: number, x: number): number {
  const maxIter = 100;
  const eps = 3e-7;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

function logGamma(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const t = x + 5.5;
  const s = t - (x + 0.5) * Math.log(t);
  let series = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    series += cof[j] / y;
  }
  return -s + Math.log((2.5066282746310005 * series) / x);
}
