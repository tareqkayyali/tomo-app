/**
 * Shared helper for writing `ai_auto_heal_audit` rows.
 *
 * Used by CQE services (drift, autoRepair, shadow, goldenSet) to log every
 * state transition into the append-only audit trail. Integration mandate #6
 * from project_cqe_phase_0_integration.md.
 *
 * Fail-soft: audit failures are logged but swallowed — they must never
 * block the primary operation (drift alerts still land, shadow runs still
 * decide) even if the audit table is unavailable.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface AuditEvent {
  actor: string;                   // 'cron:name' | 'service:name' | 'admin:email'
  action: string;                  // short verb like 'drift_alert_opened'
  target_table: string;            // table the action touched
  target_id?: string | null;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  reason?: string | null;
}

export async function writeAuditEvent(event: AuditEvent): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_auto_heal_audit not in generated types until regen
  try {
    await db.from("ai_auto_heal_audit").insert({
      actor: event.actor,
      action: event.action,
      target_table: event.target_table,
      target_id: event.target_id ?? null,
      before_state: event.before_state ?? null,
      after_state: event.after_state ?? null,
      reason: event.reason ?? null,
    });
  } catch (e) {
    logger.error("[audit] writeAuditEvent failed", {
      action: event.action,
      target_table: event.target_table,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
