import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { runShadowEvaluation } from "@/services/quality/shadow";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/cron/shadow-evaluate
 *
 * Runs every 15-30 min while any shadow or canary run is active. Pulls
 * quality scores, computes per-dimension Welch t-tests, writes decision
 * into prompt_shadow_runs: promoted | rolled_back | extend.
 */
export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  try {
    const result = await runShadowEvaluation();
    logger.info("[cron] shadow-evaluate complete", { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("[cron] shadow-evaluate failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Shadow eval failed" },
      { status: 500 }
    );
  }
}
