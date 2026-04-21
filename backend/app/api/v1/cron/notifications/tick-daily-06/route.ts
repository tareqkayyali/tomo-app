import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { withCronLog } from "@/lib/cronRunLog";
import { triggerRestDayReminder } from "@/services/notifications";

/**
 * POST /api/v1/cron/notifications/tick-daily-06
 *
 * Fires once per day at 06:00 athlete-local (default Asia/Riyadh =
 * 03:00 UTC). Detects athletes with elevated ACWR who have no
 * training scheduled today and nudges them to treat it as a rest day.
 *
 * Idempotent: REST_DAY_REMINDER group_key is per day.
 */
export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const result = await withCronLog("notifications.tick_daily_06", async () => {
    const restReminders = await triggerRestDayReminder();
    return {
      processed: restReminders,
      sent: 0,
      details: { rest_day_reminders: restReminders },
    };
  });

  if (result.status === "failed") {
    return NextResponse.json({ ok: false, ...result }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result });
}
