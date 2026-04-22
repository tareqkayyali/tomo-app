import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * Returns true iff `ai_auto_heal_config.enabled` is TRUE.
 *
 * Use at the top of any cron / service that PROPOSES patches or ACTS on
 * production (e.g., auto-repair-scan writes `proposed_patch`;
 * shadow-evaluate decides promote/rollback).
 *
 * Do NOT use on pure-telemetry paths — drift detection, golden-set
 * curation, eval scoring — those must keep running so we still have
 * observability signal when the loop is intentionally disabled.
 *
 * Fail-closed: on DB error, returns false (treats as disabled) so we
 * don't accidentally act during a Supabase outage.
 */
export async function isAutoHealEnabled(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_auto_heal_config not in generated types until regen
  try {
    const { data, error } = await db
      .from("ai_auto_heal_config")
      .select("enabled")
      .limit(1)
      .maybeSingle();
    if (error) {
      logger.warn("[isAutoHealEnabled] db error; treating as disabled", {
        error: error.message,
      });
      return false;
    }
    return Boolean(data?.enabled);
  } catch (e) {
    logger.warn("[isAutoHealEnabled] unexpected error; treating as disabled", {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
