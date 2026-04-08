/**
 * Context Builder — builds a player snapshot for agent system prompts.
 * Called ONCE per chat request, passed down to whichever agent(s) are routed.
 *
 * Adapted to actual Tomo DB schema (checkins, calendar_events with start_at/end_at, etc.)
 *
 * Phase 2 enhancement: Optionally enriches PlayerContext from athlete_snapshots (Layer 2)
 * when available, providing ACWR, HRV baselines, wellness trends, and CV data the old
 * checkin-only pipeline cannot supply.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPlayerBenchmarkProfile } from "@/services/benchmarkService";
import { readSnapshot } from "@/services/events/snapshot/snapshotReader";
import { getRecommendations } from "@/services/recommendations/getRecommendations";
import type { Recommendation } from "@/services/recommendations/types";
import type { AthleteSnapshot } from "@/services/events/types";
import {
  DEFAULT_PREFERENCES,
  detectScenario,
  type PlayerSchedulePreferences,
  type ScenarioId,
} from "@/services/scheduling/scheduleRuleEngine";

export interface PlayerContext {
  // Identity
  userId: string;
  name: string;
  sport: string;
  position: string | null;
  ageBand: string | null;
  role: "player" | "coach" | "parent";

  // Anthropometrics (for PHV + program recommendations)
  gender: string | null;
  heightCm: number | null;
  weightKg: number | null;

  // Today
  todayDate: string; // YYYY-MM-DD
  currentTime: string; // HH:MM (24h)
  todayEvents: CalendarEvent[];

  // Readiness (from latest checkin)
  readinessScore: string | null; // 'Green' | 'Yellow' | 'Red'
  checkinDate: string | null; // YYYY-MM-DD of latest checkin
  readinessComponents: {
    energy: number;
    soreness: number;
    sleepHours: number;
    mood: number;
    academicStress: number | null;
    painFlag: boolean;
  } | null;

  // Academic & Upcoming
  upcomingExams: CalendarEvent[];
  upcomingEvents: CalendarEvent[]; // next 7 days, all types (study blocks, training, etc.)
  academicLoadScore: number; // 0-10 derived from exam density

  // Health
  recentVitals: { metric: string; value: number; date: string }[];

  // Performance
  currentStreak: number;
  benchmarkProfile: {
    overallPercentile: number;
    strengths: string[];
    gaps: string[];
    gapAttributes: string[];
    strengthAttributes: string[];
  } | null;
  recentTestScores: { testType: string; score: number; date: string }[];

  // Temporal awareness (Layer 2)
  temporalContext: {
    timeOfDay: "morning" | "afternoon" | "evening" | "night";
    isMatchDay: boolean;
    matchDetails: string | null;
    isExamProximity: boolean;
    examDetails: string | null;
    dayType: "rest" | "light" | "training" | "competition" | "exam";
    suggestion: string;
  };

  // Schedule rules (Layer 2.5)
  schedulePreferences: PlayerSchedulePreferences;
  activeScenario: ScenarioId;

  // Context for routing
  activeTab: "Timeline" | "Output" | "Mastery" | "OwnIt" | "Chat";
  lastUserMessage: string;
  timezone: string; // IANA timezone e.g. "Asia/Riyadh"

  // ── Layer 2 Snapshot enrichment (Phase 2) ─────────────────────────
  // Populated from athlete_snapshots when available; null when snapshot
  // doesn't exist yet (pre-migration or no events recorded).
  snapshotEnrichment: SnapshotEnrichment | null;

  // ── Layer 4 Active Recommendations (RIE) ───────────────────────────
  // Top active recommendations from the Recommendation Intelligence Engine.
  // Injected into system prompt so the AI is always recommendation-aware.
  activeRecommendations: ActiveRecommendation[];
}

/** Lightweight rec summary for system prompt injection */
export interface ActiveRecommendation {
  recType: string;
  priority: number;
  title: string;
  bodyShort: string;
  confidence: number;
}

/** Fields from athlete_snapshots that enhance context beyond legacy queries */
export interface SnapshotEnrichment {
  // Load management (not available from legacy pipeline)
  acwr: number | null;
  atl7day: number | null;
  ctl28day: number | null;
  injuryRiskFlag: string | null;          // GREEN | AMBER | RED
  athleticLoad7day: number | null;
  academicLoad7day: number | null;
  dualLoadIndex: number | null;

  // Projected load (from calendar events)
  projectedLoad7day: number | null;
  projectedACWR: number | null;

  // HRV baselines (computed from 28-day rolling average)
  hrvBaselineMs: number | null;
  hrvTodayMs: number | null;
  sleepQuality: number | null;

  // Wellness trend (7-day rolling)
  wellness7dayAvg: number | null;
  wellnessTrend: string | null;           // IMPROVING | STABLE | DECLINING

  // CV / accumulated metrics
  sessionsTotal: number;
  trainingAgeWeeks: number;
  streakDays: number;
  cvCompleteness: number | null;
  masteryScores: Record<string, number>;
  strengthBenchmarks: Record<string, number>;
  speedProfile: Record<string, number>;
  coachabilityIndex: number | null;

  // PHV
  phvStage: string | null;
  phvOffsetYears: number | null;

  // Triangle
  triangleRag: string | null;
  readinessRag: string | null;
  readinessScore: number | null;          // 0-100 (more granular than Green/Yellow/Red)
  lastCheckinAt: string | null;           // ISO timestamp of last checkin

  // Journal
  journalCompleteness7d: number | null;   // 0–1 ratio
  journalStreakDays: number;
  targetAchievementRate30d: number | null; // 0–1 ratio
  lastJournalAt: string | null;
  pendingPreJournalCount: number;
  pendingPostJournalCount: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  event_type: string;
  start_at: string;
  end_at: string | null;
  notes: string | null;
  intensity: string | null;
}

export async function buildPlayerContext(
  userId: string,
  activeTab: string,
  lastUserMessage: string = "",
  timezone?: string
): Promise<PlayerContext> {
  const db = supabaseAdmin();

  // Use player's timezone for all date/time calculations
  const tz = timezone || "UTC";
  const now = new Date();

  // Get today's date in the player's local timezone
  const today = now.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const currentTime = now.toLocaleTimeString("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }); // HH:MM

  // Build timezone-aware day boundaries for DB queries (ISO strings in UTC)
  const [dayStartISO, dayEndISO] = getDayBoundsISO(today, tz);

  const in14Days = new Date(now.getTime() + 14 * 86400000)
    .toLocaleDateString("en-CA", { timeZone: tz });
  const [, in14DaysEndISO] = getDayBoundsISO(in14Days, tz);

  const in7Days = new Date(now.getTime() + 7 * 86400000)
    .toLocaleDateString("en-CA", { timeZone: tz });
  const [, in7DaysEndISO] = getDayBoundsISO(in7Days, tz);

  // Parallel fetch everything needed (including Layer 2 snapshot + Layer 4 recs)
  const [
    profileRes,
    todayEventsRes,
    checkinRes,
    vitalsRes,
    examsRes,
    benchmarkRes,
    footballTestsRes,
    schedPrefsRes,
    snapshotRes,
    projectedLoadRes,
    recsRes,
    benchmarkProfileRes,
    upcomingEventsRes,
  ] = await Promise.allSettled([
    (db as any)
      .from("users")
      .select("name, sport, age, role, school_hours, exam_periods, current_streak, longest_streak, position, gender, height_cm, weight_kg")
      .eq("id", userId)
      .single(),
    db
      .from("calendar_events")
      .select("id, title, event_type, start_at, end_at, notes, intensity")
      .eq("user_id", userId)
      .gte("start_at", dayStartISO)
      .lte("start_at", dayEndISO)
      .order("start_at"),
    db
      .from("checkins")
      .select(
        "energy, soreness, sleep_hours, mood, academic_stress, pain_flag, readiness, date"
      )
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("health_data")
      .select("metric_type, value, date")
      .eq("user_id", userId)
      .gte(
        "date",
        new Date(Date.now() - 3 * 86400000).toISOString().split("T")[0]
      )
      .order("date", { ascending: false })
      .limit(15),
    db
      .from("calendar_events")
      .select("id, title, event_type, start_at, end_at, notes, intensity")
      .eq("user_id", userId)
      .eq("event_type", "exam")
      .gte("start_at", dayStartISO)
      .lte("start_at", in14DaysEndISO)
      .order("start_at"),
    db
      .from("phone_test_sessions")
      .select("test_type, score, date")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(20),
    db
      .from("football_test_results")
      .select("test_type, primary_value, date")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(20),
    (db as any)
      .from("player_schedule_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    // Layer 2 snapshot — graceful fallback if table doesn't exist or no data yet
    readSnapshot(userId, "ATHLETE"),
    // Projected load: sum estimated_load_au for next 7 days of calendar events
    (db as any)
      .from("calendar_events")
      .select("estimated_load_au")
      .eq("user_id", userId)
      .gte("start_at", dayStartISO)
      .lte("start_at", in7DaysEndISO)
      .not("estimated_load_au", "is", null),
    // Layer 4 recs — top 5 active recommendations for AI context
    getRecommendations(userId, { role: "ATHLETE", limit: 5 }),
    // Benchmark profile from normative data (moved into parallel block)
    getPlayerBenchmarkProfile(userId),
    // Upcoming events (next 7 days, all types) — for study block visibility in recs
    db
      .from("calendar_events")
      .select("id, title, event_type, start_at, end_at, notes, intensity")
      .eq("user_id", userId)
      .gte("start_at", dayEndISO)
      .lte("start_at", in7DaysEndISO)
      .order("start_at"),
  ]);

  const profile =
    profileRes.status === "fulfilled" ? profileRes.value.data : null;
  const todayEvents =
    todayEventsRes.status === "fulfilled"
      ? (todayEventsRes.value.data ?? [])
      : [];
  const latestCheckin =
    checkinRes.status === "fulfilled" ? checkinRes.value.data : null;
  const vitals =
    vitalsRes.status === "fulfilled" ? (vitalsRes.value.data ?? []) : [];
  const exams =
    examsRes.status === "fulfilled" ? (examsRes.value.data ?? []) : [];
  const phoneTests =
    benchmarkRes.status === "fulfilled"
      ? (benchmarkRes.value.data ?? [])
      : [];
  const footballTests =
    footballTestsRes.status === "fulfilled"
      ? ((footballTestsRes.value as any).data ?? []).map((t: any) => ({
          test_type: t.test_type,
          score: t.primary_value,
          date: t.date,
        }))
      : [];
  // Merge both test sources, deduplicate by test_type+date, sort by date desc
  const mergedMap = new Map<string, any>();
  for (const t of [...phoneTests, ...footballTests]) {
    const key = `${t.test_type}_${t.date}`;
    if (!mergedMap.has(key)) mergedMap.set(key, t);
  }
  const testResults = [...mergedMap.values()]
    .sort((a: any, b: any) => (b.date > a.date ? 1 : -1))
    .slice(0, 20);
  const schedPrefsRow =
    schedPrefsRes.status === "fulfilled" ? schedPrefsRes.value.data : null;
  const schedulePreferences: PlayerSchedulePreferences = {
    ...DEFAULT_PREFERENCES,
    ...(schedPrefsRow ?? {}),
  };
  const activeScenario = detectScenario(schedulePreferences);

  // Layer 2 snapshot — null if not yet created (graceful)
  const snapshot: Partial<AthleteSnapshot> | null =
    snapshotRes.status === "fulfilled" ? (snapshotRes.value as Partial<AthleteSnapshot> | null) : null;

  // Projected load from calendar events (next 7 days)
  const projectedLoadRows =
    projectedLoadRes.status === "fulfilled" ? (projectedLoadRes.value.data ?? []) : [];
  const projectedLoadSum = projectedLoadRows.reduce(
    (sum: number, r: any) => sum + (r.estimated_load_au ?? 0),
    0,
  );

  // Upcoming events (next 7 days, all types — for study block visibility)
  const upcomingEvents =
    upcomingEventsRes.status === "fulfilled" ? (upcomingEventsRes.value.data ?? []) : [];

  // Layer 4 recs — map to lightweight ActiveRecommendation[]
  const rawRecs: Recommendation[] =
    recsRes.status === "fulfilled" ? (recsRes.value as Recommendation[]) : [];
  const activeRecommendations: ActiveRecommendation[] = rawRecs.map((r) => ({
    recType: r.rec_type,
    priority: r.priority,
    title: r.title,
    bodyShort: r.body_short,
    confidence: r.confidence_score,
  }));

  // Build snapshot enrichment (null if no snapshot exists yet)
  const snapshotEnrichment: SnapshotEnrichment | null = snapshot
    ? {
        acwr: (snapshot.acwr as number) ?? null,
        atl7day: (snapshot.atl_7day as number) ?? null,
        ctl28day: (snapshot.ctl_28day as number) ?? null,
        injuryRiskFlag: (snapshot.injury_risk_flag as string) ?? null,
        athleticLoad7day: (snapshot.athletic_load_7day as number) ?? null,
        academicLoad7day: (snapshot.academic_load_7day as number) ?? null,
        dualLoadIndex: (snapshot.dual_load_index as number) ?? null,
        hrvBaselineMs: (snapshot.hrv_baseline_ms as number) ?? null,
        // Prefer freshest health_data HRV over potentially-stale snapshot value
        hrvTodayMs: (() => {
          const freshHrv = vitals.find((v: any) => v.metric_type === "hrv");
          return freshHrv ? Math.round(freshHrv.value * 10) / 10 : ((snapshot.hrv_today_ms as number) ?? null);
        })(),
        sleepQuality: (snapshot.sleep_quality as number) ?? null,
        wellness7dayAvg: (snapshot.wellness_7day_avg as number) ?? null,
        wellnessTrend: (snapshot.wellness_trend as string) ?? null,
        sessionsTotal: (snapshot.sessions_total as number) ?? 0,
        trainingAgeWeeks: (snapshot.training_age_weeks as number) ?? 0,
        streakDays: (snapshot.streak_days as number) ?? 0,
        cvCompleteness: (snapshot.cv_completeness as number) ?? null,
        masteryScores: (snapshot.mastery_scores as Record<string, number>) ?? {},
        strengthBenchmarks: (snapshot.strength_benchmarks as Record<string, number>) ?? {},
        speedProfile: (snapshot.speed_profile as Record<string, number>) ?? {},
        coachabilityIndex: (snapshot.coachability_index as number) ?? null,
        phvStage: (snapshot.phv_stage as string) ?? null,
        phvOffsetYears: (snapshot.phv_offset_years as number) ?? null,
        triangleRag: (snapshot.triangle_rag as string) ?? null,
        readinessRag: (snapshot.readiness_rag as string) ?? null,
        readinessScore: (snapshot.readiness_score as number) ?? null,
        lastCheckinAt: (snapshot.last_checkin_at as string) ?? null,
        // Journal
        journalCompleteness7d: (snapshot as any).journal_completeness_7d ?? null,
        journalStreakDays: (snapshot as any).journal_streak_days ?? 0,
        targetAchievementRate30d: (snapshot as any).target_achievement_rate_30d ?? null,
        lastJournalAt: (snapshot as any).last_journal_at ?? null,
        pendingPreJournalCount: (snapshot as any).pending_pre_journal_count ?? 0,
        pendingPostJournalCount: (snapshot as any).pending_post_journal_count ?? 0,
        projectedLoad7day: projectedLoadSum > 0 ? projectedLoadSum : null,
        projectedACWR: (() => {
          const currentCTL = (snapshot.ctl_28day as number) ?? 0;
          const currentATL = (snapshot.atl_7day as number) ?? 0;
          if (currentCTL > 0) {
            return Math.round(((currentATL + projectedLoadSum / 7) / currentCTL) * 100) / 100;
          }
          return null;
        })(),
      }
    : null;

  // Derive age band from age
  let ageBand: string | null = null;
  if (profile?.age) {
    const age = profile.age;
    if (age < 13) ageBand = "U13";
    else if (age < 15) ageBand = "U15";
    else if (age < 17) ageBand = "U17";
    else if (age < 19) ageBand = "U19";
    else if (age < 21) ageBand = "U21";
    else if (age < 30) ageBand = "SEN";
    else ageBand = "VET";
  }

  // Academic load: exam density score (0-10)
  const studyBlocksToday = todayEvents.filter(
    (e) => e.event_type === "study"
  ).length;
  const academicLoadScore = Math.min(
    10,
    exams.length * 1.5 + studyBlocksToday * 0.5
  );

  // Readiness components from latest checkin
  const readinessComponents = latestCheckin
    ? {
        energy: latestCheckin.energy,
        soreness: latestCheckin.soreness,
        sleepHours: latestCheckin.sleep_hours,
        mood: latestCheckin.mood,
        academicStress: latestCheckin.academic_stress,
        painFlag: latestCheckin.pain_flag,
      }
    : null;

  // Benchmark profile from normative data (fetched in parallel above)
  let benchmarkProfile: { overallPercentile: number; strengths: string[]; gaps: string[]; gapAttributes: string[]; strengthAttributes: string[] } | null = null;
  if (benchmarkProfileRes.status === "fulfilled" && benchmarkProfileRes.value) {
    const bp = benchmarkProfileRes.value;
    benchmarkProfile = {
      overallPercentile: bp.overallPercentile,
      strengths: bp.strengths,
      gaps: bp.gaps,
      gapAttributes: bp.gapAttributes ?? [],
      strengthAttributes: bp.strengthAttributes ?? [],
    };
  }

  // ── Temporal Context (Layer 2) ──────────────────────────────────
  const hour = parseInt(currentTime.split(":")[0], 10);
  const timeOfDay: PlayerContext["temporalContext"]["timeOfDay"] =
    hour >= 5 && hour < 12 ? "morning" :
    hour >= 12 && hour < 17 ? "afternoon" :
    hour >= 17 && hour < 21 ? "evening" : "night";

  const matchEvent = todayEvents.find((e: any) => e.event_type === "match");
  const isMatchDay = !!matchEvent;
  const matchDetails = matchEvent
    ? `${matchEvent.title} at ${new Date(matchEvent.start_at).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })}`
    : null;

  // Exam within 48 hours
  const now48h = new Date(now.getTime() + 48 * 3600000);
  const nearExams = exams.filter((e: any) => new Date(e.start_at) <= now48h);
  const isExamProximity = nearExams.length > 0;
  const examDetails = nearExams.length > 0
    ? nearExams.map((e: any) => e.title).join(", ")
    : null;

  // Day type
  let dayType: PlayerContext["temporalContext"]["dayType"] = "rest";
  if (isMatchDay) dayType = "competition";
  else if (isExamProximity) dayType = "exam";
  else if (todayEvents.some((e: any) => e.event_type === "training" && (e.intensity === "HARD" || e.intensity === "MODERATE")))
    dayType = "training";
  else if (todayEvents.some((e: any) => e.event_type === "training"))
    dayType = "light";

  // Auto-suggestion
  let suggestion = "";
  const readinessVal = latestCheckin?.readiness ?? null;
  if (readinessVal === "Red") suggestion = "Rest day recommended — prioritize recovery";
  else if (isMatchDay && timeOfDay === "evening") suggestion = "Post-match recovery focus";
  else if (isMatchDay && (timeOfDay === "morning" || timeOfDay === "afternoon")) suggestion = "Match day — light activation only, save energy";
  else if (isExamProximity && academicLoadScore >= 6) suggestion = "High academic load — reduce training intensity, prioritize rest and study";
  else if (timeOfDay === "night") suggestion = "Wind down — sleep quality is priority";
  else if (timeOfDay === "evening" && !todayEvents.some((e: any) => e.event_type === "training"))
    suggestion = "Evening free — good time for mobility or light recovery work";
  else suggestion = "";

  const temporalContext: PlayerContext["temporalContext"] = {
    timeOfDay,
    isMatchDay,
    matchDetails,
    isExamProximity,
    examDetails,
    dayType,
    suggestion,
  };

  return {
    userId,
    name: profile?.name ?? "Athlete",
    sport: profile?.sport ?? "football",
    position: profile?.position ?? null,
    ageBand,
    gender: profile?.gender ?? null,
    heightCm: profile?.height_cm ?? null,
    weightKg: profile?.weight_kg ?? null,
    role: (profile?.role as PlayerContext["role"]) ?? "player",
    todayDate: today,
    currentTime, // HH:MM in player's local timezone
    todayEvents,
    readinessScore: latestCheckin?.readiness ?? null,
    checkinDate: latestCheckin?.date ?? null,
    readinessComponents,
    upcomingExams: exams,
    upcomingEvents, // next 7 days, all event types (for study block visibility)
    academicLoadScore,
    recentVitals: vitals.map((v: any) => ({
      metric: v.metric_type,
      value: v.value,
      date: v.date,
    })),
    currentStreak: profile?.current_streak ?? 0,
    benchmarkProfile,
    recentTestScores: testResults.map((t: any) => ({
      testType: t.test_type,
      score: t.score ?? 0,
      date: t.date,
    })),
    schedulePreferences,
    activeScenario,
    temporalContext,
    activeTab: activeTab as PlayerContext["activeTab"],
    lastUserMessage,
    timezone: tz,
    snapshotEnrichment,
    activeRecommendations,
  };
}

/**
 * Get the offset in milliseconds between UTC and a given IANA timezone at a given moment.
 * Positive = timezone is ahead of UTC (e.g. +3h for Asia/Riyadh = +10800000ms)
 */
export function getTimezoneOffsetMs(tz: string, date: Date = new Date()): number {
  try {
    // Use formatToParts for reliable cross-runtime offset calculation
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const p: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== 'literal') p[part.type] = part.value;
    }
    const tzDateStr = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`;
    return new Date(tzDateStr).getTime() - date.getTime();
  } catch {
    return 0; // fallback to UTC if timezone is invalid
  }
}

/**
 * Convert a local date string "YYYY-MM-DD" + optional time "HH:MM" to an ISO string
 * that represents that local time in the given timezone.
 * e.g. toTimezoneISO("2026-03-14", "00:00:00", "Asia/Riyadh") → "2026-03-13T21:00:00.000Z"
 */
export function toTimezoneISO(
  date: string,
  time: string,
  tz: string
): string {
  // Use formatToParts approach (same as calendarHelpers.localToUtc)
  // — reliable across all runtimes (Vercel, Node, browser)
  try {
    const timeParts = time.split(':');
    const normTime = timeParts.length >= 3
      ? `${timeParts[0]}:${timeParts[1]}:${timeParts[2]}`
      : `${timeParts[0]}:${timeParts[1]}:00`;

    const refDate = new Date(`${date}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(refDate);

    const p: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== 'literal') p[part.type] = part.value;
    }

    const tzDateStr = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`;
    const offsetMs = new Date(tzDateStr).getTime() - refDate.getTime();
    const naive = new Date(`${date}T${normTime}Z`);
    return new Date(naive.getTime() - offsetMs).toISOString();
  } catch {
    // Fallback to old method
    const offsetMs = getTimezoneOffsetMs(tz);
    const naive = new Date(`${date}T${time}+00:00`);
    return new Date(naive.getTime() - offsetMs).toISOString();
  }
}

/**
 * Get ISO bounds for a full day in the user's timezone.
 * Returns [dayStartISO, dayEndISO] in UTC for Supabase queries.
 */
export function getDayBoundsISO(date: string, tz: string): [string, string] {
  return [
    toTimezoneISO(date, "00:00:00", tz),
    toTimezoneISO(date, "23:59:59", tz),
  ];
}
