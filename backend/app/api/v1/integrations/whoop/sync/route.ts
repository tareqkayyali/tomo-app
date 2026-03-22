import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getValidAccessToken,
  fetchRecoveries,
  fetchSleeps,
  fetchWorkouts,
  fetchCycles,
  updateSyncStatus,
} from "@/services/integrations/whoopService";
import {
  mapRecoveryToVitalReadings,
  mapSleepToRecords,
  mapWorkoutsToSessionLogs,
  mapCyclesToSync,
} from "@/services/integrations/whoopMapper";
import { emitEventSafe } from "@/services/events/eventEmitter";
import type { EventType, SourceType } from "@/services/events/constants";

/**
 * POST /api/v1/integrations/whoop/sync
 *
 * Pulls WHOOP data and ingests as Tomo events.
 * - First sync (no last_sync_at): pulls last 30 days
 * - Subsequent syncs: pulls last 24 hours
 * Auto-refreshes tokens if expired.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const userId = auth.user.id;

  try {
    await updateSyncStatus(userId, "syncing");

    // Get valid access token (auto-refreshes if needed)
    const accessToken = await getValidAccessToken(userId);

    // Check if this is the first sync (no last_sync_at means initial sync)
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const db = supabaseAdmin() as any;
    const { data: conn } = await db
      .from("wearable_connections")
      .select("last_sync_at")
      .eq("user_id", userId)
      .eq("provider", "whoop")
      .single();

    const isFirstSync = !conn?.last_sync_at;

    // Time window: 30 days for first sync, 24 hours for subsequent
    const endDate = new Date().toISOString();
    const lookbackMs = isFirstSync
      ? 30 * 24 * 60 * 60 * 1000  // 30 days
      : 24 * 60 * 60 * 1000;       // 24 hours
    const startDate = new Date(Date.now() - lookbackMs).toISOString();

    // Fetch all data types in parallel
    const [recoveries, sleeps, workouts, cycles] = await Promise.all([
      fetchRecoveries(accessToken, startDate, endDate).catch((e) => {
        console.warn("[whoop/sync] Recovery fetch failed:", e.message);
        return [];
      }),
      fetchSleeps(accessToken, startDate, endDate).catch((e) => {
        console.warn("[whoop/sync] Sleep fetch failed:", e.message);
        return [];
      }),
      fetchWorkouts(accessToken, startDate, endDate).catch((e) => {
        console.warn("[whoop/sync] Workout fetch failed:", e.message);
        return [];
      }),
      fetchCycles(accessToken, startDate, endDate).catch((e) => {
        console.warn("[whoop/sync] Cycle fetch failed:", e.message);
        return [];
      }),
    ]);

    // Map WHOOP data to Tomo events
    const vitalEvents = mapRecoveryToVitalReadings(recoveries);
    const sleepEvents = mapSleepToRecords(sleeps);
    const sessionEvents = mapWorkoutsToSessionLogs(workouts);
    const syncEvents = mapCyclesToSync(cycles);

    const allEvents = [
      ...vitalEvents,
      ...sleepEvents,
      ...sessionEvents,
      ...syncEvents,
    ];

    // Emit all events (non-throwing)
    let emitted = 0;
    for (const evt of allEvents) {
      const result = await emitEventSafe({
        athleteId: userId,
        eventType: evt.event_type as EventType,
        occurredAt: evt.occurred_at,
        source: evt.source as SourceType,
        payload: evt.payload,
        createdBy: userId,
      });
      if (result) emitted++;
    }

    // ── Write directly to health_data for My Vitals page ──
    // The event processor may not run (webhook not configured), so we
    // write here as the guaranteed path for WHOOP data visibility.
    let healthDataWritten = 0;
    for (const evt of vitalEvents) {
      const p = evt.payload as Record<string, unknown>;
      const date = new Date(evt.occurred_at).toISOString().slice(0, 10);
      const rows: Array<{ user_id: string; date: string; metric_type: string; value: number; unit: string; source: string }> = [];

      if (p.hrv_ms) rows.push({ user_id: userId, date, metric_type: "hrv", value: p.hrv_ms as number, unit: "ms", source: "whoop" });
      if (p.resting_hr_bpm) rows.push({ user_id: userId, date, metric_type: "resting_hr", value: p.resting_hr_bpm as number, unit: "bpm", source: "whoop" });
      if (p.spo2_percent) rows.push({ user_id: userId, date, metric_type: "blood_oxygen", value: p.spo2_percent as number, unit: "%", source: "whoop" });
      if (p.recovery_score) rows.push({ user_id: userId, date, metric_type: "recovery_score", value: p.recovery_score as number, unit: "%", source: "whoop" });
      if (p.skin_temp_celsius) rows.push({ user_id: userId, date, metric_type: "body_temp", value: p.skin_temp_celsius as number, unit: "°C", source: "whoop" });

      for (const row of rows) {
        await db.from("health_data").upsert(row, { onConflict: "user_id,date,metric_type", ignoreDuplicates: false }).then(() => healthDataWritten++).catch(() => {});
      }
    }

    for (const evt of sleepEvents) {
      const p = evt.payload as Record<string, unknown>;
      const date = new Date(evt.occurred_at).toISOString().slice(0, 10);
      if (p.sleep_duration_hours) {
        await db.from("health_data").upsert(
          { user_id: userId, date, metric_type: "sleep_hours", value: p.sleep_duration_hours as number, unit: "hrs", source: "whoop" },
          { onConflict: "user_id,date,metric_type", ignoreDuplicates: false }
        ).then(() => healthDataWritten++).catch(() => {});
      }
    }

    await updateSyncStatus(userId, "idle");

    return NextResponse.json({
      synced: true,
      events_emitted: emitted,
      health_data_written: healthDataWritten,
      first_sync: isFirstSync,
      lookback_days: isFirstSync ? 30 : 1,
      summary: {
        recoveries: recoveries.length,
        sleeps: sleeps.length,
        workouts: workouts.length,
        cycles: cycles.length,
      },
    });
  } catch (err) {
    const message = (err as Error).message;
    console.error("[whoop/sync] Error:", message);
    await updateSyncStatus(userId, "error", message);

    return NextResponse.json(
      { error: "WHOOP sync failed", details: message },
      { status: 500 }
    );
  }
}
