/**
 * Output Snapshot API
 *
 * GET /api/v1/output/snapshot
 *
 * Returns unified data for the Output screen:
 * - Vitals: 7-day aggregated wearable data + PHV/LTAD
 * - Metrics: Test results grouped by football attribute categories
 * - Programs: PHV-aware training program recommendations
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { aggregateWeeklyVitals } from "@/services/output/weeklyVitalsAggregator";
import { buildPHVDisplay, type PHVDisplayData } from "@/services/output/ltadMapper";
import { getPlayerPHVStage } from "@/services/programs/phvCalculator";
import {
  getPlayerBenchmarkProfile,
  type BenchmarkResult,
} from "@/services/benchmarkService";
import { getInlinePrograms } from "@/services/programs/footballPrograms";
import { getAgeBand } from "@/scripts/seeds/football_benchmark_seed";
import { getRecommendations } from "@/services/recommendations/getRecommendations";
import {
  TEST_GROUPS,
  TEST_GROUP_MAP,
  RAW_TEST_GROUP_MAP,
  RADAR_AXIS_MAP,
  buildCategorySummary,
} from "@/services/testGroupConstants";

// ── Test Group Mapping (imported from shared constants) ─────────────────

interface MetricCategory {
  category: string;
  groupId: string;
  emoji: string;
  colorTheme: string;
  priority: number;
  athleteDescription: string;
  metrics: BenchmarkResult[];
  categoryAvgPercentile: number;
  categorySummary: string;
}

function groupBenchmarksByTestGroup(results: BenchmarkResult[]): MetricCategory[] {
  const groupMap = new Map<string, BenchmarkResult[]>();

  for (const r of results) {
    const groupId = TEST_GROUP_MAP[r.metricKey];
    if (!groupId) continue;
    const existing = groupMap.get(groupId);
    if (existing) existing.push(r);
    else groupMap.set(groupId, [r]);
  }

  const categories: MetricCategory[] = [];
  for (const def of TEST_GROUPS) {
    const metrics = groupMap.get(def.groupId);
    if (!metrics || metrics.length === 0) continue;

    const percentiles = metrics.map((m) => m.percentile);
    const avgPercentile = Math.round(
      percentiles.reduce((a, b) => a + b, 0) / percentiles.length
    );
    categories.push({
      category: def.displayName,
      groupId: def.groupId,
      emoji: def.emoji,
      colorTheme: def.colorTheme,
      priority: def.priority,
      athleteDescription: def.athleteDescription,
      metrics,
      categoryAvgPercentile: avgPercentile,
      categorySummary: buildCategorySummary(def.displayName, avgPercentile),
    });
  }

  // Sort by priority (reference doc order)
  categories.sort((a, b) => a.priority - b.priority);
  return categories;
}

// ── Vital Group Mapping (7 groups from reference doc) ───────────────────

interface VitalGroupResult {
  groupId: string;
  displayName: string;
  emoji: string;
  colorTheme: string;
  priority: number;
  athleteDescription: string;
  metrics: Array<{
    metric: string; label: string; emoji: string; unit: string;
    avg: number | null; min: number | null; max: number | null; count: number;
    trend: "up" | "down" | "stable"; trendPercent: number | null;
    summary: string; color: string;
  }>;
  ragStatus: "green" | "amber" | "red" | "none";
}

const VITAL_GROUPS = [
  {
    groupId: "recovery_readiness", displayName: "Recovery & Readiness", emoji: "🔋",
    colorTheme: "green", priority: 1,
    athleteDescription: "How ready your body is to train hard today. Green = push it. Red = your body needs rest.",
  },
  {
    groupId: "sleep", displayName: "Sleep", emoji: "🌙",
    colorTheme: "purple", priority: 2,
    athleteDescription: "Where your muscles grow and your brain locks in what you learned at training.",
  },
  {
    groupId: "cardio_load", displayName: "Cardiovascular Load", emoji: "❤️‍🔥",
    colorTheme: "red", priority: 3,
    athleteDescription: "How hard your heart and lungs worked. Like a fuel gauge — spend wisely, not all at once.",
  },
  {
    groupId: "activity_movement", displayName: "Activity & Movement", emoji: "🏃",
    colorTheme: "blue", priority: 4,
    athleteDescription: "Your daily movement volume — steps, active minutes, and calories burned.",
  },
  {
    groupId: "body_growth", displayName: "Body & Growth", emoji: "📏",
    colorTheme: "orange", priority: 5,
    athleteDescription: "Your body's physical development — height, weight, and growth stage tracking.",
  },
  {
    groupId: "respiratory_oxygen", displayName: "Respiratory & Oxygen", emoji: "🌬️",
    colorTheme: "teal", priority: 6,
    athleteDescription: "How well your lungs deliver oxygen. Breathing rate changes can flag illness early.",
  },
  {
    groupId: "mental_load", displayName: "Mental Load", emoji: "🧠",
    colorTheme: "pink", priority: 7,
    athleteDescription: "Your mental state — stress, mood, and academic load that affect performance.",
  },
];

const VITAL_GROUP_MAP: Record<string, string> = {
  // Recovery & Readiness
  hrv: "recovery_readiness",
  hrv_rmssd: "recovery_readiness",
  resting_heart_rate: "recovery_readiness",
  // Sleep
  sleep_hours: "sleep",
  sleep_total: "sleep",
  sleep_deep: "sleep",
  sleep_rem: "sleep",
  sleep_efficiency: "sleep",
  // Cardiovascular Load
  heart_rate: "cardio_load",
  avg_heart_rate: "cardio_load",
  vo2max: "cardio_load",
  active_calories: "cardio_load",
  // Activity & Movement
  steps: "activity_movement",
  exercise_minutes: "activity_movement",
  distance: "activity_movement",
  // Body & Growth
  weight: "body_growth",
  body_fat: "body_growth",
  height: "body_growth",
  bmi: "body_growth",
  // Respiratory & Oxygen
  respiratory_rate: "respiratory_oxygen",
  blood_oxygen: "respiratory_oxygen",
  spo2: "respiratory_oxygen",
  // Mental Load
  stress: "mental_load",
  mood: "mental_load",
};

function groupVitalsIntoGroups(
  weekMetrics: Array<{
    metric: string; label: string; emoji: string; unit: string;
    avg: number | null; min: number | null; max: number | null; count: number;
    trend: "up" | "down" | "stable"; trendPercent: number | null;
    summary: string; color: string;
  }>
): VitalGroupResult[] {
  const metricsByGroup = new Map<string, typeof weekMetrics>();

  for (const m of weekMetrics) {
    const groupId = VITAL_GROUP_MAP[m.metric] || VITAL_GROUP_MAP[m.metric.replace(/_/g, "")] || "activity_movement";
    const existing = metricsByGroup.get(groupId);
    if (existing) existing.push(m);
    else metricsByGroup.set(groupId, [m]);
  }

  const results: VitalGroupResult[] = [];
  for (const def of VITAL_GROUPS) {
    const metrics = metricsByGroup.get(def.groupId) || [];
    // Determine RAG status from metrics trends
    let ragStatus: "green" | "amber" | "red" | "none" = "none";
    if (metrics.length > 0) {
      const downCount = metrics.filter((m) => m.trend === "down").length;
      const ratio = downCount / metrics.length;
      ragStatus = ratio > 0.5 ? "red" : ratio > 0.25 ? "amber" : "green";
    }
    results.push({ ...def, metrics, ragStatus });
  }

  return results;
}

// ── Radar Profile (6 axes from test groups) ─────────────────────────────

interface RadarAxisResult {
  key: string;
  label: string;
  value: number;
  maxValue: number;
  color: string;
}

function buildRadarProfile(categories: MetricCategory[]): RadarAxisResult[] {
  const axes: RadarAxisResult[] = [];
  for (const [key, def] of Object.entries(RADAR_AXIS_MAP)) {
    const matchingCats = categories.filter((c) => def.groupIds.includes(c.groupId));
    const avgP = matchingCats.length > 0
      ? Math.round(matchingCats.reduce((s, c) => s + c.categoryAvgPercentile, 0) / matchingCats.length)
      : 0;
    axes.push({ key, label: def.label, value: avgP, maxValue: 99, color: def.color });
  }
  return axes;
}

interface RawTestGroup {
  groupId: string;
  displayName: string;
  emoji: string;
  colorTheme: string;
  priority: number;
  athleteDescription: string;
  tests: Array<{ testType: string; score: number; unit: string; date: string; displayName: string }>;
}

function groupRawTestsIntoGroups(
  recentTests: Array<{ testType: string; score: number; unit: string; date: string }>
): RawTestGroup[] {
  const testsByGroup = new Map<string, Array<{ testType: string; score: number; unit: string; date: string; displayName: string }>>();

  for (const t of recentTests) {
    const groupId = RAW_TEST_GROUP_MAP[t.testType];
    if (!groupId) continue;
    const displayName = t.testType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const entry = { ...t, displayName };
    const existing = testsByGroup.get(groupId);
    if (existing) existing.push(entry);
    else testsByGroup.set(groupId, [entry]);
  }

  const results: RawTestGroup[] = [];
  for (const def of TEST_GROUPS) {
    const tests = testsByGroup.get(def.groupId);
    if (!tests || tests.length === 0) continue;
    results.push({ ...def, tests });
  }

  return results;
}

// ── Readiness Summary ───────────────────────────────────────────────────

interface ReadinessSummary {
  score: string | null; // "Green" | "Yellow" | "Red"
  energy: number | null;
  soreness: number | null;
  sleepHours: number | null;
  mood: number | null;
  date: string | null;
  summary: string;
}

function buildReadinessSummary(checkin: Record<string, unknown> | null): ReadinessSummary {
  if (!checkin) {
    return {
      score: null, energy: null, soreness: null, sleepHours: null, mood: null, date: null,
      summary: "No check-in today. Tap to log how you're feeling.",
    };
  }

  const score = checkin.readiness as string | null;
  const energy = checkin.energy as number;
  const mood = checkin.mood as number;
  const sleepHours = checkin.sleep_hours as number;

  let summary = "";
  if (score === "Green") summary = "You're feeling good and ready to go. Great day to push it.";
  else if (score === "Yellow") summary = "Not fully recovered — consider a lighter session today.";
  else summary = "Your body is asking for rest. Recovery day recommended.";

  return {
    score,
    energy,
    soreness: checkin.soreness as number | null,
    sleepHours,
    mood,
    date: checkin.date as string | null,
    summary,
  };
}

// ── GET Handler ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const userId = auth.user.id;
  const db = supabaseAdmin();

  // 1. Get user profile
  const { data: profile } = await (db as any)
    .from("users")
    .select("name, sport, position, gender, age, date_of_birth, height_cm, weight_kg, current_streak, role")
    .eq("id", userId)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const ageBand = getAgeBand(profile.date_of_birth);

  // 2. Parallel fetches — all wrapped in allSettled for resilience
  const [vitalsResult, phvResult, benchmarkResult, checkinResult, rawTestsResult, devRecsResult] = await Promise.allSettled([
    aggregateWeeklyVitals(userId, 7),
    getPlayerPHVStage(userId),
    getPlayerBenchmarkProfile(userId),
    db
      .from("checkins")
      .select("energy, soreness, sleep_hours, mood, academic_stress, pain_flag, readiness, date")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Also fetch raw test results from phone_test_sessions (for tests without benchmark snapshots)
    db
      .from("phone_test_sessions")
      .select("test_type, score, date, raw_data")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(100),
    // Layer 4 — DEVELOPMENT + CV_OPPORTUNITY recs for program context
    getRecommendations(userId, {
      role: "ATHLETE",
      recTypes: ["DEVELOPMENT", "CV_OPPORTUNITY", "READINESS", "LOAD_WARNING"],
      limit: 5,
    }),
  ]);

  // Extract results with safe fallbacks
  const weekSummary = vitalsResult.status === "fulfilled"
    ? vitalsResult.value
    : { metrics: [], periodStart: "", periodEnd: "", overallSummary: "Could not load vitals." };

  const phvRaw = phvResult.status === "fulfilled" ? phvResult.value : null;
  const phvDisplay: PHVDisplayData | null = phvRaw
    ? buildPHVDisplay(phvRaw.maturityOffset, phvRaw.phvStage)
    : null;

  const benchmarkProfile = benchmarkResult.status === "fulfilled"
    ? benchmarkResult.value
    : null;

  const checkinData = checkinResult.status === "fulfilled"
    ? (checkinResult.value as any)?.data ?? null
    : null;

  const devRecs: any[] = devRecsResult.status === "fulfilled"
    ? (devRecsResult.value as any[])
    : [];

  const rawTests = rawTestsResult.status === "fulfilled"
    ? ((rawTestsResult.value as any)?.data ?? []) as Array<{
        test_type: string; score: number; date: string; raw_data: any;
      }>
    : [];

  // Deduplicate: latest per test_type
  const latestRawByType = new Map<string, { testType: string; score: number; unit: string; date: string }>();
  for (const t of rawTests) {
    if (!latestRawByType.has(t.test_type)) {
      latestRawByType.set(t.test_type, {
        testType: t.test_type,
        score: Number(t.score),
        unit: t.raw_data?.unit || "",
        date: t.date,
      });
    }
  }
  const recentTests = Array.from(latestRawByType.values());

  // 3. Group benchmarks into 7 test groups + build radar profile
  const categories = benchmarkProfile
    ? groupBenchmarksByTestGroup(benchmarkProfile.results)
    : [];
  const radarProfile = buildRadarProfile(categories);

  // 3c. Group raw tests into 7 groups (works even without benchmark snapshots)
  const rawTestGroups = groupRawTestsIntoGroups(recentTests);

  // 3b. Group vitals into 7 vital groups
  const vitalGroups = groupVitalsIntoGroups(weekSummary.metrics || []);

  // 4. Program recommendations — inline from hardcoded data (no DB tables needed)
  const inlineResult = getInlinePrograms(
    profile.position,
    ageBand,
    phvRaw?.phvStage,
    benchmarkProfile?.gaps ?? [],
  );

  // 5. Build unified response
  const snapshot = {
    vitals: {
      weekSummary,
      vitalGroups,
      phv: phvDisplay,
      readiness: buildReadinessSummary(checkinData),
    },
    metrics: {
      categories,
      radarProfile,
      rawTestGroups,
      overallPercentile: benchmarkProfile?.overallPercentile ?? null,
      strengths: benchmarkProfile?.strengths ?? [],
      gaps: benchmarkProfile?.gaps ?? [],
      recentTests,
    },
    programs: {
      recommendations: inlineResult.programs,
      weeklyPlanSuggestion: inlineResult.weeklyPlanSuggestion,
      weeklyStructure: inlineResult.weeklyStructure,
      playerProfile: {
        ageBand,
        phvStage: phvRaw?.phvStage ?? "not_applicable",
        position: profile.position || "ALL",
      },
      // Layer 4 — RIE recs for gap-aware program selection
      rieRecommendations: devRecs.map((r: any) => ({
        recType: r.rec_type,
        priority: r.priority,
        title: r.title,
        bodyShort: r.body_short,
        confidence: r.confidence_score,
      })),
    },
  };

  return NextResponse.json(snapshot, {
    headers: { "api-version": "v1", "Cache-Control": "private, max-age=300" },
  });
}
