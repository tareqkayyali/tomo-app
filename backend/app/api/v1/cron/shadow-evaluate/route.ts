import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { runShadowEvaluation } from "@/services/quality/shadow";
import { isAutoHealEnabled } from "@/lib/autoHealGate";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/cron/shadow-evaluate
 *
 * Runs every 15-30 min while any shadow or canary run is active. Pulls
 * quality scores, computes per-dimension Welch t-tests, writes decision
 * into prompt_shadow_runs: promoted | rolled_back | extend.
 *
 * Gated on ai_auto_heal_config.enabled — this cron decides variant
 * promotion, which shifts production traffic. When the auto-heal loop is
 * disabled, active shadow runs freeze in place (they stay in 'shadow' /
 * 'canary_*' phase) until the loop is re-enabled and the next evaluation
 * runs. Scoring of turns continues via qualityScorer regardless.
 */
export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  if (!(await isAutoHealEnabled())) {
    logger.info("[cron] shadow-evaluate skipped — ai_auto_heal_config.enabled=false");
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "auto_heal_disabled",
    });
  }

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
