import { NextRequest, NextResponse } from "next/server";
import {
  triggerSessionNotifications,
  triggerStreakAtRisk,
  triggerRestDayReminder,
  triggerBedtimeReminder,
  triggerSmartCheckinReminder,
} from "@/services/notifications/scheduledTriggers";
import { deliverQueuedPushes } from "@/services/notifications/pushDelivery";
import { expireByTTL } from "@/services/notifications/notificationEngine";
import { runConditionExpiryCheck, cleanDismissalLog } from "@/services/notifications/expiryResolver";
import { decayStaleSnapshots } from "@/services/snapshot/snapshotStalenessDecay";
import { updateBaselines } from "@/services/snapshot/baselineUpdater";

const HEADERS = { "api-version": "v1" };

function verifyCronAuth(req: NextRequest): boolean {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) return true; // no secret configured = allow all
  if (cronSecret === expectedSecret) return true;
  if (authHeader === `Bearer ${expectedSecret}`) return true;
  return false;
}

/**
 * GET /api/v1/notifications/triggers
 *
 * Called by Vercel cron every 15 minutes.
 * Runs session triggers every call, daily triggers time-gated.
 * Also drains the quiet-hours push queue.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    // Fall back to regular auth check
    const { requireAuth } = await import("@/lib/auth");
    const auth = requireAuth(req);
    if ("error" in auth) return auth.error;
  }

  try {
    const results: Record<string, unknown> = {};
    const now = new Date();
    const hour = now.getUTCHours();
    results.cron_ran_at = now.toISOString();

    // Expire stale notifications (expires_at < now) — must run first so dedup is unblocked
    results.expired = await expireByTTL();

    // Condition-based resolution (ACWR dropped, injury flag cleared, etc.)
    results.condition_resolved = await runConditionExpiryCheck();

    // Session-based triggers — run every call (self-scoped by time windows)
    results.sessions = await triggerSessionNotifications();

    // Drain quiet-hours push queue — every call
    results.queued_pushes = await deliverQueuedPushes();

    // Streak at risk — run near 21:00 UTC (20-21 window)
    if (hour >= 20 && hour <= 21) {
      results.streak_at_risk = await triggerStreakAtRisk();
    }

    // Baseline updater — run near 02:00 UTC (2-3 window)
    if (hour >= 2 && hour <= 3) {
      results.baseline_update = await updateBaselines();
    }

    // Rest day reminder — run near 06:00 UTC (5-6 window)
    if (hour >= 5 && hour <= 6) {
      results.rest_day = await triggerRestDayReminder();
      // Housekeeping: clean dismissal log entries older than 30 days (daily, low-traffic window)
      results.dismissal_log_cleaned = await cleanDismissalLog();
      // CCRS staleness decay: recompute ACWR + CCRS for stale athletes, decay frozen readiness
      results.staleness_decay = await decayStaleSnapshots();
    }

    // Bedtime + pre-match sleep — run 15:00-23:00 UTC (covers UTC±8 evening windows)
    // Each athlete's local time is checked inside the trigger using their stored timezone
    if (hour >= 15 && hour <= 23) {
      results.bedtime = await triggerBedtimeReminder();
    }

    // Smart check-in reminder — runs every call (self-gates by time window)
    results.checkin_reminder = await triggerSmartCheckinReminder();

    return NextResponse.json(
      { success: true, results },
      { headers: HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Trigger failed" },
      { status: 500, headers: HEADERS }
    );
  }
}

/**
 * POST /api/v1/notifications/triggers
 *
 * Runs scheduled notification triggers. Called by admin or manual testing.
 * Body: { trigger: "sessions" | "streak_at_risk" | "rest_day" | "all" }
 */
export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    const { requireAuth } = await import("@/lib/auth");
    const auth = requireAuth(req);
    if ("error" in auth) return auth.error;
  }

  try {
    const body = await req.json().catch(() => ({ trigger: "all" }));
    const trigger = body.trigger ?? "all";

    const results: Record<string, unknown> = {};

    // Always expire stale notifications first
    results.expired = await expireByTTL();

    // Condition-based resolution
    results.condition_resolved = await runConditionExpiryCheck();

    if (trigger === "sessions" || trigger === "all") {
      results.sessions = await triggerSessionNotifications();
    }

    if (trigger === "streak_at_risk" || trigger === "all") {
      results.streak_at_risk = await triggerStreakAtRisk();
    }

    if (trigger === "rest_day" || trigger === "all") {
      results.rest_day = await triggerRestDayReminder();
    }

    if (trigger === "queued_pushes" || trigger === "all") {
      results.queued_pushes = await deliverQueuedPushes();
    }

    if (trigger === "bedtime" || trigger === "all") {
      results.bedtime = await triggerBedtimeReminder();
    }

    if (trigger === "checkin_reminder" || trigger === "all") {
      results.checkin_reminder = await triggerSmartCheckinReminder();
    }

    if (trigger === "staleness_decay" || trigger === "all") {
      results.staleness_decay = await decayStaleSnapshots();
    }

    if (trigger === "baseline_update" || trigger === "all") {
      results.baseline_update = await updateBaselines();
    }

    return NextResponse.json(
      { success: true, results },
      { headers: HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Trigger failed" },
      { status: 500, headers: HEADERS }
    );
  }
}
