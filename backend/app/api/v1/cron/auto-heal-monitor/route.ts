import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { runPostMergeMonitor } from "@/services/autoHeal/postMergeMonitor";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/cron/auto-heal-monitor
 *
 * Runs hourly. Three responsibilities:
 *   1. Detect newly merged or closed auto-heal PRs via GH API
 *   2. Assess active ai_post_merge_watch rows for regressions in their window
 *   3. Finalize expired watches to 'clean' or 'reverted'
 *
 * Not kill-switch gated — telemetry stays live so the CMS dashboard
 * reflects watch state even when the loop is disabled.
 */
export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  try {
    const result = await runPostMergeMonitor();
    logger.info("[cron] auto-heal-monitor complete", { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("[cron] auto-heal-monitor failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "monitor failed" },
      { status: 500 },
    );
  }
}
