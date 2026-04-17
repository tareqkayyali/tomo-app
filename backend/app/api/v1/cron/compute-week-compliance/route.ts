/**
 * POST /api/v1/cron/compute-week-compliance
 *
 * Weekly job (target: Monday 01:00 local, scheduler-driven). For each
 * `athlete_week_plans` row with status='active' whose week has fully
 * elapsed, compute the compliance_rate + outcome from the actual
 * calendar_events state and transition status to 'completed'.
 *
 * Idempotent: re-running over the same week is a no-op once status flips.
 *
 * Auth: X-Cron-Secret header must match CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { computeCompliance } from "@/services/weekPlan/complianceComputer";

export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const db = supabaseAdmin();

  // Target plans: any active plan whose last day (week_start + 6) is
  // before today. This catches the prior week every Monday run, and also
  // catches any earlier weeks that were skipped (e.g. if the scheduler
  // missed a run).
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);

  const { data: plans, error: fetchErr } = await (db as any)
    .from("athlete_week_plans")
    .select("id, user_id, week_start, calendar_event_ids, plan_items")
    .eq("status", "active")
    .lt("week_start", todayISO);

  if (fetchErr) {
    logger.error("[cron] compute-week-compliance fetch failed", {
      error: fetchErr.message,
    });
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const eligible = (plans ?? []).filter((p: any) => {
    // Only compute for weeks that have fully ended (week_start + 7 days ≤ today).
    const start = new Date(p.week_start);
    const lastDay = new Date(start);
    lastDay.setUTCDate(start.getUTCDate() + 6);
    return lastDay.toISOString().slice(0, 10) < todayISO;
  });

  let computed = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const row of eligible) {
    try {
      const result = await computeCompliance({
        weekPlanId: String(row.id),
        userId: String(row.user_id),
        weekStart: String(row.week_start),
        calendarEventIds: Array.isArray(row.calendar_event_ids)
          ? row.calendar_event_ids.map((s: any) => String(s))
          : [],
        planItems: Array.isArray(row.plan_items) ? row.plan_items : [],
      });

      const { error: updateErr } = await (db as any)
        .from("athlete_week_plans")
        .update({
          compliance_rate: result.complianceRate,
          outcome: result.outcome,
          status: "completed",
        })
        .eq("id", row.id);

      if (updateErr) {
        failures.push({ id: String(row.id), error: updateErr.message });
        logger.error("[cron] compute-week-compliance update failed", {
          planId: row.id,
          error: updateErr.message,
        });
        continue;
      }

      computed++;
      logger.info("[cron] compute-week-compliance row done", {
        planId: row.id,
        userId: row.user_id,
        weekStart: row.week_start,
        complianceRate: result.complianceRate,
        completed: result.outcome.completedSessions,
        skipped: result.outcome.skippedSessions,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ id: String(row.id), error: msg });
      logger.error("[cron] compute-week-compliance row failed", {
        planId: row.id,
        error: msg,
      });
    }
  }

  logger.info("[cron] compute-week-compliance complete", {
    considered: (plans ?? []).length,
    eligible: eligible.length,
    computed,
    failed: failures.length,
  });

  return NextResponse.json({
    ok: true,
    considered: (plans ?? []).length,
    eligible: eligible.length,
    computed,
    failed: failures.length,
    failures: failures.length > 0 ? failures : undefined,
  });
}
