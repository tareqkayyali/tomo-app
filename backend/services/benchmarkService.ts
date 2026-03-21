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
  stdDev: number;
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

// ── Normative data metric_name → benchmark metric_key mapping ────────
// The sport_normative_data table uses human-readable metric_name values,
// but TEST_GROUP_MAP and player_benchmark_snapshots use short metric keys.
const NORM_NAME_TO_METRIC_KEY: Record<string, string> = {
  "5m Sprint": "sprint_5m",
  "10m Sprint": "sprint_10m",
  "30m Sprint": "sprint_30m",
  "40m Sprint": "sprint_40m",
  "Max Sprint Speed": "est_max_speed",
  "Flying 20m Sprint": "sprint_20m",
  "Repeated Sprint Avg 6x30m": "rsa_30m",
  "Shot Power": "shot_speed",
  "Max Kick Distance": "kick_distance",
  "Non-Dominant Foot Speed": "nd_foot_speed",
  "Volley Kick Speed": "volley_speed",
  "Shooting Drill Score": "shooting_accuracy",
  "Free Kick Distance": "fk_distance",
  "Shot Release Time": "shot_release",
  "Long Pass Distance": "long_pass",
  "Pass Speed": "pass_speed",
  "Short Pass Drill Time": "short_pass_time",
  "Passing Accuracy Drill": "passing_accuracy",
  "Cross Delivery Distance": "cross_distance",
  "Throw-In Distance": "throwin_distance",
  "Lofted Pass Hang Time": "lofted_pass",
  "T-Test Agility": "agility_505",
  "5-0-5 COD": "agility_505_cod",
  "Illinois Agility Run": "illinois_agility",
  "Slalom Dribble 10 Cones": "dribbling_test",
  "Ball Juggling Count": "juggling",
  "Reaction Time": "reaction_time",
  "Arrowhead Agility": "arrowhead_agility",
  "Standing Vertical Jump": "cmj",
  "Header Distance": "header_distance",
  "Lateral Shuffle 5mx4": "lateral_shuffle",
  "Backward Sprint 10m": "backward_sprint",
  "Isometric Push Strength": "push_strength",
  "Grip Strength": "grip_strength",
  "Recovery Run 40m": "recovery_run",
  "CMJ Jump Height": "cmj",
  "Yo-Yo IR1 Distance": "vo2max",
  "VO2max": "vo2max_direct",
  "Total Match Distance": "match_distance",
  "HRV RMSSD": "hrv_rmssd",
  "Sleep Duration": "sleep_duration",
  "Relative Squat Strength": "squat_rel",
};

/** Extract mean and SD for a specific age from the JSONB arrays (ages 13-23) */
function extractNormForAge(
  means: number[],
  sds: number[],
  age: number,
  ageMin = 13,
  ageMax = 23
): { mean: number; sd: number } {
  const clampedAge = Math.max(ageMin, Math.min(ageMax, age));
  const idx = clampedAge - ageMin;
  return {
    mean: means[idx] ?? means[means.length - 1] ?? 0,
    sd: sds[idx] ?? sds[sds.length - 1] ?? 1,
  };
}

/** Compute p10/p25/p50/p75/p90 from mean + SD using z-scores */
function computePercentilePoints(mean: number, sd: number, direction: string) {
  const zScores = { p10: -1.282, p25: -0.674, p75: 0.674, p90: 1.282 };
  const isHigher = direction === "higher" || direction === "higher_better";

  if (isHigher) {
    return {
      p10: mean + zScores.p10 * sd,
      p25: mean + zScores.p25 * sd,
      p50: mean,
      p75: mean + zScores.p75 * sd,
      p90: mean + zScores.p90 * sd,
    };
  } else {
    // Lower is better: invert — p90 is the fastest (lowest value)
    return {
      p10: mean - zScores.p10 * sd,
      p25: mean - zScores.p25 * sd,
      p50: mean,
      p75: mean - zScores.p75 * sd,
      p90: mean - zScores.p90 * sd,
    };
  }
}

/** Get player's age from DOB */
function getAgeFromDOB(dateOfBirth: string | null): number {
  if (!dateOfBirth) return 18; // default
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return Math.max(13, Math.min(23, age));
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
  const playerAge = getAgeFromDOB(profile.date_of_birth);

  // Find the metric_name that maps to this metricKey
  const metricName = Object.entries(NORM_NAME_TO_METRIC_KEY)
    .find(([, key]) => key === metricKey)?.[0];
  if (!metricName) return null;

  // Fetch from actual table schema (metric_name, means[], sds[])
  const { data: norm } = await db()
    .from("sport_normative_data")
    .select("metric_name, unit, direction, means, sds, age_min, age_max")
    .eq("sport_id", profile.sport || "football")
    .eq("metric_name", metricName)
    .single();

  if (!norm) return null;

  const means = norm.means as number[];
  const sds = norm.sds as number[];
  const { mean, sd } = extractNormForAge(means, sds, playerAge, norm.age_min || 13, norm.age_max || 23);

  const rawDir = norm.direction as string;
  const direction: "lower_better" | "higher_better" =
    rawDir === "lower" || rawDir === "lower_better" ? "lower_better" : "higher_better";

  const percentile = interpolatePercentile(value, mean, sd, direction);
  const zone = getPercentileZone(percentile);
  const points = computePercentilePoints(mean, sd, rawDir);

  const result: BenchmarkResult = {
    metricKey,
    metricLabel: norm.metric_name as string,
    unit: (norm.unit as string) || "",
    direction,
    value,
    percentile,
    zone,
    ageBand,
    position,
    competitionLvl: "elite",
    norm: {
      p10: points.p10,
      p25: points.p25,
      p50: points.p50,
      p75: points.p75,
      p90: points.p90,
    },
    message: buildMessage(zone, norm.metric_name as string, percentile),
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
    competition_lvl: "elite",
    tested_at: options?.testedAt || new Date().toISOString().slice(0, 10),
    source: options?.source || "manual",
  });

  return result;
}

// buildResult removed — logic moved inline into calculatePercentile()

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

  // Fetch ALL normative data for this sport (actual table schema: metric_name, means[], sds[])
  const { data: allNorms } = await db()
    .from("sport_normative_data")
    .select("metric_name, unit, direction, means, sds, age_min, age_max, attribute_key")
    .eq("sport_id", profile.sport || "football");

  // Index norms by metric_key (translated from metric_name)
  const playerAge = getAgeFromDOB(profile.date_of_birth);
  const normsByMetric = new Map<string, {
    metricLabel: string; unit: string; direction: string;
    p10: number; p25: number; p50: number; p75: number; p90: number; sd: number;
  }>();

  if (allNorms) {
    for (const norm of allNorms as Record<string, unknown>[]) {
      const metricName = norm.metric_name as string;
      const metricKey = NORM_NAME_TO_METRIC_KEY[metricName];
      if (!metricKey) continue;

      const means = norm.means as number[];
      const sds = norm.sds as number[];
      const { mean, sd } = extractNormForAge(means, sds, playerAge, (norm.age_min as number) || 13, (norm.age_max as number) || 23);
      const points = computePercentilePoints(mean, sd, norm.direction as string);

      normsByMetric.set(metricKey, {
        metricLabel: metricName,
        unit: (norm.unit as string) || "",
        direction: norm.direction as string,
        ...points,
        sd,
      });
    }
  }

  // Build results from snapshots + norms
  const results: BenchmarkResult[] = [];
  for (const [metricKey, snapshot] of latestByMetric) {
    const norm = normsByMetric.get(metricKey);
    // If no norm, still include the snapshot with its stored percentile
    const rawDir = norm?.direction || "higher";
    const direction: "lower_better" | "higher_better" =
      rawDir === "lower" || rawDir === "lower_better" ? "lower_better" : "higher_better";
    const value = Number(snapshot.value);
    const percentile = Number(snapshot.percentile);
    const zone = snapshot.zone as PercentileZone;
    const metricLabel = norm?.metricLabel || (snapshot.metric_label as string) || metricKey;

    results.push({
      metricKey,
      metricLabel,
      unit: norm?.unit || (snapshot.metric_label as string) || "",
      direction,
      value,
      percentile,
      zone,
      ageBand,
      position,
      competitionLvl: "elite",
      norm: norm
        ? { p10: norm.p10, p25: norm.p25, p50: norm.p50, p75: norm.p75, p90: norm.p90 }
        : { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 },
      message: buildMessage(zone, metricLabel, percentile),
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
  _position: string,
  ageBand: string,
  _gender: string,
  _level: string
): Promise<NormRow[]> {
  // The actual sport_normative_data table stores means/sds arrays by age,
  // not separate rows per position/gender/level. We extract for the age band.
  const { data } = await db()
    .from("sport_normative_data")
    .select("metric_name, unit, direction, means, sds, age_min, age_max")
    .eq("sport_id", sportId || "football")
    .order("metric_name");

  if (!data) return [];

  // Convert ageBand to an age number for array index lookup
  const ageMap: Record<string, number> = {
    U13: 13, U15: 14, U17: 16, U19: 18, SEN: 21, SEN30: 23, VET: 23,
  };
  const age = ageMap[ageBand] ?? 18;

  return (data as Record<string, unknown>[]).flatMap((row) => {
    const metricName = row.metric_name as string;
    const metricKey = NORM_NAME_TO_METRIC_KEY[metricName];
    if (!metricKey) return [];

    const means = row.means as number[];
    const sds = row.sds as number[];
    const { mean, sd } = extractNormForAge(means, sds, age, (row.age_min as number) || 13, (row.age_max as number) || 23);
    const points = computePercentilePoints(mean, sd, row.direction as string);
    const rawDir = row.direction as string;
    const direction: "lower_better" | "higher_better" =
      rawDir === "lower" || rawDir === "lower_better" ? "lower_better" : "higher_better";

    return [{
      metricKey,
      metricLabel: metricName,
      unit: (row.unit as string) || "",
      direction,
      ...points,
      stdDev: sd,
      sourceRef: "",
    }];
  });
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
