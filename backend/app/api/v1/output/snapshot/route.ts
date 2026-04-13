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
import { requireAuth, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { aggregateWeeklyVitals } from "@/services/output/weeklyVitalsAggregator";
import { getVitalPercentile } from "@/services/output/vitalsNormativeData";
import { buildPHVDisplay, type PHVDisplayData } from "@/services/output/ltadMapper";
import { getPlayerPHVStage } from "@/services/programs/phvCalculator";
import {
  getPlayerBenchmarkProfile,
  type BenchmarkResult,
} from "@/services/benchmarkService";
import { getInlinePrograms } from "@/services/programs/footballPrograms";
import { getCachedProgramRecommendations, triggerDeepProgramRefreshAsync } from "@/services/programs/deepProgramRefresh";
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
    groupId: "recovery_readiness", displayName: "Recovery & Readiness", emoji: "",
    colorTheme: "green", priority: 1,
    athleteDescription: "How ready your body is to train hard today. Green = push it. Red = your body needs rest.",
  },
  {
    groupId: "sleep", displayName: "Sleep", emoji: "",
    colorTheme: "purple", priority: 2,
    athleteDescription: "Where your muscles grow and your brain locks in what you learned at training.",
  },
  {
    groupId: "cardio_load", displayName: "Cardiovascular Load", emoji: "",
    colorTheme: "red", priority: 3,
    athleteDescription: "How hard your heart and lungs worked. Like a fuel gauge — spend wisely, not all at once.",
  },
  {
    groupId: "activity_movement", displayName: "Activity & Movement", emoji: "",
    colorTheme: "blue", priority: 4,
    athleteDescription: "Your daily movement volume — steps, active minutes, and calories burned.",
  },
  {
    groupId: "body_growth", displayName: "Body & Growth", emoji: "",
    colorTheme: "orange", priority: 5,
    athleteDescription: "Your body's physical development — height, weight, and growth stage tracking.",
  },
  {
    groupId: "respiratory_oxygen", displayName: "Respiratory & Oxygen", emoji: "",
    colorTheme: "teal", priority: 6,
    athleteDescription: "How well your lungs deliver oxygen. Breathing rate changes can flag illness early.",
  },
  {
    groupId: "mental_load", displayName: "Mental Load", emoji: "",
    colorTheme: "pink", priority: 7,
    athleteDescription: "Your mental state — stress, mood, and academic load that affect performance.",
  },
];

const VITAL_GROUP_MAP: Record<string, string> = {
  // Recovery & Readiness
  hrv: "recovery_readiness",
  hrv_rmssd: "recovery_readiness",
  resting_hr: "recovery_readiness",         // stored as "resting_hr" by whoopService
  resting_heart_rate: "recovery_readiness", // legacy alias
  recovery_score: "recovery_readiness",     // whoop recovery score (0-100%)
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
  calories: "cardio_load",       // stored as "calories" by whoopService (from kilojoules)
  active_calories: "cardio_load", // legacy alias
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
  body_temp: "respiratory_oxygen", // whoop skin temp (closest group)
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
  recentTests: Array<{ testType: string; score: number; unit: string; date: string; source?: string; coachId?: string; coachName?: string }>
): RawTestGroup[] {
  const testsByGroup = new Map<string, Array<{ testType: string; score: number; unit: string; date: string; displayName: string; source?: string; coachName?: string }>>();

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

function buildReadinessSummary(checkin: Record<string, unknown> | null): ReadinessSummary & { expired: boolean } {
  if (!checkin) {
    return {
      score: null, energy: null, soreness: null, sleepHours: null, mood: null, date: null,
      summary: "No check-in today. Tap to log how you're feeling.",
      expired: true,
    };
  }

  // Check if the checkin is from today
  const today = new Date().toISOString().slice(0, 10);
  const checkinDate = checkin.date as string | null;
  const isExpired = !checkinDate || checkinDate < today;

  if (isExpired) {
    return {
      score: null, energy: null, soreness: null, sleepHours: null, mood: null,
      date: checkinDate,
      summary: "Yesterday's check-in has expired. How are you feeling today?",
      expired: true,
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
    date: checkinDate,
    summary,
    expired: false,
  };
}

// ── GET Handler ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
  // Support coach/parent viewing a player's output data
  const targetPlayerId = req.nextUrl.searchParams.get("targetPlayerId");
  let userId = auth.user.id;

  if (targetPlayerId) {
    // Verify the requesting user has a relationship with the target player
    const rel = await requireRelationship(auth.user.id, targetPlayerId);
    if ("error" in rel) return rel.error;
    userId = targetPlayerId;
  }

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
  const [vitalsResult, phvResult, benchmarkResult, checkinResult, rawTestsResult, devRecsResult, aiProgramsResult] = await Promise.allSettled([
    aggregateWeeklyVitals(userId, 7, profile.age ?? (profile.date_of_birth ? computeDecimalAge(profile.date_of_birth) : null)),
    getPlayerPHVStage(userId),
    getPlayerBenchmarkProfile(userId),
    db
      .from("checkins")
      .select("energy, soreness, sleep_hours, mood, academic_stress, pain_flag, readiness, date")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Also fetch raw test results from both test tables (for tests without benchmark snapshots)
    Promise.all([
      db.from("phone_test_sessions").select("test_type, score, date, raw_data").eq("user_id", userId).order("date", { ascending: false }).limit(100),
      db.from("football_test_results").select("test_type, primary_value, date, raw_inputs").eq("user_id", userId).order("date", { ascending: false }).limit(100),
    ]).then(([phone, football]) => ({
      data: [
        ...(phone.data ?? []),
        ...(football.data ?? []).map((t: any) => ({ test_type: t.test_type, score: t.primary_value, date: t.date, raw_data: t.raw_inputs })),
      ],
      error: phone.error,
    })),
    // Layer 4 — DEVELOPMENT + CV_OPPORTUNITY recs for program context
    getRecommendations(userId, {
      role: "ATHLETE",
      recTypes: ["DEVELOPMENT", "CV_OPPORTUNITY", "READINESS", "LOAD_WARNING"],
      limit: 5,
    }),
    // Layer 5 — AI-generated program recommendations (cached)
    getCachedProgramRecommendations(userId),
  ]);

  // Extract results with safe fallbacks
  const weekSummary = vitalsResult.status === "fulfilled"
    ? vitalsResult.value
    : { metrics: [], periodStart: "", periodEnd: "", overallSummary: "Could not load vitals." };

  const phvRaw = phvResult.status === "fulfilled" ? phvResult.value : null;
  const phvDisplay: (PHVDisplayData & { standingHeightCm?: number; sittingHeightCm?: number; weightKg?: number }) | null = phvRaw
    ? {
        ...buildPHVDisplay(phvRaw.maturityOffset, phvRaw.phvStage),
        standingHeightCm: (phvRaw as any).standingHeightCm,
        sittingHeightCm: (phvRaw as any).sittingHeightCm,
        weightKg: (phvRaw as any).weightKg,
      }
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

  const aiPrograms = aiProgramsResult.status === "fulfilled"
    ? aiProgramsResult.value
    : null;

  const rawTests = rawTestsResult.status === "fulfilled"
    ? ((rawTestsResult.value as any)?.data ?? []) as Array<{
        test_type: string; score: number; date: string; raw_data: any;
      }>
    : [];

  // Deduplicate: latest per test_type
  const latestRawByType = new Map<string, { testType: string; score: number; unit: string; date: string; source?: string; coachId?: string }>();
  for (const t of rawTests) {
    if (!latestRawByType.has(t.test_type)) {
      latestRawByType.set(t.test_type, {
        testType: t.test_type,
        score: Number(t.score),
        unit: t.raw_data?.unit || "",
        date: t.date,
        source: t.raw_data?.source || undefined,
        coachId: t.raw_data?.coachId || undefined,
      });
    }
  }
  const recentTestsRaw = Array.from(latestRawByType.values());

  // Second parallel block: coach names for tests, coach programs, and program interactions
  // These depend on results from the first block (coachIds from rawTests)
  const coachIds = [...new Set(recentTestsRaw.filter(t => t.coachId).map(t => t.coachId!))];

  const [coachNamesRes, coachProgramsRes, programInteractionsRes] = await Promise.all([
    // Resolve coach names for coach-submitted tests
    coachIds.length > 0
      ? db.from("users").select("id, name").in("id", coachIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    // Fetch coach-assigned programs (from suggestions)
    db
      .from("suggestions")
      .select("id, title, payload, status, author_id, created_at")
      .eq("player_id", userId)
      .eq("suggestion_type", "calendar_event")
      .order("created_at", { ascending: false })
      .limit(20),
    // Fetch program interactions (done/dismissed) to filter out
    (supabaseAdmin() as any)
      .from("program_interactions")
      .select("program_id, action")
      .eq("user_id", userId) as Promise<{ data: Array<{ program_id: string; action: string }> | null }>,
  ]);

  // Extract coach name map for tests
  const coachNameMap: Record<string, string> = {};
  for (const c of coachNamesRes.data || []) coachNameMap[c.id] = c.name;
  const recentTests = recentTestsRaw.map(t => ({
    ...t,
    coachName: t.coachId ? coachNameMap[t.coachId] || undefined : undefined,
  }));

  // 3. Group benchmarks into 7 test groups + build radar profile
  const categories = benchmarkProfile
    ? groupBenchmarksByTestGroup(benchmarkProfile.results)
    : [];
  const radarProfile = buildRadarProfile(categories);

  // 3c. Group raw tests into 7 groups (works even without benchmark snapshots)
  const rawTestGroups = groupRawTestsIntoGroups(recentTests);

  // 3b. Group vitals into 7 vital groups
  const vitalGroups = groupVitalsIntoGroups(weekSummary.metrics || []);

  // 3d. Extract coach-assigned programs
  const coachPrograms = (coachProgramsRes as any).data ?? null;
  const coachProgramEntries = (coachPrograms || []).filter((s: any) => s.payload?.type === 'program');

  // Third parallel block: resolve coach names for programs (depends on coachProgramEntries)
  const programCoachIds = [...new Set(coachProgramEntries.map((s: any) => s.author_id).filter(Boolean))] as string[];
  const programCoachNames: Record<string, string> = {};
  if (programCoachIds.length > 0) {
    const { data: coaches } = await db.from("users").select("id, name").in("id", programCoachIds);
    for (const c of coaches || []) programCoachNames[c.id] = c.name;
  }

  // Convert coach programs to InlineProgram format
  const coachProgramsAsInline = coachProgramEntries.map((s: any) => ({
    programId: `coach_${s.id}`,
    name: s.payload?.programName || s.title?.replace('Training Program: ', '') || 'Coach Program',
    category: s.payload?.category || 'strength',
    type: 'physical' as const,
    priority: 'mandatory' as const,
    durationMin: 45,
    durationWeeks: s.payload?.durationWeeks || 4,
    description: s.payload?.description || '',
    impact: `Assigned by Coach ${programCoachNames[s.author_id] || ''}`,
    frequency: s.payload?.frequency || '3x/week',
    difficulty: s.payload?.intensity || 'moderate',
    tags: [s.payload?.category, 'coach-assigned'].filter(Boolean),
    positionNote: '',
    reason: `Your coach ${programCoachNames[s.author_id] || ''} assigned this ${s.payload?.duration || ''} ${s.payload?.categoryLabel || s.payload?.category || ''} program for you.${s.payload?.coachNotes ? ` Notes: ${s.payload.coachNotes}` : ''}`,
    prescription: {
      sets: 3,
      reps: '10-12',
      intensity: s.payload?.intensity || 'moderate',
      rpe: '7',
      rest: '60s',
      frequency: s.payload?.frequency || '3x/week',
      coachingCues: s.payload?.drills?.map((d: any) => `${d.name}: ${d.sets}×${d.reps} (rest ${d.rest})${d.notes ? ` — ${d.notes}` : ''}`) || [],
    },
    phvWarnings: [],
    coachName: programCoachNames[s.author_id] || undefined,
    coachId: s.author_id,
    assignedAt: s.created_at,
  }));

  // Extract program interactions
  const programInteractions = programInteractionsRes.data;

  // Only exclude done/dismissed — keep active and player_selected visible
  const excludedProgramIds = new Set(
    (programInteractions || [])
      .filter((pi: any) => pi.action === 'done' || pi.action === 'dismissed')
      .map((pi: any) => pi.program_id)
  );

  // Player-selected program IDs (to include in response)
  const playerSelectedIds = new Set(
    (programInteractions || [])
      .filter((pi: any) => pi.action === 'player_selected')
      .map((pi: any) => pi.program_id)
  );

  // 4. Program recommendations — AI-first, no hardcoded fallback.
  //
  // Strategy:
  //   - AI programs cached → use them (personalized to full context)
  //   - No AI cache → show "generating" state, frontend triggers deep refresh
  //   - AI always generates based on whatever data is available:
  //     * Full data users: position + age + benchmarks + gaps + load + vitals
  //     * New users: just position + age band (still relevant programs)
  //
  // Data-needed hints help users understand how to get BETTER programs,
  // but we never block programs entirely (AI handles sparse data gracefully).

  const hasTestData = (benchmarkProfile?.results?.length ?? 0) > 0 || rawTests.length > 0;
  const hasCheckinData = checkinData !== null;
  const hasVitalData = weekSummary.metrics?.length > 0;

  // Hints for improving personalization (shown alongside programs)
  const dataNeeded: string[] = [];
  if (!hasCheckinData) dataNeeded.push("Complete a daily check-in for readiness tracking");
  if (!hasTestData) dataNeeded.push("Log a fitness test to benchmark your level");
  if (!hasVitalData) dataNeeded.push("Connect a wearable or log vitals");

  const rieRecsMapped = devRecs.map((r: any) => ({
    recType: r.rec_type,
    priority: r.priority,
    title: r.title,
    bodyShort: r.body_short,
    confidence: r.confidence_score,
  }));

  // Build player-selected programs from catalog
  // Use FOOTBALL_PROGRAMS directly (not getInlinePrograms which filters by position)
  const playerSelectedPrograms: any[] = [];
  if (playerSelectedIds.size > 0) {
    const { FOOTBALL_PROGRAMS } = await import("@/services/programs/footballPrograms");
    for (const def of FOOTBALL_PROGRAMS) {
      if (playerSelectedIds.has(def.id)) {
        const prescription = def.prescriptions[ageBand] ?? def.prescriptions.SEN ?? Object.values(def.prescriptions)[0];
        if (!prescription) continue;
        playerSelectedPrograms.push({
          programId: def.id,
          name: def.name,
          category: def.category,
          type: def.type,
          priority: 'player_selected' as any,
          durationMin: def.duration_minutes,
          durationWeeks: def.duration_weeks,
          description: def.description,
          impact: `You selected this program`,
          frequency: prescription.frequency,
          difficulty: def.difficulty,
          tags: def.tags,
          positionNote: '',
          reason: 'Added by you from the program catalog',
          prescription,
          phvWarnings: [],
        });
      }
    }
  }

  // 5. Build unified response — AI-only, no hardcoded inline fallback
  const programsSection = aiPrograms ? {
    recommendations: [...coachProgramsAsInline, ...playerSelectedPrograms, ...aiPrograms.programs]
      .filter((p: any) => !excludedProgramIds.has(p.programId)),
    weeklyPlanSuggestion: aiPrograms.weeklyPlanSuggestion,
    weeklyStructure: aiPrograms.weeklyStructure,
    playerProfile: aiPrograms.playerProfile,
    isAiGenerated: true,
    generatedAt: aiPrograms.generatedAt,
    dataStatus: "ready" as const,
    dataNeeded, // Show hints even with programs — helps users improve personalization
    rieRecommendations: rieRecsMapped,
  } : {
    // No AI cache — trigger deep refresh in background, show generating state
    ...(() => { triggerDeepProgramRefreshAsync(userId); return {}; })(),
    recommendations: [...coachProgramsAsInline, ...playerSelectedPrograms]
      .filter((p: any) => !excludedProgramIds.has(p.programId)),
    weeklyPlanSuggestion: null,
    weeklyStructure: null,
    playerProfile: {
      ageBand,
      phvStage: phvRaw?.phvStage ?? "not_applicable",
      position: profile.position || "ALL",
    },
    isAiGenerated: false,
    generatedAt: null,
    dataStatus: "generating" as const,
    dataNeeded,
    rieRecommendations: rieRecsMapped,
  };

  // ── Freshness + Real-Time Block ──────────────────────────────────────

  function computeDecimalAge(dob: string): number {
    const birth = new Date(dob);
    const now = new Date();
    return (now.getTime() - birth.getTime()) / (365.25 * 86400000);
  }

  type FreshnessStatus = "fresh" | "aging" | "stale" | "no_data";
  function computeFreshness(lastRecordedAt: string | null): FreshnessStatus {
    if (!lastRecordedAt) return "no_data";
    const hoursAgo = (Date.now() - new Date(lastRecordedAt).getTime()) / 3600000;
    if (hoursAgo < 4) return "fresh";
    if (hoursAgo <= 24) return "aging";
    return "stale";
  }
  function timeAgoLabel(dateStr: string | null): string {
    if (!dateStr) return "No data";
    const hoursAgo = (Date.now() - new Date(dateStr).getTime()) / 3600000;
    if (hoursAgo < 1) return `${Math.round(hoursAgo * 60)}m ago`;
    if (hoursAgo < 24) return `${Math.round(hoursAgo)}h ago`;
    return `${Math.round(hoursAgo / 24)}d ago`;
  }

  /**
   * Build rich context insight for a real-time vital, cross-referencing
   * check-in data (energy, soreness), weekly trends, and recovery state.
   */
  function buildRichContextInsight(
    metric: string,
    value: number | null,
    pResult: { percentile: number; zone: string; zoneLabel: string } | null,
    checkin: Record<string, unknown> | null,
    weekMap: Map<string, any>,
    snapshot: Record<string, unknown> | null,
  ): string {
    if (value == null) return "No data yet — sync your wearable to start tracking.";

    const parts: string[] = [];
    const weekData = weekMap.get(metric);
    const energy = checkin?.energy as number | null;
    const soreness = checkin?.soreness as number | null;
    const sleepCheckin = checkin?.sleep_hours as number | null;

    // ── Load & readiness coherence from snapshot ──
    const acwr = snapshot?.acwr as number | null;
    const injuryRisk = snapshot?.injury_risk_flag as string | null;
    const readinessRag = snapshot?.readiness_rag as string | null;
    const loadDanger = (injuryRisk === "RED" || (acwr != null && acwr > 1.5));
    const loadWarning = !loadDanger && (injuryRisk === "AMBER" || (acwr != null && acwr > 1.3));
    const readinessLow = (readinessRag === "RED" || readinessRag === "AMBER");

    if (pResult) parts.push(pResult.zoneLabel);

    switch (metric) {
      case "hrv": {
        // HRV: connect to recovery, soreness, training load
        if (weekData?.trend === "down" && weekData.trendPercent && Math.abs(weekData.trendPercent) >= 5) {
          parts.push(`Down ${Math.abs(weekData.trendPercent)}% this week — your body may need more recovery.`);
        } else if (weekData?.trend === "up" && weekData.trendPercent && Math.abs(weekData.trendPercent) >= 5) {
          parts.push(`Up ${Math.abs(weekData.trendPercent)}% this week — recovery is trending well.`);
        }
        if (soreness != null && soreness >= 4) {
          parts.push(`You reported high soreness (${soreness}/5) — lower HRV is expected.`);
        }
        // ── Load-aware energy interpretation ──
        if (loadDanger) {
          parts.push(`Training load is high (ACWR ${acwr?.toFixed(1) ?? "elevated"}) — prioritize recovery, not intensity.`);
        } else if (loadWarning) {
          parts.push(`Load is building (ACWR ${acwr?.toFixed(1) ?? "rising"}) — ease into sessions carefully.`);
        } else if (readinessLow) {
          parts.push("Readiness is low today — consider a lighter session even if energy feels okay.");
        } else if (energy != null && energy <= 2) {
          parts.push("Low energy today aligns with this reading. Consider a lighter session.");
        } else if (energy != null && energy >= 4) {
          parts.push("High energy today — your body is ready for a quality session.");
        }
        break;
      }
      case "resting_hr": {
        // Resting HR: connect to stress, recovery, training intensity
        if (weekData?.trend === "up" && weekData.trendPercent && Math.abs(weekData.trendPercent) >= 5) {
          parts.push(`Rising ${Math.abs(weekData.trendPercent)}% this week — could indicate fatigue or stress.`);
        } else if (weekData?.trend === "down" && weekData.trendPercent && Math.abs(weekData.trendPercent) >= 5) {
          parts.push(`Dropping ${Math.abs(weekData.trendPercent)}% — a sign your fitness is improving.`);
        }
        if (soreness != null && soreness >= 4) {
          parts.push("High soreness can elevate resting HR. Prioritize recovery today.");
        }
        if (loadDanger) {
          parts.push("Training load is elevated — monitor resting HR closely for overtraining signs.");
        }
        break;
      }
      case "sleep_hours": {
        // Sleep: connect to recovery needs, next-day performance
        if (value < 7) {
          parts.push("Under 7 hours can hurt recovery and focus. Try to get to bed earlier tonight.");
        } else if (value >= 8.5) {
          parts.push("Great sleep — your body got the recovery time it needs.");
        }
        if (sleepCheckin != null && Math.abs(value - sleepCheckin) > 1) {
          parts.push(`Your check-in reported ${sleepCheckin}h — wearable and feel may differ.`);
        }
        if (loadDanger && value < 8) {
          parts.push("With high training load, aim for 8+ hours to support recovery.");
        } else if (energy != null && energy <= 2 && value >= 7) {
          parts.push("Despite decent sleep, energy is low — watch for signs of overtraining.");
        }
        break;
      }
    }

    return parts.join(" ");
  }

  // Fetch freshness metadata in parallel
  const [wearableConnRes, snapshotMetaRes, latestVitalsRes] = await Promise.all([
    (db as any)
      .from("wearable_connections")
      .select("provider, last_sync_at")
      .eq("user_id", userId)
      .order("last_sync_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (db as any)
      .from("athlete_snapshots")
      .select("snapshot_at, last_checkin_at, hrv_recorded_at, sleep_recorded_at, acwr, injury_risk_flag, readiness_rag, readiness_score, hrv_today_ms, hrv_baseline_ms")
      .eq("athlete_id", userId)
      .maybeSingle(),
    // Latest single readings for real-time block
    db
      .from("health_data")
      .select("metric_type, value, date, created_at")
      .eq("user_id", userId)
      .in("metric_type", ["hrv", "resting_hr", "sleep_hours", "recovery_score", "blood_oxygen", "body_temp", "heart_rate", "calories"])
      .order("date", { ascending: false })
      .limit(50), // fetch enough to get latest per type across all metric types
  ]);

  const wearableConn = (wearableConnRes as any)?.data ?? null;
  const snapshotMeta = (snapshotMetaRes as any)?.data ?? null;
  const latestVitalsRaw = ((latestVitalsRes as any)?.data ?? []) as Array<{
    metric_type: string; value: number; date: string; created_at: string;
  }>;

  // Deduplicate: latest per metric_type
  const latestByType = new Map<string, { value: number; date: string; created_at: string }>();
  for (const v of latestVitalsRaw) {
    if (!latestByType.has(v.metric_type)) {
      latestByType.set(v.metric_type, { value: v.value, date: v.date, created_at: v.created_at });
    }
  }

  // ── Opportunistic snapshot HRV sync ──
  // If health_data has a fresher HRV than the snapshot, update snapshot in background
  // so Chat and all other consumers see the same value.
  const freshHrv = latestByType.get("hrv");
  if (freshHrv && snapshotMeta) {
    const freshVal = Math.round(freshHrv.value * 10) / 10;
    const snapshotVal = snapshotMeta.hrv_today_ms as number | null;
    if (snapshotVal == null || Math.abs(freshVal - snapshotVal) > 0.5) {
      // Fire-and-forget — don't block the response
      (db as any)
        .from("athlete_snapshots")
        .update({ hrv_today_ms: freshVal, snapshot_at: new Date().toISOString() })
        .eq("athlete_id", userId)
        .then(() => {})
        .catch(() => {});
      // Also update local reference so buildRichContextInsight sees fresh value
      snapshotMeta.hrv_today_ms = freshVal;
    }
  }

  const realTimeMetricDefs = [
    { metric: "hrv", label: "HRV", emoji: "", unit: "ms" },
    { metric: "resting_hr", label: "Resting HR", emoji: "", unit: "bpm" },
    { metric: "sleep_hours", label: "Sleep", emoji: "", unit: "hrs" },
  ];

  const playerAge = profile.age ?? (profile.date_of_birth ? computeDecimalAge(profile.date_of_birth) : null);

  // Build weekly metric map for cross-referencing
  const weekMetrics = new Map<string, any>(
    ((weekSummary as any)?.metrics ?? []).map((m: any) => [m.metric as string, m])
  );

  const realTimeMetrics = realTimeMetricDefs.map((def) => {
    const latest = latestByType.get(def.metric);
    const dataDate = latest?.date ?? null;
    const syncedAt = latest?.created_at ?? null;
    const recordedAt = dataDate ?? syncedAt;

    // Use the most recent of (syncedAt, dataDate) to compute freshness.
    // syncedAt is touched on every sync (even when data is unchanged), so after
    // a successful sync the freshness dot turns green/aging immediately.
    // dataDate (YYYY-MM-DD from Whoop) is used for the human-readable "timeAgo"
    // label so users still know when the biological data was captured.
    const freshnessBasis =
      syncedAt && (!dataDate || syncedAt > new Date(dataDate).toISOString())
        ? syncedAt
        : recordedAt;

    const value = latest ? Math.round(latest.value * 10) / 10 : null;

    // Age-band percentile context
    const pResult = value != null ? getVitalPercentile(def.metric, value, playerAge) : null;

    // Build rich context insight cross-referencing training, recovery, schedule
    const contextInsight = buildRichContextInsight(
      def.metric, value, pResult, checkinData, weekMetrics, snapshotMeta
    );

    return {
      ...def,
      value,
      dataDate,
      lastRecordedAt: recordedAt,
      freshness: computeFreshness(freshnessBasis),
      timeAgo: timeAgoLabel(syncedAt ?? recordedAt),
      syncedAt,
      syncTimeAgo: syncedAt ? timeAgoLabel(syncedAt) : null,
      percentile: pResult?.percentile ?? null,
      zone: pResult?.zone ?? null,
      zoneLabel: pResult?.zoneLabel ?? null,
      contextInsight,
    };
  });

  const readinessSummary = buildReadinessSummary(checkinData);
  const checkinFreshness = computeFreshness(snapshotMeta?.last_checkin_at ?? checkinData?.date ?? null);

  const freshnessStatuses = [...realTimeMetrics.map((m) => m.freshness), checkinFreshness];
  const overallFreshness: FreshnessStatus = freshnessStatuses.includes("no_data")
    ? "no_data"
    : freshnessStatuses.includes("stale")
    ? "stale"
    : freshnessStatuses.includes("aging")
    ? "aging"
    : "fresh";

  const lastSyncAt = wearableConn?.last_sync_at ?? null;
  const daysSinceSync = lastSyncAt
    ? Math.round((Date.now() - new Date(lastSyncAt).getTime()) / 86400000)
    : null;

  const staleBanner = (overallFreshness === "stale" || overallFreshness === "no_data")
    ? {
        show: true,
        message: overallFreshness === "no_data"
          ? "No vitals data yet. Connect a wearable or check in to start tracking."
          : `Your vitals haven't been updated in ${daysSinceSync ?? "a few"} days. Sync your wearable or check in.`,
        daysSinceSync: daysSinceSync ?? 0,
      }
    : null;

  const snapshotAt = snapshotMeta?.snapshot_at ?? null;
  const snapshotAgeMinutes = snapshotAt
    ? Math.round((Date.now() - new Date(snapshotAt).getTime()) / 60000)
    : null;

  const snapshot = {
    vitals: {
      // Existing (backward compat)
      weekSummary,
      vitalGroups,
      phv: phvDisplay,
      readiness: readinessSummary,
      // New: freshness metadata
      freshness: {
        lastWearableSyncAt: lastSyncAt,
        lastCheckinAt: snapshotMeta?.last_checkin_at ?? null,
        snapshotAt,
        snapshotAgeMinutes,
      },
      // New: real-time block
      realTime: {
        metrics: realTimeMetrics,
        readiness: {
          ...readinessSummary,
          lastCheckinAt: snapshotMeta?.last_checkin_at ?? checkinData?.date ?? null,
          freshness: checkinFreshness,
          timeAgo: timeAgoLabel(snapshotMeta?.last_checkin_at ?? checkinData?.date ?? null),
        },
        overallFreshness,
        staleBanner,
      },
      // New: historical block (aliases existing data + stories)
      historical: {
        weekSummary,
        vitalGroups,
        stories: (weekSummary as any)?.stories ?? [],
      },
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
    programs: programsSection,
    _v: 2, // Version marker — if you see this in DevTools response, new code is live
  };

  return NextResponse.json(snapshot, {
    headers: {
      "api-version": "v1",
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
  } catch (err) {
    console.error('[GET /api/v1/output/snapshot] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
