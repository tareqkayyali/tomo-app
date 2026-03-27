/**
 * POST /api/v1/batch/poll
 *
 * Poll a batch job for completion and process results.
 * Call this periodically (e.g. every 5 minutes) to check if batches are done.
 *
 * Body: { batchId: string }
 * Returns: { status: "processing" | "ended" | "failed", resultCount?: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { pollBatchResults } from "@/services/batch/batchProcessor";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  let body: { batchId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.batchId) {
    return NextResponse.json({ error: "batchId is required" }, { status: 400 });
  }

  try {
    const result = await pollBatchResults(body.batchId);

    if (result.status === "processing") {
      return NextResponse.json({ status: "processing", message: "Batch still processing..." });
    }

    if (result.status === "ended" && result.results) {
      const succeeded = result.results.filter((r) => !r.error).length;
      const failed = result.results.filter((r) => r.error).length;

      logger.info("[batch-poll] Results ready", {
        batchId: body.batchId,
        succeeded,
        failed,
      });

      return NextResponse.json({
        status: "ended",
        resultCount: result.results.length,
        succeeded,
        failed,
        // Don't return full results in API — they're stored in DB
      });
    }

    return NextResponse.json({ status: "failed", message: "Batch failed" });
  } catch (err) {
    logger.error("[batch-poll] Error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Poll failed" }, { status: 500 });
  }
}
