import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getValidAccessToken,
  fetchRecoveries,
  fetchSleeps,
  fetchWorkouts,
  fetchCycles,
  updateSyncStatus,
  computeSyncWindow,
} from "@/services/integrations/whoopService";
import {
  mapRecoveryToVitalReadings,
  mapSleepToRecords,
  mapWorkoutsToSessionLogs,
  mapCyclesToSync,
} from "@/services/integrations/whoopMapper";
import { emitEventSafe } from "@/services/events/eventEmitter";
import type { EventType, SourceType } from "@/services/events/constants";

// ── Health metric write helper ──
// Bulk upserts health_data rows for enterprise-grade efficiency.
// Uses a single upsert call per batch instead of one-at-a-time writes.
interface HealthMetricRow {
  user_id: string;
  date: string;
  metric_type: string;
  value: number;
  unit: string;
  source: string;
}

async function writeHealthMetrics(
  db: any,
  rows: HealthMetricRow[]
): Promise<{ written: number; errors: number }> {
  if (rows.length === 0) return { written: 0, errors: 0 };

  // Batch upsert for efficiency — single DB call instead of N calls
  const { error, count } = await db
    .from("health_data")
    .upsert(rows, { onConflict: "user_id,date,metric_type", ignoreDuplicates: false, count: "exact" });

  if (error) {
    console.error(`[whoop/sync] Batch health_data write failed (${rows.length} rows):`, error.message);
    // Fallback: try individual writes so partial success is captured
    let written = 0;
    let errors = 0;
    for (const row of rows) {
      const { error: writeErr } = await db
        .from("health_data")
        .upsert(row, { onConflict: "user_id,date,metric_type", ignoreDuplicates: false });
      if (writeErr) {
        errors++;
        console.error(`[whoop/sync] health_data write failed (${row.metric_type}):`, writeErr.message);
      } else {
        written++;
      }
    }
    return { written, errors };
  }

  return { written: count ?? rows.length, errors: 0 };
}

// Helper: push a metric row if value is truthy
function pushMetric(
  rows: HealthMetricRow[],
  userId: string,
  date: string,
  metricType: string,
  value: unknown,
  unit: string
) {
  if (value != null && value !== undefined && value !== 0 && !Number.isNaN(value)) {
    rows.push({
      user_id: userId,
      date,
      metric_type: metricType,
      value: typeof value === "number" ? value : Number(value),
      unit,
      source: "whoop",
    });
  }
}

/**
 * POST /api/v1/integrations/whoop/sync
 *
 * Pulls WHOOP data and ingests as Tomo events + health_data.
 * - Uses adaptive lookback: first sync = 30 days, subsequent = from last_sync_at - 1 day overlap
 * - Paginated fetchers: never silently drops records (cursor-based pagination)
 * - Writes full WHOOP dataset: 20+ metric types across recovery, sleep, workout, cycle
 * - Bulk upserts for enterprise efficiency
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const userId = auth.user.id;

  try {
    await updateSyncStatus(userId, "syncing").catch(e =>
      console.warn("[whoop/sync] Could not set syncing status:", e.message)
    );

    // Get valid access token (auto-refreshes if needed)
    const accessToken = await getValidAccessToken(userId);

    // Get connection metadata for adaptive sync window
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const db = supabaseAdmin() as any;
    const { data: conn } = await db
      .from("wearable_connections")
      .select("last_sync_at")
      .eq("user_id", userId)
      .eq("provider", "whoop")
      .single();

    // Force full sync via query param
    const forceFullSync = req.nextUrl?.searchParams?.get("full") === "true";

    // Adaptive sync window: uses last_sync_at to compute optimal lookback
    const { start: startDate, end: endDate } = forceFullSync
      ? computeSyncWindow(null) // null = 30-day lookback
      : computeSyncWindow(conn?.last_sync_at);

    const isFirstSync = !conn?.last_sync_at;

    console.log(`[whoop/sync] userId=${userId} firstSync=${isFirstSync} fullSync=${forceFullSync} window=${startDate} → ${endDate}`);

    // Fetch all data types in parallel — paginated to capture all records
    const [recoveries, sleeps, workouts, cycles] = await Promise.all([
      fetchRecoveries(accessToken, startDate, endDate).catch((e) => {
        console.error("[whoop/sync] Recovery fetch FAILED:", e.message);
        return [];
      }),
      fetchSleeps(accessToken, startDate, endDate).catch((e) => {
        console.error("[whoop/sync] Sleep fetch FAILED:", e.message);
        return [];
      }),
      fetchWorkouts(accessToken, startDate, endDate).catch((e) => {
        console.error("[whoop/sync] Workout fetch FAILED:", e.message);
        return [];
      }),
      fetchCycles(accessToken, startDate, endDate).catch((e) => {
        console.error("[whoop/sync] Cycle fetch FAILED:", e.message);
        return [];
      }),
    ]);

    console.log(`[whoop/sync] Fetched: recoveries=${recoveries.length} sleeps=${sleeps.length} workouts=${workouts.length} cycles=${cycles.length}`);

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

    // ── Write FULL WHOOP dataset to health_data ──
    // This is the guaranteed path for data visibility — event processor may not run.
    const healthRows: HealthMetricRow[] = [];

    // Recovery metrics (5 types)
    for (const evt of vitalEvents) {
      const p = evt.payload as Record<string, unknown>;
      const date = new Date(evt.occurred_at).toISOString().slice(0, 10);
      pushMetric(healthRows, userId, date, "hrv", p.hrv_ms, "ms");
      pushMetric(healthRows, userId, date, "resting_hr", p.resting_hr_bpm, "bpm");
      pushMetric(healthRows, userId, date, "blood_oxygen", p.spo2_percent, "%");
      pushMetric(healthRows, userId, date, "recovery_score", p.recovery_score, "%");
      pushMetric(healthRows, userId, date, "body_temp", p.skin_temp_celsius, "°C");
    }

    // Sleep metrics (11 types — full sleep dataset)
    for (const evt of sleepEvents) {
      const p = evt.payload as Record<string, unknown>;
      const date = new Date(evt.occurred_at).toISOString().slice(0, 10);
      pushMetric(healthRows, userId, date, "sleep_hours", p.sleep_duration_hours, "hrs");
      pushMetric(healthRows, userId, date, "deep_sleep_min", p.deep_sleep_min, "min");
      pushMetric(healthRows, userId, date, "rem_sleep_min", p.rem_sleep_min, "min");
      pushMetric(healthRows, userId, date, "light_sleep_min", p.light_sleep_min, "min");
      pushMetric(healthRows, userId, date, "awake_min", p.awake_min, "min");
      pushMetric(healthRows, userId, date, "respiratory_rate", p.respiratory_rate, "breaths/min");
      pushMetric(healthRows, userId, date, "sleep_efficiency", p.sleep_efficiency, "%");
      pushMetric(healthRows, userId, date, "sleep_performance", p.sleep_performance_pct, "%");
      pushMetric(healthRows, userId, date, "sleep_consistency", p.sleep_consistency_pct, "%");
      pushMetric(healthRows, userId, date, "sleep_needed_baseline", p.sleep_needed_baseline_hrs, "hrs");
      pushMetric(healthRows, userId, date, "sleep_debt", p.sleep_debt_hrs, "hrs");
    }

    // Workout metrics (5 types per workout)
    for (const evt of sessionEvents) {
      const p = evt.payload as Record<string, unknown>;
      const date = new Date(evt.occurred_at).toISOString().slice(0, 10);
      pushMetric(healthRows, userId, date, "workout_strain", p.strain, "");
      pushMetric(healthRows, userId, date, "workout_avg_hr", p.avg_hr_bpm, "bpm");
      pushMetric(healthRows, userId, date, "workout_max_hr", p.max_hr_bpm, "bpm");
      pushMetric(healthRows, userId, date, "workout_calories", p.calories_kcal, "kcal");
      pushMetric(healthRows, userId, date, "workout_duration_min", p.duration_min, "min");
    }

    // Cycle/daily summary metrics (4 types)
    for (const cycle of cycles) {
      if (!cycle.score || cycle.score_state !== "SCORED") continue;
      const date = new Date(cycle.end || cycle.updated_at).toISOString().slice(0, 10);
      pushMetric(healthRows, userId, date, "daily_strain", cycle.score.strain, "");
      pushMetric(healthRows, userId, date, "heart_rate", cycle.score.average_heart_rate, "bpm");
      pushMetric(healthRows, userId, date, "max_heart_rate", cycle.score.max_heart_rate, "bpm");
      pushMetric(healthRows, userId, date, "calories", Math.round(cycle.score.kilojoule / 4.184), "kcal");
    }

    // Bulk write all health metrics
    const { written: healthDataWritten, errors: healthDataErrors } =
      await writeHealthMetrics(db, healthRows);

    console.log(`[whoop/sync] health_data: ${healthDataWritten} written, ${healthDataErrors} errors, ${healthRows.length} total rows`);

    // Touch created_at on all health_data rows in the sync window for freshness tracking
    try {
      await db.from("health_data")
        .update({ created_at: new Date().toISOString() })
        .eq("user_id", userId)
        .gte("date", startDate.slice(0, 10));
    } catch (e: any) {
      console.warn("[whoop/sync] Could not touch created_at:", e?.message);
    }

    // ── Update athlete_snapshot with latest Whoop vitals ──
    try {
      const { data: latestVitals } = await db
        .from("health_data")
        .select("metric_type, value")
        .eq("user_id", userId)
        .in("metric_type", ["hrv", "resting_hr", "sleep_hours", "recovery_score", "blood_oxygen", "body_temp"])
        .order("date", { ascending: false })
        .limit(30);

      // Deduplicate: take first (latest) per metric_type
      const latestByType = new Map<string, number>();
      for (const v of (latestVitals ?? [])) {
        if (!latestByType.has(v.metric_type)) {
          latestByType.set(v.metric_type, v.value);
        }
      }

      if (latestByType.size > 0) {
        const snapshotUpdate: Record<string, unknown> = {
          snapshot_at: new Date().toISOString(),
          wearable_connected: true,
          wearable_last_sync_at: new Date().toISOString(),
        };
        if (latestByType.has("hrv")) snapshotUpdate.hrv_today_ms = latestByType.get("hrv");
        if (latestByType.has("resting_hr")) snapshotUpdate.resting_hr_bpm = latestByType.get("resting_hr");
        if (latestByType.has("sleep_hours")) snapshotUpdate.sleep_quality = latestByType.get("sleep_hours");
        if (latestByType.has("recovery_score")) snapshotUpdate.recovery_score = latestByType.get("recovery_score");
        if (latestByType.has("blood_oxygen")) snapshotUpdate.spo2_pct = latestByType.get("blood_oxygen");
        if (latestByType.has("body_temp")) snapshotUpdate.skin_temp_c = latestByType.get("body_temp");

        // Compute HRV baseline from last 7 days
        const { data: recentHRV } = await db
          .from("health_data")
          .select("value")
          .eq("user_id", userId)
          .eq("metric_type", "hrv")
          .gte("date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
          .order("date", { ascending: false });
        if (recentHRV && recentHRV.length > 0) {
          const baseline = recentHRV.reduce((sum: number, r: any) => sum + r.value, 0) / recentHRV.length;
          snapshotUpdate.hrv_baseline_ms = Math.round(baseline * 10) / 10;
        }
        await db.from("athlete_snapshots").upsert(
          { athlete_id: userId, ...snapshotUpdate },
          { onConflict: "athlete_id" }
        );
      }
    } catch (e: any) {
      console.warn("[whoop/sync] Snapshot update failed (non-fatal):", e?.message);
    }

    await updateSyncStatus(userId, "idle").catch(e =>
      console.error("[whoop/sync] Could not set idle status:", e.message)
    );

    return NextResponse.json({
      synced: true,
      events_emitted: emitted,
      health_data_written: healthDataWritten,
      health_data_errors: healthDataErrors,
      health_data_total_rows: healthRows.length,
      first_sync: isFirstSync,
      full_sync: forceFullSync,
      window: { start: startDate, end: endDate },
      _syncVersion: 5,
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
    await updateSyncStatus(userId, "error", message).catch(e =>
      console.error("[whoop/sync] Could not set error status:", e.message)
    );

    return NextResponse.json(
      { error: "WHOOP sync failed", details: message },
      { status: 500 }
    );
  }
}
