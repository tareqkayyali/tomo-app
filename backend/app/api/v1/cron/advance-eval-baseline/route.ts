import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { advanceEvalBaseline } from "@/services/evals/baselineAdvance";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/cron/advance-eval-baseline
 *
 * Runs daily at 05:00 UTC (one hour after the nightly eval completes).
 * Advances `ai_eval_baselines.active` if the last 3 nightly runs are all
 * status='passed'. No-op otherwise. Every advance writes an
 * `ai_auto_heal_audit` row.
 *
 * Auth: X-Cron-Secret header matching CRON_SECRET env var.
 */
export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  try {
    const result = await advanceEvalBaseline();
    logger.info("[cron] advance-eval-baseline complete", { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("[cron] advance-eval-baseline failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "advance failed",
      },
      { status: 500 },
    );
  }
}
