import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const db = () => supabaseAdmin() as any;

/**
 * GET /api/v1/admin/notifications/push-stats
 * Returns push delivery statistics for the admin panel.
 */
export async function GET() {
  const dbClient = db();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const [devicesRes, sentRes, failedRes] = await Promise.allSettled([
    // Registered devices by platform
    dbClient.from("player_push_tokens").select("platform"),

    // Push sent today
    dbClient
      .from("athlete_notifications")
      .select("id", { count: "exact", head: true })
      .eq("push_sent", true)
      .gte("push_sent_at", todayISO),

    // "Failed" = created today but push not sent and not queued
    dbClient
      .from("athlete_notifications")
      .select("id", { count: "exact", head: true })
      .eq("push_sent", false)
      .eq("push_queued", false)
      .gte("created_at", todayISO),
  ]);

  // Count devices by platform
  const devices = { ios: 0, android: 0, web: 0, total: 0 };
  if (devicesRes.status === "fulfilled" && devicesRes.value?.data) {
    for (const row of devicesRes.value.data as Array<{ platform: string }>) {
      const p = row.platform as keyof typeof devices;
      if (p in devices) devices[p]++;
      devices.total++;
    }
  }

  const pushSentToday = sentRes.status === "fulfilled" ? sentRes.value?.count ?? 0 : 0;
  const pushFailedToday = failedRes.status === "fulfilled" ? failedRes.value?.count ?? 0 : 0;

  // Average pushes per athlete
  const avgPushPerAthlete = devices.total > 0 ? pushSentToday / devices.total : 0;

  return NextResponse.json({
    stats: {
      registeredDevices: devices,
      pushSentToday,
      pushFailedToday,
      avgPushPerAthlete,
      staleTokens: 0, // Would need last-used timestamp to compute
    },
  });
}
