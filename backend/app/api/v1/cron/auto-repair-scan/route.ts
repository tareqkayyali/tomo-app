import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { runAutoRepairScan } from "@/services/quality/autoRepair";
import { isAutoHealEnabled } from "@/lib/autoHealGate";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/cron/auto-repair-scan
 *
 * Runs every few hours after drift detection. Matches open drift alerts
 * against auto_repair_patterns and attaches proposed_patch jsonb. If
 * GH_BOT_TOKEN + repo env vars are set, also opens a GitHub issue.
 *
 * Gated on ai_auto_heal_config.enabled — this cron proposes patches,
 * which feed the Phase 5 applier. When the auto-heal loop is
 * intentionally disabled (incident, maintenance, temporary pause), don't
 * write new proposed_patch rows. Drift detection stays live so
 * quality_drift_alerts accumulate; only the patch-proposal step pauses.
 */
export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  if (!(await isAutoHealEnabled())) {
    logger.info("[cron] auto-repair-scan skipped — ai_auto_heal_config.enabled=false");
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "auto_heal_disabled",
    });
  }

  try {
    const result = await runAutoRepairScan();
    logger.info("[cron] auto-repair-scan complete", { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("[cron] auto-repair-scan failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Auto-repair failed" },
      { status: 500 }
    );
  }
}
