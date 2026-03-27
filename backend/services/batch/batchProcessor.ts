/**
 * Batch Processor — wraps Anthropic Message Batches API for background jobs.
 * 50% cheaper than standard API. Results available within 1 hour.
 *
 * Usage:
 *   1. Queue batch requests via queueBatchRequest()
 *   2. Submit the batch via submitBatch()
 *   3. Poll for results via pollBatchResults()
 *   4. Process results via processBatchResults()
 *
 * @see https://docs.anthropic.com/en/api/creating-message-batches
 */

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return client;
}

/** A single request in a batch */
export interface BatchRequest {
  customId: string; // e.g. "program_refresh_<athleteId>"
  model: string;
  maxTokens: number;
  temperature?: number;
  system: string;
  userMessage: string;
  metadata?: Record<string, any>; // stored in DB for result processing
}

/** Submit a batch of requests to the Anthropic Batches API */
export async function submitBatch(
  requests: BatchRequest[],
  batchType: string // e.g. "program_refresh", "rec_refresh"
): Promise<{ batchId: string; requestCount: number }> {
  if (requests.length === 0) {
    return { batchId: "", requestCount: 0 };
  }

  const anthropic = getClient();

  // Build the batch requests in Anthropic format
  const batchRequests = requests.map((r) => ({
    custom_id: r.customId,
    params: {
      model: r.model,
      max_tokens: r.maxTokens,
      temperature: r.temperature,
      system: r.system,
      messages: [{ role: "user" as const, content: r.userMessage }],
    },
  }));

  // Submit to Anthropic Batches API
  const batch = await (anthropic.messages.batches as any).create({
    requests: batchRequests,
  });

  const batchId = batch.id;

  // Store batch metadata in our DB for tracking
  const db = supabaseAdmin();
  await (db as any).from("batch_jobs").insert({
    batch_id: batchId,
    batch_type: batchType,
    request_count: requests.length,
    status: "processing",
    metadata: requests.map((r) => ({ customId: r.customId, metadata: r.metadata })),
    created_at: new Date().toISOString(),
  });

  logger.info("[batch] Submitted", {
    batchId,
    batchType,
    requestCount: requests.length,
  });

  return { batchId, requestCount: requests.length };
}

/** Check batch status and retrieve results if complete */
export async function pollBatchResults(batchId: string): Promise<{
  status: "processing" | "ended" | "failed";
  results?: Array<{ customId: string; text: string; error?: string }>;
}> {
  const anthropic = getClient();

  const batch = await (anthropic.messages.batches as any).retrieve(batchId);

  if (batch.processing_status === "in_progress") {
    return { status: "processing" };
  }

  if (batch.processing_status === "ended") {
    // Retrieve results
    const results: Array<{ customId: string; text: string; error?: string }> = [];

    // Stream results from the batch
    const resultStream = await (anthropic.messages.batches as any).results(batchId);
    for await (const result of resultStream) {
      if (result.result?.type === "succeeded") {
        const text = result.result.message.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");
        results.push({ customId: result.custom_id, text });
      } else {
        results.push({
          customId: result.custom_id,
          text: "",
          error: result.result?.error?.message ?? "Batch request failed",
        });
      }
    }

    // Update DB status
    const db = supabaseAdmin();
    await (db as any).from("batch_jobs").update({
      status: "ended",
      result_count: results.length,
      completed_at: new Date().toISOString(),
    }).eq("batch_id", batchId);

    logger.info("[batch] Completed", { batchId, resultCount: results.length });

    return { status: "ended", results };
  }

  return { status: "failed" };
}

/**
 * Helper: Build batch requests for deep program refresh.
 * Call this with a list of athlete IDs, then submitBatch().
 */
export function buildProgramRefreshBatchRequests(
  athletes: Array<{ athleteId: string; systemPrompt: string; userPrompt: string }>
): BatchRequest[] {
  return athletes.map((a) => ({
    customId: `program_refresh_${a.athleteId}`,
    model: process.env.ANTHROPIC_PROGRAM_MODEL || "claude-haiku-4-5-20251001",
    maxTokens: 4000,
    temperature: 0.3,
    system: a.systemPrompt,
    userMessage: a.userPrompt,
    metadata: { athleteId: a.athleteId },
  }));
}

/**
 * Helper: Build batch requests for deep recommendation refresh.
 */
export function buildRecRefreshBatchRequests(
  athletes: Array<{ athleteId: string; systemPrompt: string; userPrompt: string }>
): BatchRequest[] {
  return athletes.map((a) => ({
    customId: `rec_refresh_${a.athleteId}`,
    model: process.env.ANTHROPIC_REC_MODEL || "claude-haiku-4-5-20251001",
    maxTokens: 4500,
    temperature: 0.5,
    system: a.systemPrompt,
    userMessage: a.userPrompt,
    metadata: { athleteId: a.athleteId },
  }));
}
