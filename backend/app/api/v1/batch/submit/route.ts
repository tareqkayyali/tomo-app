/**
 * POST /api/v1/batch/submit
 *
 * Submit a batch of background AI jobs (program refresh, rec refresh).
 * Uses Anthropic Message Batches API — 50% cheaper than standard API.
 *
 * Body: { type: "program_refresh" | "rec_refresh", athleteIds?: string[] }
 * If athleteIds is omitted, processes all stale athletes.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  submitBatch,
  buildProgramRefreshBatchRequests,
  buildRecRefreshBatchRequests,
} from "@/services/batch/batchProcessor";

import { buildPlayerContext } from "@/services/agents/contextBuilder";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  let body: { type: string; athleteIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const batchType = body.type;
  if (!["program_refresh", "rec_refresh"].includes(batchType)) {
    return NextResponse.json({ error: "Invalid batch type" }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();

    // Get athlete IDs — either specified or all stale
    let athleteIds = body.athleteIds;
    if (!athleteIds || athleteIds.length === 0) {
      // Get all athletes with stale data (last refresh > 24h ago)
      const staleThreshold = new Date(Date.now() - 24 * 3600000).toISOString();
      const { data: staleAthletes } = await db
        .from("users")
        .select("id")
        .lt("updated_at", staleThreshold)
        .limit(100); // Cap at 100 per batch

      athleteIds = (staleAthletes ?? []).map((a: any) => a.id);
    }

    if (athleteIds.length === 0) {
      return NextResponse.json({ message: "No athletes need refresh", batchId: null, count: 0 });
    }

    // Build prompts for each athlete
    const requests = [];
    for (const athleteId of athleteIds) {
      try {
        const context = await buildPlayerContext(athleteId, "Dashboard");
        const athleteSummary = `Name: ${context.name}, Sport: ${context.sport}, Age Band: ${context.ageBand}, Position: ${context.position ?? "unknown"}, Readiness: ${context.readinessScore ?? "unknown"}.`;

        if (batchType === "program_refresh") {
          requests.push({
            athleteId,
            systemPrompt: "You are an elite sports performance director. Generate personalized multi-week training program recommendations for young athletes. Return JSON with selectedPrograms array.",
            userPrompt: `Generate training program recommendations for this athlete. ${athleteSummary}`,
          });
        } else {
          requests.push({
            athleteId,
            systemPrompt: "You are a sports science recommendation engine. Generate 4-6 personalized, actionable recommendations covering readiness, load, recovery, development, and academic balance.",
            userPrompt: `Generate personalized recommendations for this athlete. ${athleteSummary}`,
          });
        }
      } catch (err) {
        logger.warn("[batch-submit] Failed to build context for athlete", { athleteId, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const batchRequests = batchType === "program_refresh"
      ? buildProgramRefreshBatchRequests(requests)
      : buildRecRefreshBatchRequests(requests);

    const result = await submitBatch(batchRequests, batchType);

    return NextResponse.json({
      message: `Batch submitted: ${result.requestCount} athletes`,
      batchId: result.batchId,
      count: result.requestCount,
    });
  } catch (err) {
    logger.error("[batch-submit] Error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Batch submission failed" }, { status: 500 });
  }
}
