import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/integrations/whoop/data?days=7
 *
 * Returns the full WHOOP dataset for the authenticated user, grouped by category.
 * Used by the WhoopData screen to display all synced data with timestamps.
 *
 * Query params:
 * - days: number of days to look back (default 7, max 90)
 */

// Metric type → category mapping
const RECOVERY_METRICS = new Set([
  "hrv", "resting_hr", "blood_oxygen", "recovery_score", "body_temp",
]);
const SLEEP_METRICS = new Set([
  "sleep_hours", "deep_sleep_min", "rem_sleep_min", "light_sleep_min",
  "awake_min", "respiratory_rate", "sleep_efficiency", "sleep_performance",
  "sleep_consistency", "sleep_needed_baseline", "sleep_debt",
]);
const WORKOUT_METRICS = new Set([
  "workout_strain", "workout_avg_hr", "workout_max_hr",
  "workout_calories", "workout_duration_min",
]);
const CYCLE_METRICS = new Set([
  "daily_strain", "heart_rate", "max_heart_rate", "calories",
]);

type CategoryName = "recovery" | "sleep" | "workout" | "cycle";

function categorizeMetric(metricType: string): CategoryName {
  if (RECOVERY_METRICS.has(metricType)) return "recovery";
  if (SLEEP_METRICS.has(metricType)) return "sleep";
  if (WORKOUT_METRICS.has(metricType)) return "workout";
  if (CYCLE_METRICS.has(metricType)) return "cycle";
  // Default: cycle (catch-all for any new metric types)
  return "cycle";
}

// Human-readable labels for metric types
const METRIC_LABELS: Record<string, string> = {
  hrv: "HRV (RMSSD)",
  resting_hr: "Resting Heart Rate",
  blood_oxygen: "Blood Oxygen (SpO2)",
  recovery_score: "Recovery Score",
  body_temp: "Skin Temperature",
  sleep_hours: "Total Sleep",
  deep_sleep_min: "Deep Sleep",
  rem_sleep_min: "REM Sleep",
  light_sleep_min: "Light Sleep",
  awake_min: "Awake Time",
  respiratory_rate: "Respiratory Rate",
  sleep_efficiency: "Sleep Efficiency",
  sleep_performance: "Sleep Performance",
  sleep_consistency: "Sleep Consistency",
  sleep_needed_baseline: "Sleep Needed (Baseline)",
  sleep_debt: "Sleep Debt",
  workout_strain: "Workout Strain",
  workout_avg_hr: "Workout Avg HR",
  workout_max_hr: "Workout Max HR",
  workout_calories: "Workout Calories",
  workout_duration_min: "Workout Duration",
  daily_strain: "Daily Strain",
  heart_rate: "Avg Heart Rate",
  max_heart_rate: "Max Heart Rate",
  calories: "Daily Calories",
};

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const userId = auth.user.id;
  const db = supabaseAdmin() as any;

  // Parse days param (default 7, max 90)
  const daysParam = req.nextUrl?.searchParams?.get("days");
  const days = Math.min(Math.max(parseInt(daysParam || "7", 10) || 7, 1), 90);
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  // Parallel fetch: connection status + health data
  const [connRes, healthRes] = await Promise.all([
    db
      .from("wearable_connections")
      .select("sync_status, sync_error, last_sync_at, connected_at")
      .eq("user_id", userId)
      .eq("provider", "whoop")
      .maybeSingle(),
    db
      .from("health_data")
      .select("date, metric_type, value, unit, created_at")
      .eq("user_id", userId)
      .eq("source", "whoop")
      .gte("date", startDate)
      .order("date", { ascending: false }),
  ]);

  const conn = connRes.data;
  const healthData = healthRes.data ?? [];

  const isConnected = !!conn && conn.sync_status !== "auth_required";
  const lastSync = conn?.last_sync_at ? new Date(conn.last_sync_at) : null;
  const hoursSinceSync = lastSync
    ? (Date.now() - lastSync.getTime()) / 3600000
    : null;

  // Group health data by category → date → metrics
  const grouped: Record<CategoryName, Map<string, Record<string, { value: number; unit: string; label: string }>>> = {
    recovery: new Map(),
    sleep: new Map(),
    workout: new Map(),
    cycle: new Map(),
  };

  for (const row of healthData) {
    const category = categorizeMetric(row.metric_type);
    const dateMap = grouped[category];
    if (!dateMap.has(row.date)) {
      dateMap.set(row.date, {});
    }
    dateMap.get(row.date)![row.metric_type] = {
      value: Number(row.value),
      unit: row.unit || "",
      label: METRIC_LABELS[row.metric_type] || row.metric_type,
    };
  }

  // Convert Maps to sorted arrays
  const toArray = (map: Map<string, Record<string, { value: number; unit: string; label: string }>>) =>
    Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0])) // desc by date
      .map(([date, metrics]) => ({ date, metrics }));

  return NextResponse.json({
    connected: isConnected,
    sync_status: conn?.sync_status ?? null,
    sync_error: conn?.sync_error ?? null,
    last_sync_at: conn?.last_sync_at ?? null,
    connected_at: conn?.connected_at ?? null,
    hours_since_sync: hoursSinceSync != null ? Math.round(hoursSinceSync * 10) / 10 : null,
    data_fresh: hoursSinceSync != null ? hoursSinceSync <= 48 : false,
    categories: {
      recovery: toArray(grouped.recovery),
      sleep: toArray(grouped.sleep),
      workout: toArray(grouped.workout),
      cycle: toArray(grouped.cycle),
    },
    metric_labels: METRIC_LABELS,
    days_requested: days,
    total_data_points: healthData.length,
  });
}
