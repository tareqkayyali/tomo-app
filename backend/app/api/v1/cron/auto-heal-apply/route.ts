import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { runApplierOnce } from "@/services/autoHeal/applier";
import { isAutoHealEnabled } from "@/lib/autoHealGate";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/cron/auto-heal-apply
 *
 * Runs every 30 min. Picks up proposed ai_fixes rows (author=cqe-autorepair,
 * status=proposed), applies each patch via the GitHub API, opens an
 * `auto-heal-pending-review` PR, updates fix + parent-issue lifecycle.
 *
 * Kill-switch gated (ai_auto_heal_config.enabled). Blocked_paths and
 * rate-limit enforcement happens inside runApplierOnce() per-fix — this
 * handler adds a fast short-circuit when the whole loop is off.
 *
 * Required env: GH_BOT_TOKEN, GH_REPO_OWNER, GH_REPO_NAME (GH_BASE_BRANCH
 * optional, defaults 'main'). Without these the applier is inert.
 */
export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  if (!(await isAutoHealEnabled())) {
    logger.info("[cron] auto-heal-apply skipped — ai_auto_heal_config.enabled=false");
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "auto_heal_disabled",
    });
  }

  try {
    const result = await runApplierOnce();
    logger.info("[cron] auto-heal-apply complete", {
      candidates: result.totalCandidates,
      applied: result.applied,
      skipped: result.skipped,
      errors: result.errors,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("[cron] auto-heal-apply failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "applier failed" },
      { status: 500 },
    );
  }
}
