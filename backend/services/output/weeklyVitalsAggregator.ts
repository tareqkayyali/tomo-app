/**
 * Weekly Vitals Aggregator
 *
 * Aggregates health_data over 7-day windows with trend comparison
 * and Gen Z-friendly plain-English summaries.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVitalPercentile } from "@/services/output/vitalsNormativeData";

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
  lastRecordedAt: string | null;
  // Context fields
  percentile: number | null;
  zone: string | null;
  zoneLabel: string | null;
  baseline30d: number | null;
  baselineDeviation: number | null;
  contextInsight: string | null;
}

export interface VitalStoryBlock {
  storyId: string;
  title: string;
  emoji: string;
  status: "strong" | "mixed" | "weak";
  statusColor: string;
  narrative: string;
  contributingMetrics: string[];
}

export interface WeeklyVitalsSummary {
  metrics: VitalMetricSummary[];
  stories: VitalStoryBlock[];
  periodStart: string;
  periodEnd: string;
  overallSummary: string;
}

// ── Config ──────────────────────────────────────────────────────────────

const METRIC_CONFIG: Record<string, { label: string; emoji: string; unit: string; color: string; direction: "higher_better" | "lower_better" }> = {
  heart_rate: { label: "Heart Rate", emoji: "", unit: "bpm", color: "#FF3B30", direction: "lower_better" },
  hrv: { label: "HRV", emoji: "", unit: "ms", color: "#AF52DE", direction: "higher_better" },
  resting_hr: { label: "Resting HR", emoji: "", unit: "bpm", color: "#FF6B6B", direction: "lower_better" },
  recovery_score: { label: "Recovery Score", emoji: "", unit: "%", color: "#30D158", direction: "higher_better" },
  steps: { label: "Steps", emoji: "", unit: "steps", color: "#30D158", direction: "higher_better" },
  calories: { label: "Active Cal", emoji: "", unit: "kcal", color: "#FF9500", direction: "higher_better" },
  blood_oxygen: { label: "SpO₂", emoji: "", unit: "%", color: "#00D9FF", direction: "higher_better" },
  sleep_hours: { label: "Sleep", emoji: "", unit: "hrs", color: "#6366F1", direction: "higher_better" },
  body_temp: { label: "Body Temp", emoji: "", unit: "°C", color: "#FF6B35", direction: "lower_better" },
  respiratory_rate: { label: "Resp Rate", emoji: "", unit: "/min", color: "#34C759", direction: "lower_better" },
  vo2max: { label: "VO₂ Max", emoji: "", unit: "ml/kg/min", color: "#007AFF", direction: "higher_better" },
};

// ── Core ────────────────────────────────────────────────────────────────

export async function aggregateWeeklyVitals(
  userId: string,
  days: number = 7,
  playerAge: number | null = null
): Promise<WeeklyVitalsSummary> {
  const db = supabaseAdmin();

  const now = new Date();
  const periodEnd = now.toISOString().slice(0, 10);
  const periodStartDate = new Date(now.getTime() - days * 86400000);
  const periodStart = periodStartDate.toISOString().slice(0, 10);

  // Prior period for trend comparison
  const priorEnd = new Date(periodStartDate.getTime() - 86400000).toISOString().slice(0, 10);
  const priorStart = new Date(periodStartDate.getTime() - days * 86400000).toISOString().slice(0, 10);

  // 30-day baseline period
  const baseline30Start = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

  // Fetch current, prior, and 30-day baseline in parallel
  const [currentRes, priorRes, baselineRes] = await Promise.all([
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
    db
      .from("health_data")
      .select("metric_type, value, date")
      .eq("user_id", userId)
      .gte("date", baseline30Start)
      .lte("date", periodEnd)
      .order("date", { ascending: true }),
  ]);

  const currentData = (currentRes.data || []) as Array<{ metric_type: string; value: number; date: string }>;
  const priorData = (priorRes.data || []) as Array<{ metric_type: string; value: number; date: string }>;
  const baselineData = (baselineRes.data || []) as Array<{ metric_type: string; value: number; date: string }>;

  // Group by metric (values + latest date)
  const currentGrouped = groupByMetric(currentData);
  const priorGrouped = groupByMetric(priorData);
  const baselineGrouped = groupByMetric(baselineData);

  const metrics: VitalMetricSummary[] = [];

  for (const [metric, grouped] of Object.entries(currentGrouped)) {
    const config = METRIC_CONFIG[metric];
    if (!config) continue;

    const values = grouped.values;
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10;
    const min = Math.round(Math.min(...values) * 10) / 10;
    const max = Math.round(Math.max(...values) * 10) / 10;

    // Trend vs prior week
    const priorGroupedMetric = priorGrouped[metric];
    const priorValues = priorGroupedMetric?.values || [];
    const priorAvg = priorValues.length > 0
      ? priorValues.reduce((a, b) => a + b, 0) / priorValues.length
      : avg;

    const trendPercent = priorAvg !== 0
      ? Math.round(((avg - priorAvg) / priorAvg) * 100)
      : 0;

    const trend: "up" | "down" | "stable" =
      Math.abs(trendPercent) < 3 ? "stable" : trendPercent > 0 ? "up" : "down";

    // 30-day baseline
    const baselineValues = baselineGrouped[metric]?.values || [];
    const baseline30d = baselineValues.length >= 7
      ? Math.round(baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length * 10) / 10
      : null;
    const baselineDeviation = baseline30d && baseline30d !== 0
      ? Math.round(((avg - baseline30d) / baseline30d) * 100)
      : null;

    // Age-band percentile
    const pResult = getVitalPercentile(metric, avg, playerAge);

    const summary = buildMetricSummary(config, avg, trend, trendPercent, pResult?.zoneLabel ?? null);
    const contextInsight = buildContextInsight(config, avg, pResult, baseline30d, baselineDeviation);

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
      lastRecordedAt: grouped.lastDate,
      percentile: pResult?.percentile ?? null,
      zone: pResult?.zone ?? null,
      zoneLabel: pResult?.zoneLabel ?? null,
      baseline30d,
      baselineDeviation,
      contextInsight,
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
  const stories = buildCombinedStories(metrics);

  return { metrics, stories, periodStart, periodEnd, overallSummary };
}

// ── Helpers ─────────────────────────────────────────────────────────────

interface GroupedMetric {
  values: number[];
  lastDate: string | null;
}

function groupByMetric(data: Array<{ metric_type: string; value: number; date: string }>): Record<string, GroupedMetric> {
  const grouped: Record<string, GroupedMetric> = {};
  for (const row of data) {
    if (!grouped[row.metric_type]) {
      grouped[row.metric_type] = { values: [], lastDate: null };
    }
    grouped[row.metric_type].values.push(Number(row.value));
    if (!grouped[row.metric_type].lastDate || row.date > grouped[row.metric_type].lastDate!) {
      grouped[row.metric_type].lastDate = row.date;
    }
  }
  return grouped;
}

function buildMetricSummary(
  config: { label: string; unit: string; direction: "higher_better" | "lower_better" },
  avg: number,
  trend: "up" | "down" | "stable",
  trendPercent: number,
  zoneLabel: string | null
): string {
  const trendWord = trend === "stable"
    ? "holding steady"
    : `${trend === "up" ? "up" : "down"} ${Math.abs(trendPercent)}% from last week`;

  const isGoodTrend =
    (config.direction === "higher_better" && trend === "up") ||
    (config.direction === "lower_better" && trend === "down") ||
    trend === "stable";

  const vibe = isGoodTrend ? "Looking good" : "Worth watching";
  const zoneNote = zoneLabel ? ` (${zoneLabel})` : "";

  return `Your ${config.label} averaged ${avg}${config.unit} this week${zoneNote} — ${trendWord}. ${vibe}.`;
}

function buildContextInsight(
  config: { label: string; unit: string; direction: "higher_better" | "lower_better" },
  avg: number,
  pResult: { percentile: number; zone: string; zoneLabel: string } | null,
  baseline30d: number | null,
  baselineDeviation: number | null
): string | null {
  const parts: string[] = [];

  if (pResult) {
    parts.push(pResult.zoneLabel);
  }

  if (baseline30d != null && baselineDeviation != null && Math.abs(baselineDeviation) >= 5) {
    const dir = baselineDeviation > 0 ? "above" : "below";
    parts.push(`${Math.abs(baselineDeviation)}% ${dir} your usual ${baseline30d}${config.unit}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

// ── Story Blocks ────────────────────────────────────────────────────────

function buildCombinedStories(metrics: VitalMetricSummary[]): VitalStoryBlock[] {
  const byMetric = new Map(metrics.map((m) => [m.metric, m]));
  const stories: VitalStoryBlock[] = [];

  // 1. Recovery Signal — HRV + Resting HR + Sleep
  const recoveryMetrics = ["hrv", "resting_hr", "sleep_hours"].filter((k) => byMetric.has(k));
  if (recoveryMetrics.length >= 2) {
    const scores: number[] = recoveryMetrics.map((k) => {
      const m = byMetric.get(k)!;
      if (m.zone === "elite" || m.zone === "good") return 1;
      if (m.zone === "average") return 0.5;
      return 0;
    });
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const status: "strong" | "mixed" | "weak" = avgScore >= 0.7 ? "strong" : avgScore >= 0.4 ? "mixed" : "weak";

    const narrativeParts: string[] = [];
    const hrv = byMetric.get("hrv");
    const rhr = byMetric.get("resting_hr");
    const sleep = byMetric.get("sleep_hours");
    if (hrv) narrativeParts.push(`HRV at ${hrv.avg}${hrv.unit} (${hrv.zoneLabel || hrv.trend})`);
    if (rhr) narrativeParts.push(`resting HR at ${rhr.avg}${rhr.unit}`);
    if (sleep) narrativeParts.push(`sleeping ${sleep.avg}${sleep.unit}`);

    const statusNarrative = status === "strong"
      ? "Your recovery signals look solid — your body is bouncing back well."
      : status === "mixed"
      ? `Mixed recovery signals: ${narrativeParts.join(", ")}. Some areas need attention.`
      : `Recovery is lagging: ${narrativeParts.join(", ")}. Prioritize rest and sleep tonight.`;

    stories.push({
      storyId: "recovery_signal",
      title: "Recovery Signal",
      emoji: "",
      status,
      statusColor: status === "strong" ? "#30D158" : status === "mixed" ? "#F39C12" : "#E74C3C",
      narrative: statusNarrative,
      contributingMetrics: recoveryMetrics,
    });
  }

  // 2. Training Load Impact — Steps + Heart Rate + trend direction
  const loadMetrics = ["steps", "heart_rate", "calories"].filter((k) => byMetric.has(k));
  if (loadMetrics.length >= 2) {
    const upTrends = loadMetrics.filter((k) => byMetric.get(k)!.trend === "up").length;
    const status: "strong" | "mixed" | "weak" = upTrends >= 2 ? "strong" : upTrends >= 1 ? "mixed" : "weak";

    const stepsM = byMetric.get("steps");
    const hrM = byMetric.get("heart_rate");

    const narrative = status === "strong"
      ? `Activity levels are up this week${stepsM ? ` (${stepsM.avg} steps/day)` : ""}. Your body is adapting well to the load.`
      : status === "mixed"
      ? `Some activity metrics are climbing while others are flat. Keep monitoring how you feel.`
      : `Activity and load metrics are trending down. Could be a good recovery week, or time to pick it up.`;

    stories.push({
      storyId: "load_impact",
      title: "Training Load",
      emoji: "",
      status,
      statusColor: status === "strong" ? "#30D158" : status === "mixed" ? "#F39C12" : "#E74C3C",
      narrative,
      contributingMetrics: loadMetrics,
    });
  }

  // 3. Sleep-Recovery Connection — Sleep trend vs HRV trend
  const sleepM = byMetric.get("sleep_hours");
  const hrvM = byMetric.get("hrv");
  if (sleepM && hrvM) {
    const bothUp = sleepM.trend === "up" && hrvM.trend === "up";
    const bothDown = sleepM.trend === "down" && hrvM.trend === "down";
    const status: "strong" | "mixed" | "weak" = bothUp ? "strong" : bothDown ? "weak" : "mixed";

    const narrative = bothUp
      ? `Better sleep is boosting your recovery — HRV up ${Math.abs(hrvM.trendPercent)}% alongside improved sleep.`
      : bothDown
      ? `Sleep and HRV are both dropping. Focus on getting to bed earlier tonight.`
      : `Sleep and HRV are moving in different directions. Watch for patterns over the next few days.`;

    stories.push({
      storyId: "sleep_recovery",
      title: "Sleep & Recovery",
      emoji: "",
      status,
      statusColor: status === "strong" ? "#30D158" : status === "mixed" ? "#F39C12" : "#E74C3C",
      narrative,
      contributingMetrics: ["sleep_hours", "hrv"],
    });
  }

  // 4. Trend Summary — What's improving, declining, stable
  if (metrics.length >= 3) {
    const improving = metrics.filter((m) => {
      const cfg = METRIC_CONFIG[m.metric];
      if (!cfg) return false;
      return (cfg.direction === "higher_better" && m.trend === "up") ||
             (cfg.direction === "lower_better" && m.trend === "down");
    });
    const declining = metrics.filter((m) => {
      const cfg = METRIC_CONFIG[m.metric];
      if (!cfg) return false;
      return (cfg.direction === "higher_better" && m.trend === "down") ||
             (cfg.direction === "lower_better" && m.trend === "up");
    });

    const parts: string[] = [];
    if (improving.length > 0) parts.push(`${improving.map((m) => m.label).join(", ")} trending well`);
    if (declining.length > 0) parts.push(`${declining.map((m) => m.label).join(", ")} need attention`);
    if (parts.length === 0) parts.push("All vitals holding steady this week");

    const status: "strong" | "mixed" | "weak" = declining.length === 0 ? "strong" : improving.length > declining.length ? "mixed" : "weak";

    stories.push({
      storyId: "trend_summary",
      title: "Weekly Trend",
      emoji: "",
      status,
      statusColor: status === "strong" ? "#30D158" : status === "mixed" ? "#F39C12" : "#E74C3C",
      narrative: parts.join(". ") + ".",
      contributingMetrics: metrics.map((m) => m.metric),
    });
  }

  return stories;
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
