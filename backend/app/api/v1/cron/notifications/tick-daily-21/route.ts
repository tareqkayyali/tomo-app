import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { withCronLog } from "@/lib/cronRunLog";
import { triggerStreakAtRisk } from "@/services/notifications";

/**
 * POST /api/v1/cron/notifications/tick-daily-21
 *
 * Fires once per day at 21:00 athlete-local. Railway should schedule
 * this at each hour mark; the trigger self-gates by streak length
 * (>= 5 days) and last_checkin_at, so a single schedule entry per
 * supported timezone offset is acceptable. If we scale to athletes
 * across many timezones, move to per-athlete timezone-aware fan-out.
 *
 * For now: scheduled once at 18:00 UTC (= 21:00 Asia/Riyadh default).
 *
 * Idempotent via group_key dedup (STREAK_AT_RISK group key is per day).
 */
export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const result = await withCronLog("notifications.tick_daily_21", async () => {
    const streakAtRisk = await triggerStreakAtRisk();
    return {
      processed: streakAtRisk,
      sent: 0,
      details: { streak_at_risk: streakAtRisk },
    };
  });

  if (result.status === "failed") {
    return NextResponse.json({ ok: false, ...result }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result });
}
