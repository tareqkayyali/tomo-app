/**
 * Weekly Vitals Aggregator
 *
 * Aggregates health_data over 7-day windows with trend comparison
 * and Gen Z-friendly plain-English summaries.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Types ───────────────────────────────────────────────────────────────

export interface VitalMetricSummary {
  metric: string;
  label: string;
  emoji: string;
  unit: string;
  avg: number;
  min: number;
  max: number;
  count: number;
  trend: "up" | "down" | "stable";
  trendPercent: number; // e.g. +12 or -5
  summary: string; // plain English
  color: string;
}

export interface WeeklyVitalsSummary {
  metrics: VitalMetricSummary[];
  periodStart: string;
  periodEnd: string;
  overallSummary: string;
}

// ── Config ──────────────────────────────────────────────────────────────

const METRIC_CONFIG: Record<string, { label: string; emoji: string; unit: string; color: string; direction: "higher_better" | "lower_better" }> = {
  heart_rate: { label: "Heart Rate", emoji: "❤️", unit: "bpm", color: "#FF3B30", direction: "lower_better" },
  hrv: { label: "HRV", emoji: "💓", unit: "ms", color: "#AF52DE", direction: "higher_better" },
  resting_hr: { label: "Resting HR", emoji: "💗", unit: "bpm", color: "#FF6B6B", direction: "lower_better" },
  steps: { label: "Steps", emoji: "👣", unit: "steps", color: "#30D158", direction: "higher_better" },
  calories: { label: "Active Cal", emoji: "🔥", unit: "kcal", color: "#FF9500", direction: "higher_better" },
  blood_oxygen: { label: "SpO₂", emoji: "🫁", unit: "%", color: "#00D9FF", direction: "higher_better" },
  sleep_hours: { label: "Sleep", emoji: "😴", unit: "hrs", color: "#6366F1", direction: "higher_better" },
  body_temp: { label: "Body Temp", emoji: "🌡️", unit: "°C", color: "#FF6B35", direction: "lower_better" },
  respiratory_rate: { label: "Resp Rate", emoji: "🌬️", unit: "/min", color: "#34C759", direction: "lower_better" },
  vo2max: { label: "VO₂ Max", emoji: "🏃", unit: "ml/kg/min", color: "#007AFF", direction: "higher_better" },
};

// ── Core ────────────────────────────────────────────────────────────────

export async function aggregateWeeklyVitals(
  userId: string,
  days: number = 7
): Promise<WeeklyVitalsSummary> {
  const db = supabaseAdmin();

  const now = new Date();
  const periodEnd = now.toISOString().slice(0, 10);
  const periodStartDate = new Date(now.getTime() - days * 86400000);
  const periodStart = periodStartDate.toISOString().slice(0, 10);

  // Prior period for trend comparison
  const priorEnd = new Date(periodStartDate.getTime() - 86400000).toISOString().slice(0, 10);
  const priorStart = new Date(periodStartDate.getTime() - days * 86400000).toISOString().slice(0, 10);

  // Fetch both periods in parallel
  const [currentRes, priorRes] = await Promise.all([
    db
      .from("health_data")
      .select("metric_type, value, date")
      .eq("user_id", userId)
      .gte("date", periodStart)
      .lte("date", periodEnd)
      .order("date", { ascending: true }),
    db
      .from("health_data")
      .select("metric_type, value, date")
      .eq("user_id", userId)
      .gte("date", priorStart)
      .lte("date", priorEnd)
      .order("date", { ascending: true }),
  ]);

  const currentData = (currentRes.data || []) as Array<{ metric_type: string; value: number; date: string }>;
  const priorData = (priorRes.data || []) as Array<{ metric_type: string; value: number; date: string }>;

  // Group by metric
  const currentGrouped = groupByMetric(currentData);
  const priorGrouped = groupByMetric(priorData);

  const metrics: VitalMetricSummary[] = [];

  for (const [metric, values] of Object.entries(currentGrouped)) {
    const config = METRIC_CONFIG[metric];
    if (!config) continue;

    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10;
    const min = Math.round(Math.min(...values) * 10) / 10;
    const max = Math.round(Math.max(...values) * 10) / 10;

    // Trend vs prior week
    const priorValues = priorGrouped[metric] || [];
    const priorAvg = priorValues.length > 0
      ? priorValues.reduce((a, b) => a + b, 0) / priorValues.length
      : avg;

    const trendPercent = priorAvg !== 0
      ? Math.round(((avg - priorAvg) / priorAvg) * 100)
      : 0;

    const trend: "up" | "down" | "stable" =
      Math.abs(trendPercent) < 3 ? "stable" : trendPercent > 0 ? "up" : "down";

    const summary = buildMetricSummary(config, avg, trend, trendPercent);

    metrics.push({
      metric,
      label: config.label,
      emoji: config.emoji,
      unit: config.unit,
      avg,
      min,
      max,
      count: values.length,
      trend,
      trendPercent,
      summary,
      color: config.color,
    });
  }

  // Sort: sleep, HRV, resting HR first (most actionable), then rest
  const priority = ["sleep_hours", "hrv", "resting_hr", "heart_rate", "steps", "vo2max"];
  metrics.sort((a, b) => {
    const ai = priority.indexOf(a.metric);
    const bi = priority.indexOf(b.metric);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const overallSummary = buildOverallSummary(metrics);

  return { metrics, periodStart, periodEnd, overallSummary };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function groupByMetric(data: Array<{ metric_type: string; value: number }>): Record<string, number[]> {
  const grouped: Record<string, number[]> = {};
  for (const row of data) {
    if (!grouped[row.metric_type]) grouped[row.metric_type] = [];
    grouped[row.metric_type].push(Number(row.value));
  }
  return grouped;
}

function buildMetricSummary(
  config: { label: string; unit: string; direction: "higher_better" | "lower_better" },
  avg: number,
  trend: "up" | "down" | "stable",
  trendPercent: number
): string {
  const trendWord = trend === "stable"
    ? "holding steady"
    : `${trend === "up" ? "up" : "down"} ${Math.abs(trendPercent)}% from last week`;

  const isGoodTrend =
    (config.direction === "higher_better" && trend === "up") ||
    (config.direction === "lower_better" && trend === "down") ||
    trend === "stable";

  const vibe = isGoodTrend ? "Looking good" : "Worth watching";

  return `Your ${config.label} averaged ${avg}${config.unit} this week — ${trendWord}. ${vibe}.`;
}

function buildOverallSummary(metrics: VitalMetricSummary[]): string {
  if (metrics.length === 0) return "No vitals data this week. Connect a wearable to start tracking.";

  const goodTrends = metrics.filter((m) => {
    const config = METRIC_CONFIG[m.metric];
    if (!config) return false;
    return (
      (config.direction === "higher_better" && m.trend === "up") ||
      (config.direction === "lower_better" && m.trend === "down") ||
      m.trend === "stable"
    );
  });

  const ratio = goodTrends.length / metrics.length;

  if (ratio >= 0.8) return "Your body is responding well this week. Keep it up.";
  if (ratio >= 0.5) return "Mixed signals this week — some metrics are trending the right way, a few need attention.";
  return "A few vitals are moving in the wrong direction. Might be worth checking your recovery and sleep.";
}
