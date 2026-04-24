#!/usr/bin/env npx tsx
/**
 * test-notification-cycle — Exercise the notification engine + scheduled hooks locally.
 *
 * Prerequisites:
 *   - backend/.env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   cd backend && npx tsx scripts/test-notification-cycle.ts --athlete-id=<uuid>
 *
 * Optional flags:
 *   --scheduled     Also run triggerSessionNotifications + triggerSmartCheckinReminder
 *                   (session path needs calendar rows in the right time windows)
 *   --no-engine     Skip createNotification (only expiry + optional scheduled)
 *
 * After success:
 *   - Open the mobile app as that player → Notifications screen and bell should update
 *   - Or: GET /api/v1/notifications?source=center with the player session cookie
 */

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../.env.local") });

function parseArg(name: string): string | undefined {
  const prefix = `${name}=`;
  const hit = process.argv.find((a) => a === name || a.startsWith(prefix));
  if (!hit) return undefined;
  if (hit.includes("=")) return hit.slice(prefix.length);
  const idx = process.argv.indexOf(hit);
  return process.argv[idx + 1];
}

async function main() {
  const athleteId = parseArg("--athlete-id");
  if (!athleteId || !/^[0-9a-f-]{36}$/i.test(athleteId)) {
    console.error(
      "Usage: npx tsx scripts/test-notification-cycle.ts --athlete-id=<player-uuid>\n" +
        "Optional: --scheduled   (run session + smart check-in cron hooks)\n" +
        "          --no-engine   (skip READINESS_TREND_UP insert)\n"
    );
    process.exit(1);
  }

  const runScheduled = process.argv.includes("--scheduled");
  const skipEngine = process.argv.includes("--no-engine");

  const { expireByTTL, createNotification, getUnreadCount } = await import(
    "../services/notifications/notificationEngine"
  );

  console.log("[1/4] expireByTTL …");
  const expired = await expireByTTL();
  console.log(`      expired rows: ${expired}`);

  const before = await getUnreadCount(athleteId);
  console.log(`      unread before: ${before.total}`, before.by_category);

  if (!skipEngine) {
    console.log("[2/4] createNotification(READINESS_TREND_UP) …");
    const id = await createNotification({
      athleteId,
      type: "READINESS_TREND_UP",
      vars: { current: 72, delta: 12 },
    });
    if (id) {
      console.log(`      created notification id: ${id}`);
    } else {
      console.log(
        "      createNotification returned null (type disabled, fatigued, context suppressed, or dedup race — check server logs)"
      );
    }
  } else {
    console.log("[2/4] skipped (--no-engine)");
  }

  if (runScheduled) {
    const { triggerSessionNotifications, triggerSmartCheckinReminder } =
      await import("../services/notifications/scheduledTriggers");
    console.log("[3/4] triggerSessionNotifications …");
    const sessions = await triggerSessionNotifications();
    console.log("      ", sessions);
    console.log("[3b/4] triggerSmartCheckinReminder …");
    const checkin = await triggerSmartCheckinReminder();
    console.log(`      athletes considered / nudges attempted: ${checkin}`);
  } else {
    console.log("[3/4] skipped (pass --scheduled for session + check-in cron hooks)");
  }

  const { deliverQueuedPushes } = await import(
    "../services/notifications/pushDelivery"
  );
  console.log("[4/4] deliverQueuedPushes …");
  const delivered = await deliverQueuedPushes();
  console.log(`      delivered from quiet-hours queue: ${delivered}`);

  const after = await getUnreadCount(athleteId);
  console.log(`      unread after: ${after.total}`, after.by_category);
  console.log("\nDone. Verify in app: Notifications tab + bell badge for this user.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
