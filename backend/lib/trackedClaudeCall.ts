/**
 * trackedClaudeCall — Wraps Anthropic API calls with usage telemetry.
 * Logs input/output tokens, cache metrics, estimated cost, and latency
 * to the api_usage_log table (fire-and-forget, never blocks response).
 */

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ── Pricing (per million tokens) — update when models change ──────
const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.0, cacheRead: 0.08, cacheWrite: 1.0 },
  // Fallback for unknown models
  default: { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
};

function calculateCost(
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null },
  model: string
): number {
  const p = PRICING[model] ?? PRICING.default;
  const inputTokens = usage.input_tokens - (usage.cache_read_input_tokens ?? 0) - (usage.cache_creation_input_tokens ?? 0);
  return (
    (inputTokens / 1_000_000) * p.input +
    (usage.output_tokens / 1_000_000) * p.output +
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * p.cacheRead +
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * p.cacheWrite
  );
}

export interface TrackedCallMeta {
  userId: string;
  sessionId?: string | null;
  agentType: string;         // 'output' | 'timeline' | 'mastery' | 'classifier' | 'rec_refresh' | 'semantic_extract'
  intentId?: string | null;
  classificationLayer?: string | null;
}

/**
 * Call Claude API with automatic usage tracking.
 * Logs are fire-and-forget — never delays the response.
 */
export async function trackedClaudeCall(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  meta: TrackedCallMeta
): Promise<Anthropic.Message> {
  const start = Date.now();
  const response = await client.messages.create(params);
  const latencyMs = Date.now() - start;

  const usage = response.usage;
  const cost = calculateCost(usage, params.model);

  // Fire-and-forget telemetry insert (table may not exist yet — graceful fail)
  try {
    (supabaseAdmin() as any)
      .from("api_usage_log")
      .insert({
        user_id: meta.userId,
        session_id: meta.sessionId ?? null,
        agent_type: meta.agentType,
        model: params.model,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_write_tokens: (usage as any).cache_creation_input_tokens ?? 0,
        cache_read_tokens: (usage as any).cache_read_input_tokens ?? 0,
        estimated_cost_usd: cost,
        latency_ms: latencyMs,
        classification_layer: meta.classificationLayer ?? null,
        intent_id: meta.intentId ?? null,
      })
      .then(() => {})
      .catch(() => {}); // Silent fail if table doesn't exist yet
  } catch { /* noop */ }

  // Also log to console for immediate visibility
  logger.info("[API-COST]", {
    model: params.model,
    agent: meta.agentType,
    intent: meta.intentId,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheRead: (usage as any).cache_read_input_tokens ?? 0,
    cacheWrite: (usage as any).cache_creation_input_tokens ?? 0,
    costUSD: cost.toFixed(6),
    latencyMs,
  });

  return response;
}

/**
 * Get daily cost summary (for dashboard/admin).
 */
export async function getDailyCostSummary(days: number = 7) {
  const { data, error } = await (supabaseAdmin() as any).from("api_usage_log").select("*").gte("created_at", new Date(Date.now() - days * 86400000).toISOString()).order("created_at", { ascending: false });
  if (error) {
    logger.error("Failed to get daily costs", { error: error.message });
    return [];
  }
  return data;
}
