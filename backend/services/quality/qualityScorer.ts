/**
 * Aggregation + persistence for the Quality Track.
 *
 * The actual judging lives in:
 *   - anthropicJudge.ts  (Judge A — Claude Haiku)
 *   - openaiJudge.ts     (Judge B — GPT-4o-mini)
 *   - ruleJudges.ts      (Judge C — deterministic heuristics)
 *
 * This module:
 *   1. Combines their scores into a single chat_quality_scores row
 *   2. Computes max pairwise disagreement across all three judges
 *   3. Flags for human review when max disagreement > 0.3
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type {
  DimensionScores,
  LLMJudgeResult,
  RuleJudgeResult,
  SamplingStratum,
  TurnCapture,
  AthleteContext,
} from "./types";
import { DIMENSION_KEYS } from "./judgeRubric";

// ---------------------------------------------------------------------------
// Disagreement — max pairwise |X - Y| over dimensions graded by both judges.
// A null on either side means the dimension is not applicable for that judge
// and is excluded from that pair. If fewer than two judges returned values
// for a given dimension, that dimension can't disagree and is skipped.
// ---------------------------------------------------------------------------

export function computeDisagreement(
  a: DimensionScores | null,
  b: DimensionScores | null,
  c: DimensionScores
): number {
  const pairs: Array<[DimensionScores, DimensionScores]> = [];
  if (a) pairs.push([a, c]);
  if (b) pairs.push([b, c]);
  if (a && b) pairs.push([a, b]);

  let max = 0;
  for (const [x, y] of pairs) {
    for (const k of DIMENSION_KEYS) {
      const xv = x[k];
      const yv = y[k];
      if (xv === null || yv === null) continue;
      const d = Math.abs(xv - yv);
      if (d > max) max = d;
    }
  }
  return Math.round(max * 100) / 100;
}

// ---------------------------------------------------------------------------
// Persistence — one insert per sampled turn
// ---------------------------------------------------------------------------

export interface PersistArgs {
  turn: TurnCapture;
  ctx: AthleteContext;
  stratum: SamplingStratum;
  empathyTriggered: boolean;
  actionTriggered: boolean;
  judgeA: LLMJudgeResult | null;
  judgeB: LLMJudgeResult | null;
  judgeC: RuleJudgeResult;
  disagreementMax: number;
}

export async function persistQualityRow(args: PersistArgs): Promise<void> {
  try {
    const db = supabaseAdmin() as any;
    const a = args.judgeA?.scores;
    const b = args.judgeB?.scores;
    const c = args.judgeC.scores;
    const needsReview = args.disagreementMax > 0.3;

    const { error } = await db.from("chat_quality_scores").insert({
      trace_id: args.turn.traceId,
      turn_id: args.turn.turnId,
      session_id: args.turn.sessionId,
      user_id: args.turn.userId,
      sport: args.ctx.sport,
      age_band: args.ctx.ageBand,
      agent: args.turn.agent,
      has_rag: args.turn.hasRag,
      sampling_stratum: args.stratum,
      empathy_triggered: args.empathyTriggered,
      action_triggered: args.actionTriggered,

      // Snippets for golden-set curation (Phase 5). First 500 chars only.
      user_message_snippet: args.turn.userMessage.slice(0, 500),
      assistant_response_snippet: args.turn.assistantResponse.slice(0, 500),

      // Judge A — Claude Haiku
      a_faithfulness: a?.faithfulness ?? null,
      a_answer_quality: a?.answer_quality ?? null,
      a_tone: a?.tone ?? null,
      a_age_fit: a?.age_fit ?? null,
      a_conversational: a?.conversational ?? null,
      a_empathy: a?.empathy ?? null,
      a_personalization: a?.personalization ?? null,
      a_actionability: a?.actionability ?? null,
      a_model: args.judgeA?.model ?? null,
      a_cost_usd: args.judgeA?.costUsd ?? null,
      a_latency_ms: args.judgeA?.latencyMs ?? null,

      // Judge B — GPT-4o-mini (cross-family)
      b_faithfulness: b?.faithfulness ?? null,
      b_answer_quality: b?.answer_quality ?? null,
      b_tone: b?.tone ?? null,
      b_age_fit: b?.age_fit ?? null,
      b_conversational: b?.conversational ?? null,
      b_empathy: b?.empathy ?? null,
      b_personalization: b?.personalization ?? null,
      b_actionability: b?.actionability ?? null,
      b_model: args.judgeB?.model ?? null,
      b_cost_usd: args.judgeB?.costUsd ?? null,
      b_latency_ms: args.judgeB?.latencyMs ?? null,

      // Judge C — deterministic rules
      c_faithfulness: c.faithfulness,
      c_answer_quality: c.answer_quality,
      c_tone: c.tone,
      c_age_fit: c.age_fit,
      c_conversational: c.conversational,
      c_empathy: c.empathy,
      c_personalization: c.personalization,
      c_actionability: c.actionability,

      disagreement_max: args.disagreementMax,
      needs_human_review: needsReview,
    });

    if (error) {
      logger.warn("[quality-scorer] row insert failed", { error: error.message });
    }
  } catch (err) {
    logger.warn("[quality-scorer] row insert threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
