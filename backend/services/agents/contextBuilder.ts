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
import { getModeDefinition, type ModeParams } from "@/services/scheduling/modeConfig";

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
  recentTestScores: { testType: string; score: number; date: string; source?: string }[];

  // ── Historical Data (Profile > Historical Data) ────────────────────
  // Self-reported pre-Tomo context. Tagged "self-reported, confidence: medium"
  // in every agent's dynamic prompt; never cited as a current benchmark.
  // Null when the athlete hasn't entered any historical data.
  historicalData: HistoricalData | null;

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

  // Context for routing — canonical 3-tab nav (Timeline | Chat | Dashboard)
  activeTab: "Timeline" | "Chat" | "Dashboard";
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

  // ── Planning IP Context ──
  planningContext: {
    activeMode: string | null;
    modeParams: Record<string, unknown> | null;
    applicableProtocols: string[];
    applicableProtocolDetails: ProtocolDetail[];
    dualLoadZone: string | null;
    examProximityScore: number | null;
    dataConfidenceScore: number | null;
  } | null;

  // ── Wearable Integration Status ──
  // Authoritative WHOOP connection status injected into system prompt.
  // Prevents AI from giving conflicting answers by removing need for tool calls.
  wearableStatus: {
    whoop: {
      connected: boolean;
      dataFresh: boolean; // true if last sync <48h ago
      syncStatus: string | null;
      lastSyncAt: string | null;
      hoursSinceSync: number | null;
      syncError: string | null;
    };
  } | null;
}

/** Lightweight rec summary for system prompt injection */
export interface ActiveRecommendation {
  recType: string;
  priority: number;
  title: string;
  bodyShort: string;
  confidence: number;
}

/**
 * Athlete-declared pre-Tomo context.
 * Populated from users.training_started_at/note, athlete_injury_history, and
 * phone_test_sessions rows tagged source='historical_self_reported'.
 */
export interface HistoricalData {
  trainingStartedAt: string | null;              // YYYY-MM-DD
  yearsTraining: number | null;                   // computed, 1 decimal
  trainingHistoryNote: string | null;
  pastInjuries: Array<{
    bodyArea: string;
    severity: 'minor' | 'moderate' | 'severe';
    year: number;
    weeksOut: number | null;
    resolved: boolean;
  }>;
  historicalTests: Array<{
    testType: string;
    score: number;
    date: string;
  }>;
}

/** Lightweight protocol detail for agent context (from pd_protocols) */
export interface ProtocolDetail {
  protocolId: string;
  name: string;
  category: string;
  loadMultiplier: number | null;
  intensityCap: string | null;
  contraindications: string[];
  aiSystemInjection: string | null;
  safetyCritical: boolean;
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

  // ── Snapshot 360: Performance Science ──
  trainingMonotony: number | null;
  trainingStrain: number | null;
  dataConfidenceScore: number | null;
  readinessDelta: number | null;
  sleepDebt3d: number | null;

  // ── Snapshot 360: Vitals ──
  spo2Pct: number | null;
  recoveryScore: number | null;

  // ── Snapshot 360: Trends ──
  hrvTrend7dPct: number | null;
  loadTrend7dPct: number | null;
  acwrTrend: string | null;
  sleepTrend7d: string | null;
  bodyFeelTrend7d: number | null;
  restingHrTrend7d: string | null;
  readinessDistribution7d: Record<string, number> | null;

  // ── Snapshot 360: Context ──
  matchesNext7d: number | null;
  examsNext14d: number | null;
  seasonPhase: string | null;
  daysSinceLastSession: number | null;

  // ── Snapshot 360: Engagement ──
  recActionRate30d: number | null;
  planCompliance7d: number | null;
  checkinConsistency7d: number | null;
  coachingPreference: string | null;

  // CCRS (Cascading Confidence Readiness Score)
  ccrs: number | null;                    // 0-100 readiness score
  ccrsConfidence: string | null;          // very_high | high | medium | low | estimated
  ccrsRecommendation: string | null;      // full_load | moderate | reduced | recovery | blocked
  ccrsAlertFlags: string[] | null;        // ACWR_BLOCKED, HRV_SUPPRESSED, SLEEP_DEFICIT, etc.
  dataFreshness: string | null;           // FRESH | AGING | STALE | UNKNOWN

  // ── Planning IP ──
  athleteMode: string | null;
  dualLoadZone: string | null;
  applicableProtocolIds: string[] | null;
  examProximityScore: number | null;
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
    wearableConnRes,
    pdProtocolsRes,
    injuryHistoryRes,
  ] = await Promise.allSettled([
    (db as any)
      .from("users")
      .select("name, sport, age, role, school_hours, exam_periods, current_streak, longest_streak, position, gender, height_cm, weight_kg, training_started_at, training_history_note")
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
      .select("test_type, score, date, source")
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
    // Wearable connection status — single source of truth for WHOOP status
    (db as any)
      .from("wearable_connections")
      .select("provider, sync_status, last_sync_at, sync_error")
      .eq("user_id", userId)
      .eq("provider", "whoop")
      .maybeSingle(),
    // PDIL protocols — all enabled protocols for agent context filtering
    (db as any)
      .from("pd_protocols")
      .select("protocol_id, name, category, load_multiplier, intensity_cap, contraindications, ai_system_injection, safety_critical")
      .eq("is_enabled", true),
    // Historical Data: self-reported pre-Tomo injury history
    (db as any)
      .from("athlete_injury_history")
      .select("body_area, severity, year, weeks_out, resolved")
      .eq("user_id", userId)
      .order("year", { ascending: false })
      .limit(20),
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
          source: 'manual',
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

  // Wearable connection status — authoritative source for WHOOP status
  const wearableConn =
    wearableConnRes.status === "fulfilled" ? wearableConnRes.value.data : null;
  const whoopConnected = !!wearableConn && wearableConn.sync_status !== "auth_required";
  const whoopLastSync = wearableConn?.last_sync_at ? new Date(wearableConn.last_sync_at) : null;
  const whoopHoursSinceSync = whoopLastSync
    ? (Date.now() - whoopLastSync.getTime()) / 3600000
    : Infinity;
  const wearableStatus: PlayerContext["wearableStatus"] = {
    whoop: {
      connected: whoopConnected,
      dataFresh: whoopHoursSinceSync <= 48,
      syncStatus: wearableConn?.sync_status ?? null,
      lastSyncAt: wearableConn?.last_sync_at ?? null,
      hoursSinceSync: isFinite(whoopHoursSinceSync) ? Math.round(whoopHoursSinceSync * 10) / 10 : null,
      syncError: wearableConn?.sync_error ?? null,
    },
  };

  // PDIL protocols — all enabled protocols (filtered to applicable IDs below)
  const allProtocols: any[] =
    pdProtocolsRes.status === "fulfilled" ? (pdProtocolsRes.value.data ?? []) : [];

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
        // Snapshot 360: Performance Science
        trainingMonotony: (snapshot as any).training_monotony ?? null,
        trainingStrain: (snapshot as any).training_strain ?? null,
        dataConfidenceScore: (snapshot as any).data_confidence_score ?? null,
        readinessDelta: (snapshot as any).readiness_delta ?? null,
        sleepDebt3d: (snapshot as any).sleep_debt_3d ?? null,
        // Snapshot 360: Vitals
        spo2Pct: (snapshot as any).spo2_pct ?? null,
        recoveryScore: (snapshot as any).recovery_score ?? null,
        // Snapshot 360: Trends
        hrvTrend7dPct: (snapshot as any).hrv_trend_7d_pct ?? null,
        loadTrend7dPct: (snapshot as any).load_trend_7d_pct ?? null,
        acwrTrend: (snapshot as any).acwr_trend ?? null,
        sleepTrend7d: (snapshot as any).sleep_trend_7d ?? null,
        bodyFeelTrend7d: (snapshot as any).body_feel_trend_7d ?? null,
        restingHrTrend7d: (snapshot as any).resting_hr_trend_7d ?? null,
        readinessDistribution7d: (snapshot as any).readiness_distribution_7d ?? null,
        // Snapshot 360: Context
        matchesNext7d: (snapshot as any).matches_next_7d ?? null,
        examsNext14d: (snapshot as any).exams_next_14d ?? null,
        seasonPhase: (snapshot as any).season_phase ?? null,
        daysSinceLastSession: (snapshot as any).days_since_last_session ?? null,
        // Snapshot 360: Engagement
        recActionRate30d: (snapshot as any).rec_action_rate_30d ?? null,
        planCompliance7d: (snapshot as any).plan_compliance_7d ?? null,
        checkinConsistency7d: (snapshot as any).checkin_consistency_7d ?? null,
        coachingPreference: (snapshot as any).coaching_preference ?? null,
        // CCRS
        ccrs: (snapshot as any).ccrs ?? null,
        ccrsConfidence: (snapshot as any).ccrs_confidence ?? null,
        ccrsRecommendation: (snapshot as any).ccrs_recommendation ?? null,
        ccrsAlertFlags: (snapshot as any).ccrs_alert_flags ?? null,
        dataFreshness: (snapshot as any).data_freshness ?? null,
        // Planning IP
        athleteMode: (snapshot as any).athlete_mode ?? null,
        dualLoadZone: (snapshot as any).dual_load_zone ?? null,
        applicableProtocolIds: (snapshot as any).applicable_protocol_ids ?? null,
        examProximityScore: (snapshot as any).exam_proximity_score ?? null,
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

  // Build planning context from snapshot + PDIL protocol details
  const applicableIds: string[] = ((snapshot as any)?.applicable_protocol_ids as string[]) ?? [];
  const applicableProtocolDetails: ProtocolDetail[] = applicableIds.length > 0
    ? allProtocols
        .filter((p: any) => applicableIds.includes(p.protocol_id))
        .map((p: any) => ({
          protocolId: p.protocol_id,
          name: p.name,
          category: p.category,
          loadMultiplier: p.load_multiplier ?? null,
          intensityCap: p.intensity_cap ?? null,
          contraindications: Array.isArray(p.contraindications) ? p.contraindications : [],
          aiSystemInjection: p.ai_system_injection ?? null,
          safetyCritical: p.safety_critical ?? false,
        }))
    : [];

  // Resolve CMS mode params for the athlete's active mode
  const activeModeId = (snapshot as any)?.athlete_mode ?? null;
  let resolvedModeParams: ModeParams | null = null;
  if (activeModeId) {
    try {
      const modeDef = await getModeDefinition(activeModeId);
      resolvedModeParams = modeDef?.params ?? null;
    } catch {
      // Graceful degradation — if CMS lookup fails, proceed without mode params
    }
  }

  const planningContext = snapshot ? {
    activeMode: activeModeId,
    modeParams: resolvedModeParams as Record<string, unknown> | null,
    applicableProtocols: applicableIds,
    applicableProtocolDetails,
    dualLoadZone: (snapshot as any).dual_load_zone ?? null,
    examProximityScore: (snapshot as any).exam_proximity_score ?? null,
    dataConfidenceScore: (snapshot as any).data_confidence_score ?? null,
  } : null;

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
      source: t.source ?? 'manual',
    })),
    historicalData: (() => {
      const trainingStartedAt = (profile?.training_started_at as string | null) ?? null;
      const trainingHistoryNote = (profile?.training_history_note as string | null) ?? null;

      let yearsTraining: number | null = null;
      if (trainingStartedAt) {
        const startMs = new Date(`${trainingStartedAt}T00:00:00Z`).getTime();
        if (!Number.isNaN(startMs)) {
          const years = (Date.now() - startMs) / (365.25 * 86400000);
          if (years >= 0) yearsTraining = Math.round(years * 10) / 10;
        }
      }

      const pastInjuries =
        injuryHistoryRes.status === "fulfilled"
          ? ((injuryHistoryRes.value as any).data ?? []).map((r: any) => ({
              bodyArea: r.body_area as string,
              severity: r.severity as 'minor' | 'moderate' | 'severe',
              year: r.year as number,
              weeksOut: (r.weeks_out as number | null) ?? null,
              resolved: !!r.resolved,
            }))
          : [];

      const historicalTests = testResults
        .filter((t: any) => t.source === 'historical_self_reported')
        .map((t: any) => ({
          testType: t.test_type as string,
          score: (t.score as number) ?? 0,
          date: t.date as string,
        }));

      const hasAny =
        trainingStartedAt !== null ||
        trainingHistoryNote !== null ||
        pastInjuries.length > 0 ||
        historicalTests.length > 0;

      return hasAny
        ? {
            trainingStartedAt,
            yearsTraining,
            trainingHistoryNote,
            pastInjuries,
            historicalTests,
          }
        : null;
    })(),
    schedulePreferences,
    activeScenario,
    temporalContext,
    activeTab: activeTab as PlayerContext["activeTab"],
    lastUserMessage,
    timezone: tz,
    snapshotEnrichment,
    activeRecommendations,
    planningContext,
    wearableStatus,
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

/**
 * Render the "Athlete Background" block for agent dynamic prompts.
 * Returns "" when no historical data exists — callers concatenate unconditionally.
 *
 * Wired into Timeline, Output, and Mastery agents per the "AI Chat Fixes Must
 * Scale" rule: every agent reads the same pre-Tomo context, tagged as
 * self-reported so the model never cites historical scores as current benchmarks.
 */
export function buildAthleteBackgroundBlock(context: PlayerContext): string {
  const h = context.historicalData;
  if (!h) return "";

  const lines: string[] = ["", "## Athlete Background (self-reported, pre-Tomo)"];

  if (h.trainingStartedAt && h.yearsTraining !== null) {
    lines.push(
      `- Training age: ${h.yearsTraining} years (self-reported; athlete started ${h.trainingStartedAt})`,
    );
  } else if (h.trainingStartedAt) {
    lines.push(`- Athlete started training on ${h.trainingStartedAt}`);
  }

  if (h.trainingHistoryNote) {
    lines.push(`- Athlete note: ${h.trainingHistoryNote}`);
  }

  if (h.pastInjuries.length > 0) {
    lines.push("- Past injuries (self-reported, confidence: medium):");
    for (const inj of h.pastInjuries.slice(0, 10)) {
      const weeks = inj.weeksOut !== null ? `, ${inj.weeksOut}w out` : "";
      const status = inj.resolved ? "resolved" : "ongoing";
      lines.push(`  - ${inj.year} ${inj.bodyArea} (${inj.severity}${weeks}, ${status})`);
    }
  }

  if (h.historicalTests.length > 0) {
    lines.push(
      "- Historical test trajectory (self-reported, lower authority than Tomo-tracked):",
    );
    for (const t of h.historicalTests.slice(0, 8)) {
      lines.push(`  - ${t.date} ${t.testType}: ${t.score}`);
    }
  }

  lines.push(
    "",
    "Treat historical data as directional context. Tomo-tracked tests (source: manual) are authoritative.",
    "Do NOT cite self-reported scores as current benchmarks. Use past injuries for injury-aware programming and tone calibration.",
  );

  return lines.join("\n");
}
