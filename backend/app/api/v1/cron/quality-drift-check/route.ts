import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { runDriftDetection } from "@/services/quality/drift";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/cron/quality-drift-check
 *
 * Run nightly. Scans v_quality_scores_daily_by_segment, computes rolling
 * baseline vs recent means per dimension × segment, opens a
 * quality_drift_alerts row when |z| > 2.5.
 *
 * Auth: X-Cron-Secret header must match CRON_SECRET env var.
 */
export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  try {
    const result = await runDriftDetection();
    logger.info("[cron] quality-drift-check complete", { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("[cron] quality-drift-check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Detection failed" },
      { status: 500 }
    );
  }
}
