import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { withCronLog } from "@/lib/cronRunLog";
import {
  triggerSessionNotifications,
  triggerSmartCheckinReminder,
  triggerBedtimeReminder,
  deliverQueuedPushes,
  expireByTTL,
} from "@/services/notifications";

/**
 * POST /api/v1/cron/notifications/tick-15min
 *
 * Every 15 minutes. Self-gating triggers decide whether to fire based on
 * the athlete's local time window — we can safely invoke all of them on
 * every tick. Order matters:
 *   1. expireByTTL      — unblock dedup for time-expired rows
 *   2. sessions         — pre / starting-soon / post journal nudges
 *   3. smart check-in   — context-aware check-in reminder
 *   4. bedtime          — 15–45 min before bedtime (or pre-match sleep)
 *   5. deliverQueued    — release pushes queued during prior quiet hours
 *
 * Idempotent via athlete_notifications.group_key unique constraint.
 * Observability: writes a cron_run_log row with counts + duration.
 */
export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const result = await withCronLog("notifications.tick_15min", async () => {
    const expired = await expireByTTL();
    const sessions = await triggerSessionNotifications();
    const checkin = await triggerSmartCheckinReminder();
    const bedtime = await triggerBedtimeReminder();
    const queueDelivered = await deliverQueuedPushes();

    const processed =
      sessions.preSession +
      sessions.postSession +
      sessions.startingSoon +
      checkin +
      bedtime;

    return {
      processed,
      sent: queueDelivered,
      queued: 0,
      failed: 0,
      details: {
        expired,
        sessions,
        checkin_reminders: checkin,
        bedtime_reminders: bedtime,
        queue_delivered: queueDelivered,
      },
    };
  });

  if (result.status === "failed") {
    return NextResponse.json({ ok: false, ...result }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result });
}
