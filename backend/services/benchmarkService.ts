/**
 * Benchmark Service
 *
 * Calculates real-time percentile rankings for player test results
 * against position/age/gender normative data.
 *
 * NOTE: Uses `as any` casts for Supabase queries on new columns/tables
 * that aren't yet in the auto-generated database.ts types.
 * Regenerate types after running the migration to remove these casts:
 *   npx supabase gen types typescript --local > types/database.ts
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  interpolatePercentile,
  getAgeBand,
  getPercentileZone,
} from "@/scripts/seeds/football_benchmark_seed";

// ── Types ───────────────────────────────────────────────────────────

export type PercentileZone = "elite" | "good" | "average" | "developing" | "below";

export interface BenchmarkResult {
  metricKey: string;
  metricLabel: string;
  unit: string;
  direction: "lower_better" | "higher_better";
  value: number;
  percentile: number;
  zone: PercentileZone;
  ageBand: string;
  position: string;
  competitionLvl: string;
  norm: { p10: number; p25: number; p50: number; p75: number; p90: number };
  message: string;
}

export interface BenchmarkProfile {
  userId: string;
  ageBand: string;
  position: string;
  gender: string;
  results: BenchmarkResult[];
  overallPercentile: number;
  strengths: string[];
  gaps: string[];
  updatedAt: string;
}

export interface MetricTrajectoryPoint {
  date: string;
  value: number;
  percentile: number;
  zone: PercentileZone;
}

export interface NormRow {
  metricKey: string;
  metricLabel: string;
  unit: string;
  direction: "lower_better" | "higher_better";
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  sourceRef: string;
}

// ── Phone Test to Metric Mapping ────────────────────────────────────

export const PHONE_TEST_TO_METRIC: Record<string, string> = {
  jump: "cmj",
  sprint: "sprint_10m",
  reaction: "reaction_time",
  agility: "agility_505",
  balance: "hrv_rmssd",
};

// ── Coaching Messages ───────────────────────────────────────────────

function buildMessage(zone: PercentileZone, metricLabel: string, percentile: number): string {
  switch (zone) {
    case "elite":
      return `Outstanding ${metricLabel} — you're in the top 10%. Keep maintaining this strength.`;
    case "good":
      return `Strong ${metricLabel} — you're above average. Small gains here could push you to elite level.`;
    case "average":
      return `Your ${metricLabel} is around the P${percentile} mark. Consistent training will help you move up.`;
    case "developing":
      return `Your ${metricLabel} has room to grow. Focus on targeted drills to build this area.`;
    case "below":
      return `${metricLabel} is a priority area for development. Talk to your coach about a focused improvement plan.`;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return supabaseAdmin();
}

// ── Core Functions ──────────────────────────────────────────────────

async function getPlayerProfile(userId: string) {
  const { data } = await db()
    .from("users")
    .select("date_of_birth, position, gender, sport, age")
    .eq("id", userId)
    .single();

  return data as { date_of_birth: string | null; position: string | null; gender: string | null; sport: string; age: number | null } | null;
}

export async function calculatePercentile(
  userId: string,
  metricKey: string,
  value: number,
  options?: { source?: string; testedAt?: string }
): Promise<BenchmarkResult | null> {
  const profile = await getPlayerProfile(userId);
  if (!profile) return null;

  const ageBand = getAgeBand(profile.date_of_birth);
  const position = profile.position || "ALL";
  const gender = profile.gender || "male";
  const level = "elite";

  const { data: norm } = await db()
    .from("sport_normative_data")
    .select("*")
    .eq("sport_id", "football")
    .eq("metric_key", metricKey)
    .eq("position_group", position)
    .eq("age_band", ageBand)
    .eq("gender", gender)
    .eq("competition_lvl", level)
    .single();

  if (!norm) {
    const { data: fallback } = await db()
      .from("sport_normative_data")
      .select("*")
      .eq("sport_id", "football")
      .eq("metric_key", metricKey)
      .eq("position_group", "ALL")
      .eq("age_band", ageBand)
      .eq("gender", gender)
      .eq("competition_lvl", level)
      .single();

    if (!fallback) return null;
    return buildResult(userId, fallback, value, ageBand, "ALL", level, options);
  }

  return buildResult(userId, norm, value, ageBand, position, level, options);
}

async function buildResult(
  userId: string,
  norm: Record<string, unknown>,
  value: number,
  ageBand: string,
  position: string,
  level: string,
  options?: { source?: string; testedAt?: string }
): Promise<BenchmarkResult> {
  const direction = norm.direction as "lower_better" | "higher_better";
  const p50 = Number(norm.p50);
  const sd = Number(norm.std_dev);
  const percentile = interpolatePercentile(value, p50, sd, direction);
  const zone = getPercentileZone(percentile);

  const result: BenchmarkResult = {
    metricKey: norm.metric_key as string,
    metricLabel: norm.metric_label as string,
    unit: norm.unit as string,
    direction,
    value,
    percentile,
    zone,
    ageBand,
    position,
    competitionLvl: level,
    norm: {
      p10: Number(norm.p10),
      p25: Number(norm.p25),
      p50,
      p75: Number(norm.p75),
      p90: Number(norm.p90),
    },
    message: buildMessage(zone, norm.metric_label as string, percentile),
  };

  // Persist snapshot
  await db().from("player_benchmark_snapshots").insert({
    user_id: userId,
    metric_key: result.metricKey,
    metric_label: result.metricLabel,
    value,
    percentile,
    zone,
    age_band_used: ageBand,
    position_used: position,
    competition_lvl: level,
    tested_at: options?.testedAt || new Date().toISOString().slice(0, 10),
    source: options?.source || "manual",
  });

  return result;
}

export async function getPlayerBenchmarkProfile(
  userId: string
): Promise<BenchmarkProfile | null> {
  const profile = await getPlayerProfile(userId);
  if (!profile) return null;

  const ageBand = getAgeBand(profile.date_of_birth);
  const position = profile.position || "ALL";
  const gender = profile.gender || "male";

  const { data: snapshots } = await db()
    .from("player_benchmark_snapshots")
    .select("*")
    .eq("user_id", userId)
    .order("tested_at", { ascending: false });

  if (!snapshots || snapshots.length === 0) return null;

  // Deduplicate: keep latest per metric
  const latestByMetric = new Map<string, Record<string, unknown>>();
  for (const s of snapshots as Record<string, unknown>[]) {
    const key = s.metric_key as string;
    if (!latestByMetric.has(key)) {
      latestByMetric.set(key, s);
    }
  }

  // Build results with current norms
  const results: BenchmarkResult[] = [];
  for (const [metricKey, snapshot] of latestByMetric) {
    const { data: norm } = await db()
      .from("sport_normative_data")
      .select("*")
      .eq("sport_id", "football")
      .eq("metric_key", metricKey)
      .eq("position_group", position)
      .eq("age_band", ageBand)
      .eq("gender", gender)
      .eq("competition_lvl", "elite")
      .single();

    if (!norm) continue;

    const direction = (norm as Record<string, unknown>).direction as "lower_better" | "higher_better";
    const value = Number(snapshot.value);
    const percentile = Number(snapshot.percentile);
    const zone = snapshot.zone as PercentileZone;

    results.push({
      metricKey,
      metricLabel: (norm as Record<string, unknown>).metric_label as string,
      unit: (norm as Record<string, unknown>).unit as string,
      direction,
      value,
      percentile,
      zone,
      ageBand,
      position,
      competitionLvl: "elite",
      norm: {
        p10: Number((norm as Record<string, unknown>).p10),
        p25: Number((norm as Record<string, unknown>).p25),
        p50: Number((norm as Record<string, unknown>).p50),
        p75: Number((norm as Record<string, unknown>).p75),
        p90: Number((norm as Record<string, unknown>).p90),
      },
      message: buildMessage(zone, (norm as Record<string, unknown>).metric_label as string, percentile),
    });
  }

  if (results.length === 0) return null;

  const percentiles = results.map((r) => r.percentile);
  const overallPercentile = Math.round(
    percentiles.reduce((a, b) => a + b, 0) / percentiles.length
  );

  const sorted = [...results].sort((a, b) => b.percentile - a.percentile);
  const strengths = sorted
    .filter((r) => r.percentile >= 75)
    .slice(0, 3)
    .map((r) => r.metricLabel);
  const gaps = sorted
    .filter((r) => r.percentile < 40)
    .slice(-3)
    .map((r) => r.metricLabel);

  return {
    userId,
    ageBand,
    position,
    gender,
    results,
    overallPercentile,
    strengths,
    gaps,
    updatedAt: new Date().toISOString(),
  };
}

export async function getMetricTrajectory(
  userId: string,
  metricKey: string,
  limitMonths = 12
): Promise<MetricTrajectoryPoint[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - limitMonths);

  const { data } = await db()
    .from("player_benchmark_snapshots")
    .select("tested_at, value, percentile, zone")
    .eq("user_id", userId)
    .eq("metric_key", metricKey)
    .gte("tested_at", cutoff.toISOString().slice(0, 10))
    .order("tested_at", { ascending: true });

  if (!data) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    date: row.tested_at as string,
    value: Number(row.value),
    percentile: Number(row.percentile),
    zone: row.zone as PercentileZone,
  }));
}

export async function getPositionNorms(
  sportId: string,
  position: string,
  ageBand: string,
  gender: string,
  level: string
): Promise<NormRow[]> {
  const { data } = await db()
    .from("sport_normative_data")
    .select("metric_key, metric_label, unit, direction, p10, p25, p50, p75, p90, source_ref")
    .eq("sport_id", sportId || "football")
    .eq("position_group", position)
    .eq("age_band", ageBand)
    .eq("gender", gender)
    .eq("competition_lvl", level)
    .order("metric_key");

  if (!data) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    metricKey: row.metric_key as string,
    metricLabel: row.metric_label as string,
    unit: row.unit as string,
    direction: row.direction as "lower_better" | "higher_better",
    p10: Number(row.p10),
    p25: Number(row.p25),
    p50: Number(row.p50),
    p75: Number(row.p75),
    p90: Number(row.p90),
    sourceRef: row.source_ref as string,
  }));
}

export async function processPhoneTestBenchmark(
  userId: string,
  testType: string,
  score: number | null | undefined,
  testedAt?: string
): Promise<BenchmarkResult | null> {
  if (score == null) return null;

  const metricKey = PHONE_TEST_TO_METRIC[testType];
  if (!metricKey) return null;

  return calculatePercentile(userId, metricKey, score, {
    source: "phone_test",
    testedAt,
  });
}
