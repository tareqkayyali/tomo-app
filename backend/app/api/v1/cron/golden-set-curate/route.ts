import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { runGoldenSetCuration } from "@/services/quality/goldenSet";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/cron/golden-set-curate
 *
 * Runs weekly. Adds top 10 lowest-scoring live turns from the past 7 days
 * as candidate regression scenarios; schedules durable passes for removal;
 * tops up the frozen regression-canary set toward 20% of total.
 */
export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  try {
    const result = await runGoldenSetCuration();
    logger.info("[cron] golden-set-curate complete", { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("[cron] golden-set-curate failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Curation failed" },
      { status: 500 }
    );
  }
}
