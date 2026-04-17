/**
 * Judge B — GPT-4o-mini (OpenAI, cross-family).
 *
 * Same rubric as Judge A (shared from judgeRubric.ts) so score differences
 * reflect model differences, not prompt differences. Telemetry is written
 * to `api_usage_log` with agent_type='quality_judge_b' for unified cost
 * tracking alongside the Anthropic judges.
 *
 * Why GPT-4o-mini: see docs vendor analysis — best grading quality on
 * nuanced rubrics in the cross-family set, mature handling of pain /
 * injury / emotional content without over-blocking, predictable rate
 * limits at 50K MAU scale.
 */

import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { AthleteContext, LLMJudgeResult, TurnCapture } from "./types";
import {
  JUDGE_RUBRIC,
  type JudgeTriggers,
  buildUserPrompt,
  parseJudgeJson,
  toDimensionScores,
} from "./judgeRubric";

// ---------------------------------------------------------------------------
// Pricing for GPT-4o-mini. Authoritative source: OpenAI pricing page.
// Mirrored here so cost calc doesn't depend on an external fetch.
// ---------------------------------------------------------------------------

const OPENAI_JUDGE_MODEL = "gpt-4o-mini";

const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },   // per 1M tokens
  default:       { input: 0.15, output: 0.60 },
};

function calcOpenAICost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const p = OPENAI_PRICING[model] ?? OPENAI_PRICING.default;
  return (
    (promptTokens / 1_000_000) * p.input +
    (completionTokens / 1_000_000) * p.output
  );
}

// ---------------------------------------------------------------------------
// Singleton client — constructed only when an API key is present.
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;
let _clientMissingLogged = false;

export function getOpenAIClient(): OpenAI | null {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (!_clientMissingLogged) {
      logger.info("[quality-judge-b] OPENAI_API_KEY not set — Judge B disabled");
      _clientMissingLogged = true;
    }
    return null;
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

// ---------------------------------------------------------------------------
// Telemetry (mirrors trackedClaudeCall's api_usage_log schema so admin
// dashboards can aggregate cost across vendors uniformly)
// ---------------------------------------------------------------------------

function logTelemetry(args: {
  userId: string;
  sessionId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}): void {
  try {
    (supabaseAdmin() as any)
      .from("api_usage_log")
      .insert({
        user_id: args.userId,
        session_id: args.sessionId ?? null,
        agent_type: "quality_judge_b",
        model: args.model,
        input_tokens: args.inputTokens,
        output_tokens: args.outputTokens,
        cache_write_tokens: 0,
        cache_read_tokens: 0,
        estimated_cost_usd: args.costUsd,
        latency_ms: args.latencyMs,
      })
      .then(() => {})
      .catch(() => {});
  } catch {
    /* noop */
  }

  logger.info("[API-COST]", {
    model: args.model,
    agent: "quality_judge_b",
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    costUSD: args.costUsd.toFixed(6),
    latencyMs: args.latencyMs,
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runOpenAIJudge(
  turn: TurnCapture,
  ctx: AthleteContext,
  flags: JudgeTriggers,
  client: OpenAI
): Promise<LLMJudgeResult> {
  const start = Date.now();

  const resp = await client.chat.completions.create({
    model: OPENAI_JUDGE_MODEL,
    max_tokens: 400,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: JUDGE_RUBRIC },
      { role: "user", content: buildUserPrompt(turn, ctx, flags) },
    ],
  });

  const latencyMs = Date.now() - start;
  const text = resp.choices[0]?.message?.content ?? "";
  const promptTokens = resp.usage?.prompt_tokens ?? 0;
  const completionTokens = resp.usage?.completion_tokens ?? 0;
  const costUsd = calcOpenAICost(OPENAI_JUDGE_MODEL, promptTokens, completionTokens);

  logTelemetry({
    userId: turn.userId,
    sessionId: turn.sessionId,
    model: OPENAI_JUDGE_MODEL,
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    costUsd,
    latencyMs,
  });

  const parsed = parseJudgeJson(text);
  const scores = toDimensionScores(parsed, flags);

  return {
    scores,
    reasoning: parsed?.reasoning ?? "",
    model: OPENAI_JUDGE_MODEL,
    costUsd,
    latencyMs,
  };
}
