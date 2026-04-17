/**
 * Golden-set curator.
 *
 * Weekly cron picks the top low-scoring live turns from the past 7 days and
 * proposes them as golden_test_scenarios rows with source='live_low_score'.
 * Scenarios that have consistently passed for 4+ consecutive eval runs are
 * rotated out (unless they're frozen regression canaries).
 *
 * Promotion is additive-only for safety — the curator never DELETES rows.
 * It marks them with `scheduled_removal_at`; a separate admin review removes
 * or freezes them. Frozen regression canaries are never scheduled for removal.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { DIMENSION_KEYS } from "./judgeRubric";

// ---------------------------------------------------------------------------
// Knobs
// ---------------------------------------------------------------------------

const LOOKBACK_DAYS = 7;
const TOP_N_TO_ADD = 10;
const TARGET_FROZEN_PCT = 0.20;
const CONSECUTIVE_PASSES_BEFORE_REMOVAL = 4;
const SUITE_ASSIGNMENT_DEFAULT = "s1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoreRow {
  id: string;
  turn_id: string;
  sport: string | null;
  age_band: string | null;
  agent: string | null;
  user_message_snippet: string | null;
  assistant_response_snippet: string | null;
  // Judge fields used for mean score aggregation
  a_tone: number | null;   b_tone: number | null;   c_tone: number | null;
  a_answer_quality: number | null; b_answer_quality: number | null; c_answer_quality: number | null;
  a_faithfulness: number | null;   b_faithfulness: number | null;   c_faithfulness: number | null;
  a_age_fit: number | null;        b_age_fit: number | null;        c_age_fit: number | null;
  a_conversational: number | null; b_conversational: number | null; c_conversational: number | null;
  a_empathy: number | null;        b_empathy: number | null;        c_empathy: number | null;
  a_personalization: number | null; b_personalization: number | null; c_personalization: number | null;
  a_actionability: number | null;  b_actionability: number | null;  c_actionability: number | null;
  disagreement_max: number | null;
  created_at: string;
}

interface GoldenRow {
  id: string;
  scenario_key: string;
  is_frozen: boolean;
  source: string;
  consecutive_passes: number;
  last_passing_score: number | null;
  scheduled_removal_at: string | null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export interface GoldenCurationResult {
  addedCandidates: number;
  scheduledForRemoval: number;
  unscheduledRemoval: number;
  totalFrozen: number;
  totalGolden: number;
  duplicatesSkipped: number;
}

export async function runGoldenSetCuration(): Promise<GoldenCurationResult> {
  const db = supabaseAdmin() as any;

  const candidates = await findLowScoringCandidates();
  const { data: existing, error } = await db
    .from("golden_test_scenarios")
    .select("id, scenario_key, is_frozen, source, consecutive_passes, last_passing_score, scheduled_removal_at");
  if (error) throw new Error(`golden set load failed: ${error.message}`);

  const existingRows = (existing ?? []) as GoldenRow[];
  const existingKeys = new Set(existingRows.map((r) => r.scenario_key));

  let addedCandidates = 0;
  let duplicatesSkipped = 0;
  for (const cand of candidates.slice(0, TOP_N_TO_ADD)) {
    const key = candidateKey(cand);
    if (existingKeys.has(key)) {
      duplicatesSkipped++;
      continue;
    }
    if (!cand.user_message_snippet) continue;
    await db.from("golden_test_scenarios").insert({
      scenario_key: key,
      suite: SUITE_ASSIGNMENT_DEFAULT,
      user_message: cand.user_message_snippet,
      expected_agent: cand.agent,
      expected_signals: {
        source_turn_id: cand.turn_id,
        source_created_at: cand.created_at,
        sport: cand.sport,
        age_band: cand.age_band,
        mean_score: cand.mean_score,
        disagreement_max: cand.disagreement_max,
      },
      source: "live_low_score",
      is_frozen: false,
    });
    addedCandidates++;
  }

  // Rotate out durable passes, unless frozen or regression canary.
  let scheduledForRemoval = 0;
  let unscheduledRemoval = 0;
  const now = new Date().toISOString();
  for (const row of existingRows) {
    if (row.is_frozen) continue;
    if (row.source === "regression_canary") continue;

    if (
      row.consecutive_passes >= CONSECUTIVE_PASSES_BEFORE_REMOVAL &&
      (row.last_passing_score ?? 0) >= 0.9
    ) {
      if (!row.scheduled_removal_at) {
        await db
          .from("golden_test_scenarios")
          .update({ scheduled_removal_at: now })
          .eq("id", row.id);
        scheduledForRemoval++;
      }
    } else if (
      row.scheduled_removal_at &&
      (row.consecutive_passes < CONSECUTIVE_PASSES_BEFORE_REMOVAL ||
        (row.last_passing_score ?? 0) < 0.9)
    ) {
      // Un-schedule if the scenario is failing again.
      await db
        .from("golden_test_scenarios")
        .update({ scheduled_removal_at: null })
        .eq("id", row.id);
      unscheduledRemoval++;
    }
  }

  // Top up the frozen regression-canary set toward the target pct.
  const totalNow = existingRows.length + addedCandidates;
  const frozenNow = existingRows.filter((r) => r.is_frozen).length;
  const targetFrozen = Math.floor(totalNow * TARGET_FROZEN_PCT);
  if (frozenNow < targetFrozen) {
    const needed = targetFrozen - frozenNow;
    // Freeze the oldest non-frozen non-removed curated rows.
    const { data: freezable } = await db
      .from("golden_test_scenarios")
      .select("id")
      .eq("is_frozen", false)
      .is("scheduled_removal_at", null)
      .neq("source", "regression_canary")
      .order("added_at", { ascending: true })
      .limit(needed);
    for (const row of freezable ?? []) {
      await db
        .from("golden_test_scenarios")
        .update({ is_frozen: true, source: "regression_canary" })
        .eq("id", (row as { id: string }).id);
    }
  }

  const { count: totalGolden } = await db
    .from("golden_test_scenarios")
    .select("id", { count: "exact", head: true });
  const { count: totalFrozen } = await db
    .from("golden_test_scenarios")
    .select("id", { count: "exact", head: true })
    .eq("is_frozen", true);

  logger.info("[golden-set] curation run complete", {
    addedCandidates,
    scheduledForRemoval,
    unscheduledRemoval,
    totalFrozen: totalFrozen ?? 0,
    totalGolden: totalGolden ?? 0,
  });

  return {
    addedCandidates,
    scheduledForRemoval,
    unscheduledRemoval,
    totalFrozen: totalFrozen ?? 0,
    totalGolden: totalGolden ?? 0,
    duplicatesSkipped,
  };
}

// ---------------------------------------------------------------------------
// Candidate discovery
// ---------------------------------------------------------------------------

async function findLowScoringCandidates(): Promise<Array<ScoreRow & { mean_score: number }>> {
  const db = supabaseAdmin() as any;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();

  const { data, error } = await db
    .from("chat_quality_scores")
    .select(
      `id, turn_id, sport, age_band, agent, user_message_snippet, assistant_response_snippet,
       a_tone, b_tone, c_tone,
       a_answer_quality, b_answer_quality, c_answer_quality,
       a_faithfulness, b_faithfulness, c_faithfulness,
       a_age_fit, b_age_fit, c_age_fit,
       a_conversational, b_conversational, c_conversational,
       a_empathy, b_empathy, c_empathy,
       a_personalization, b_personalization, c_personalization,
       a_actionability, b_actionability, c_actionability,
       disagreement_max, created_at`
    )
    .gte("created_at", since)
    .in("sampling_stratum", ["fallthrough", "low_confidence_intent", "safety_triggered"])
    .limit(500);

  if (error) {
    logger.warn("[golden-set] candidate load failed", { error: error.message });
    return [];
  }

  const rows = (data ?? []) as ScoreRow[];
  return rows
    .map((r) => ({ ...r, mean_score: meanScoreAcrossDims(r) }))
    .filter((r) => r.mean_score !== null && r.user_message_snippet)
    .map((r) => ({ ...r, mean_score: r.mean_score as number }))
    .sort((a, b) => a.mean_score - b.mean_score);
}

function meanScoreAcrossDims(r: ScoreRow): number | null {
  const vals: number[] = [];
  for (const dim of DIMENSION_KEYS) {
    for (const judge of ["a", "b", "c"] as const) {
      const v = (r as any)[`${judge}_${dim}`];
      if (typeof v === "number") vals.push(v);
    }
  }
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function candidateKey(
  r: ScoreRow & { mean_score: number }
): string {
  // Stable, human-readable key — age_band:sport:short_hash_of_message
  const ab = r.age_band ?? "unknown";
  const sp = r.sport ?? "unknown";
  const hash = shortHash(r.user_message_snippet ?? r.turn_id);
  return `live_${ab}_${sp}_${hash}`;
}

function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
