/**
 * Boot API — Pre-fetches athlete state during app loading screen
 *
 * GET /api/v1/boot?tz=Asia/Riyadh
 *
 * Returns a unified payload for the proactive dashboard + downstream cache seeding.
 * All queries run in parallel. Partial failures return partial data (never 500).
 * Zero AI cost — fully deterministic.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readSnapshot } from "@/services/events/snapshot/snapshotReader";
import {
  getPlayerBenchmarkProfile,
} from "@/services/benchmarkService";
import { getRecommendations } from "@/services/recommendations/getRecommendations";
import { getUnreadCount } from "@/services/notifications/notificationEngine";
import {
  getDayBoundsISO,
} from "@/services/agents/contextBuilder";
import { evaluatePDProtocols } from "@/services/pdil";
import { evaluateSignal } from "@/services/signals";
import type { RecentVitalEntry, YesterdayVitals } from "@/services/signals";

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tz = searchParams.get("tz") || "UTC";

    // ── Timezone-aware day boundaries ──
    const now = new Date();
    const today = now.toLocaleDateString("en-CA", { timeZone: tz });
    const yesterday = new Date(now.getTime() - 86400000).toLocaleDateString("en-CA", { timeZone: tz });
    const [dayStartISO, dayEndISO] = getDayBoundsISO(today, tz);

    const in14Days = new Date(now.getTime() + 14 * 86400000)
      .toLocaleDateString("en-CA", { timeZone: tz });
    const [, in14DaysEndISO] = getDayBoundsISO(in14Days, tz);

    const tomorrow = new Date(now.getTime() + 86400000)
      .toLocaleDateString("en-CA", { timeZone: tz });
    const [tomorrowStartISO, tomorrowEndISO] = getDayBoundsISO(tomorrow, tz);

    const db = supabaseAdmin();

    // ── 9 parallel queries ──
    const nowISO = now.toISOString();
    const twelveHoursAgoISO = new Date(now.getTime() - 12 * 3600000).toISOString();

    const [
      profileRes,
      snapshotRes,
      todayEventsRes,
      checkinRes,
      recsRes,
      benchmarkRes,
      examsRes,
      notifRes,
      tomorrowFirstRes,
      currentActiveRes,
      schedulePrefsRes,
      whoopSleepRes,
      recentVitalsRes,
      yesterdayVitalsRes,
      activeProgramsRes,
      programRecsRes,
      coachProgrammesRes,
    ] = await Promise.allSettled([
      // 1. User profile
      (db as any)
        .from("users")
        .select("name, sport, position, current_streak, school_hours, age")
        .eq("id", userId)
        .single(),

      // 2. Athlete snapshot (Layer 2)
      readSnapshot(userId, "ATHLETE"),

      // 3. Today's events
      db
        .from("calendar_events")
        .select("id, title, event_type, start_at, end_at, notes, intensity")
        .eq("user_id", userId)
        .gte("start_at", dayStartISO)
        .lte("start_at", dayEndISO)
        .order("start_at"),

      // 4. Latest checkin
      db
        .from("checkins")
        .select("energy, soreness, sleep_hours, mood, academic_stress, pain_flag, readiness, date")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle(),

      // 5. Active recommendations (top 6 — dashboard uses 6, legacy activeRecs uses 3)
      getRecommendations(userId, { role: "ATHLETE", limit: 6 }),

      // 6. Benchmark profile
      getPlayerBenchmarkProfile(userId),

      // 7. Upcoming exams (14 days)
      db
        .from("calendar_events")
        .select("id, title, event_type, start_at")
        .eq("user_id", userId)
        .eq("event_type", "exam")
        .gte("start_at", dayStartISO)
        .lte("start_at", in14DaysEndISO)
        .order("start_at"),

      // 8. Notification center unread summary
      getUnreadCount(userId),

      // 9. Tomorrow's first event
      db
        .from("calendar_events")
        .select("id, title, event_type, start_at, end_at, intensity")
        .eq("user_id", userId)
        .gte("start_at", tomorrowStartISO)
        .lte("start_at", tomorrowEndISO)
        .order("start_at")
        .limit(1)
        .maybeSingle(),

      // 10. Recently started events (up to 12h ago) — filtered in code for active check
      db
        .from("calendar_events")
        .select("id, title, event_type, start_at, end_at, intensity")
        .eq("user_id", userId)
        .lte("start_at", nowISO)
        .gte("start_at", twelveHoursAgoISO)
        .order("start_at", { ascending: false })
        .limit(5),

      // 11. Schedule preferences — for sleep window derivation
      (db as any)
        .from("player_schedule_preferences")
        .select("sleep_start, sleep_end")
        .eq("user_id", userId)
        .maybeSingle(),

      // 12. Whoop sleep_hours from health_data (today or yesterday — sleep spans midnight)
      db
        .from("health_data")
        .select("value, date, source")
        .eq("user_id", userId)
        .eq("metric_type", "sleep_hours")
        .in("date", [today, yesterday])
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle(),

      // 13. Recent vitals (7 days) — for Dashboard signal sparklines + sleep debt
      (db as any)
        .from("checkins")
        .select("date, sleep_hours, mood, energy, soreness, readiness")
        .eq("user_id", userId)
        .gte("date", new Date(now.getTime() - 7 * 86400000).toLocaleDateString("en-CA", { timeZone: tz }))
        .order("date", { ascending: false })
        .limit(7),

      // 14. Yesterday's checkin — for Dashboard signal delta calculations
      (db as any)
        .from("checkins")
        .select("sleep_hours, mood, energy, soreness")
        .eq("user_id", userId)
        .eq("date", yesterday)
        .maybeSingle(),

      // 15. Active program interactions — for Today's Plan + Program Panel
      (db as any)
        .from("program_interactions")
        .select("program_id, interaction_type, started_at, metadata")
        .eq("user_id", userId)
        .eq("interaction_type", "self_assign")
        .order("started_at", { ascending: false })
        .limit(3),

      // 16. Cached AI program recommendations — from deep program refresh
      (db as any)
        .from("athlete_snapshots")
        .select("program_recommendations")
        .eq("athlete_id", userId)
        .single(),

      // 17. Coach-assigned programmes (published, targeting this player)
      (db as any)
        .from("coach_programmes")
        .select("id, name, description, season_cycle, start_date, weeks, status, coach_id, target_type, target_positions, target_player_ids")
        .eq("status", "published")
        .order("start_date", { ascending: false })
        .limit(10),
    ]);

    // ── Extract results with graceful fallbacks ──
    const profile = profileRes.status === "fulfilled" ? profileRes.value?.data : null;
    const snapshot = snapshotRes.status === "fulfilled" ? snapshotRes.value : null;
    const todayEvents = todayEventsRes.status === "fulfilled" ? todayEventsRes.value?.data ?? [] : [];
    const latestCheckin = checkinRes.status === "fulfilled" ? checkinRes.value?.data ?? null : null;
    const activeRecs = recsRes.status === "fulfilled" ? recsRes.value ?? [] : [];
    const benchmarkProfile = benchmarkRes.status === "fulfilled" ? benchmarkRes.value : null;
    const upcomingExams = examsRes.status === "fulfilled" ? examsRes.value?.data ?? [] : [];
    const notifSummary = notifRes.status === "fulfilled" ? notifRes.value : { total: 0, by_category: {} };
    const tomorrowFirst = tomorrowFirstRes.status === "fulfilled" ? tomorrowFirstRes.value?.data ?? null : null;
    const recentEvents = currentActiveRes.status === "fulfilled" ? currentActiveRes.value?.data ?? [] : [];
    const schedulePrefs = schedulePrefsRes.status === "fulfilled" ? schedulePrefsRes.value?.data ?? null : null;
    // Prefer Whoop sleep_hours over manual check-in value (more accurate wearable data)
    const whoopSleep = whoopSleepRes.status === "fulfilled" ? (whoopSleepRes.value as any)?.data ?? null : null;
    const activePrograms = activeProgramsRes.status === "fulfilled" ? (activeProgramsRes.value as any)?.data ?? [] : [];
    const cachedProgramRecs = programRecsRes.status === "fulfilled" ? (programRecsRes.value as any)?.data?.program_recommendations : null;

    // Filter coach programmes: only those targeting this player (by ID, position, or "all")
    const allCoachProgs = coachProgrammesRes.status === "fulfilled" ? (coachProgrammesRes.value as any)?.data ?? [] : [];
    const playerPosition = profile?.position ?? null;
    const coachProgrammes = allCoachProgs.filter((p: any) => {
      if (p.target_type === "all") return true;
      if (p.target_type === "individual" && Array.isArray(p.target_player_ids) && p.target_player_ids.includes(userId)) return true;
      if (p.target_type === "position_group" && playerPosition && Array.isArray(p.target_positions) && p.target_positions.includes(playerPosition)) return true;
      return false;
    });

    // Recent vitals (7 days) for Dashboard signal sparklines
    const recentVitalsRaw = recentVitalsRes.status === "fulfilled" ? (recentVitalsRes.value as any)?.data ?? [] : [];
    const recentVitals: RecentVitalEntry[] = recentVitalsRaw.map((v: any) => ({
      date:           v.date,
      sleep_hours:    v.sleep_hours ?? null,
      hrv_morning_ms: null,  // Not in checkins — will be enriched from health_data if available
      energy:         v.energy ?? null,
      soreness:       v.soreness ?? null,
      mood:           v.mood ?? null,
      readiness_score: v.readiness === 'GREEN' ? 80 : v.readiness === 'YELLOW' ? 55 : v.readiness === 'RED' ? 30 : null,
    }));

    // Yesterday's vitals for signal delta calculations
    const yesterdayRaw = yesterdayVitalsRes.status === "fulfilled" ? (yesterdayVitalsRes.value as any)?.data ?? null : null;
    const yesterdayVitals: YesterdayVitals | null = yesterdayRaw ? {
      readiness_score: null,  // Computed field, not in raw checkin
      soreness:        yesterdayRaw.soreness ?? null,
      hrv_morning_ms:  null,  // Not in checkins
      sleep_hours:     yesterdayRaw.sleep_hours ?? null,
      energy:          yesterdayRaw.energy ?? null,
      mood:            yesterdayRaw.mood ?? null,
    } : null;

    // Pick the most recent non-sleep event that is still ongoing (end_at >= now, or no end_at)
    const currentActiveNonSleep = recentEvents.find((e: any) =>
      e.event_type !== "sleep" && (!e.end_at || new Date(e.end_at).getTime() >= now.getTime())
    ) ?? null;

    // Derive sleep window from schedule preferences (default 22:00–06:00)
    const sleepStart = schedulePrefs?.sleep_start ?? "22:00";
    const sleepEnd = schedulePrefs?.sleep_end ?? "06:00";
    const [sleepStartH, sleepStartM] = sleepStart.split(":").map(Number);
    const [sleepEndH, sleepEndM] = sleepEnd.split(":").map(Number);
    // Use user's local time via tz — server runs UTC so now.getHours() would be wrong
    const nowLocal = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
    const sleepStartMinutes = sleepStartH * 60 + sleepStartM;
    const sleepEndMinutes = sleepEndH * 60 + sleepEndM;
    // Sleep crosses midnight: active if after sleepStart OR before sleepEnd
    const isSleepTime = sleepStartMinutes > sleepEndMinutes
      ? nowMinutes >= sleepStartMinutes || nowMinutes < sleepEndMinutes
      : nowMinutes >= sleepStartMinutes && nowMinutes < sleepEndMinutes;

    // Build synthetic sleep event if in sleep window and no other active event
    let currentActiveRaw = currentActiveNonSleep;
    if (!currentActiveNonSleep && isSleepTime) {
      // If local time is before sleep end (e.g. 3am), sleep started yesterday
      const sleepDate = nowMinutes < sleepEndMinutes
        ? new Date(now.getTime() - 86400000)
        : now;
      const wakeDate = nowMinutes < sleepEndMinutes
        ? now
        : new Date(now.getTime() + 86400000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const startISO = `${sleepDate.toLocaleDateString("en-CA", { timeZone: tz })}T${pad(sleepStartH)}:${pad(sleepStartM)}:00`;
      const endISO = `${wakeDate.toLocaleDateString("en-CA", { timeZone: tz })}T${pad(sleepEndH)}:${pad(sleepEndM)}:00`;
      currentActiveRaw = {
        id: "sleep_virtual",
        title: "Sleep",
        event_type: "sleep",
        start_at: startISO,
        end_at: endISO,
        intensity: null,
      };
    }

    // ── PDIL + Signal shared data ──
    // Hoisted so both PDIL and Signal evaluation can access them.
    let pdVitals: any = null;
    let pdLoad: any[] = [];

    // ── PDIL Evaluation — Performance Director Intelligence Layer ──
    // Runs the PD's protocol engine against the athlete's current state.
    // Returns PDContext: training modifiers, rec guardrails, RAG overrides, AI context.
    let pdContext = null;
    try {
      if (snapshot) {
        // Gather minimal context for PDIL evaluation
        const loadFrom = new Date(now.getTime() - 28 * 86400000);
        const [pdVitalsRes, pdLoadRes] = await Promise.allSettled([
          (db as any)
            .from('athlete_daily_vitals')
            .select('*')
            .eq('athlete_id', userId)
            .eq('vitals_date', today)
            .single(),
          db
            .from('athlete_daily_load')
            .select('*')
            .eq('athlete_id', userId)
            .gte('load_date', loadFrom.toISOString().split('T')[0]),
        ]);

        pdVitals = pdVitalsRes.status === 'fulfilled' ? pdVitalsRes.value?.data : null;
        pdLoad = pdLoadRes.status === 'fulfilled' ? (pdLoadRes.value?.data ?? []) : [];

        // Combine today + upcoming events already fetched
        const allUpcoming = [
          ...todayEvents,
          ...(examsRes.status === 'fulfilled' ? examsRes.value?.data ?? [] : []),
        ];

        pdContext = await evaluatePDProtocols({
          snapshot: snapshot as Record<string, unknown>,
          todayVitals: pdVitals,
          upcomingEvents: allUpcoming as any[],
          recentDailyLoad: pdLoad as any[],
          trigger: 'boot',
        });
      }
    } catch (err) {
      console.warn('[boot] PDIL evaluation failed, continuing without:', err);
      // pdContext stays null — frontend uses defaults
    }

    // ── Signal Evaluation — Dashboard Signal Layer ──
    // Runs after PDIL. Uses same input data + recentVitals + yesterdayVitals.
    // Returns SignalContext for Dashboard rendering (display-ready).
    let signalContext = null;
    try {
      if (snapshot) {
        // Merge pdVitals + checkin data for signal evaluation
        const signalVitals = {
          ...(pdVitals ?? {}),
          readiness_score: (snapshot as any)?.readiness_score,
          readiness_rag: (snapshot as any)?.readiness_rag,
          energy: latestCheckin?.energy,
          soreness: latestCheckin?.soreness,
          mood: latestCheckin?.mood,
          sleep_hours: whoopSleep?.value ?? latestCheckin?.sleep_hours,
          academic_stress: latestCheckin?.academic_stress,
        };

        signalContext = await evaluateSignal({
          snapshot: snapshot as Record<string, unknown>,
          todayVitals: signalVitals,
          upcomingEvents: [
            ...todayEvents,
            ...(examsRes.status === 'fulfilled' ? examsRes.value?.data ?? [] : []),
          ] as any[],
          recentDailyLoad: pdLoad,
          trigger: 'boot',
          recentVitals,
          yesterdayVitals,
          trainingModifiers: pdContext?.trainingModifiers ?? null,
        });
      }
    } catch (err) {
      console.warn('[boot] Signal evaluation failed, continuing without:', err);
      // signalContext stays null — Dashboard shows neutral state
    }

    // ── Shape response ──
    const bootPayload = {
      name: profile?.name ?? "Athlete",
      sport: profile?.sport ?? "football",
      position: profile?.position ?? null,
      isStudent: (profile?.school_hours ?? 0) > 0,
      age: profile?.age ?? null,
      streak: profile?.current_streak ?? 0,

      snapshot,

      todayEvents: todayEvents.map((e: any) => ({
        id: e.id,
        title: e.title,
        type: e.event_type,
        startAt: e.start_at,
        endAt: e.end_at,
        intensity: e.intensity,
      })),

      latestCheckin: latestCheckin
        ? {
            readiness: latestCheckin.readiness,
            energy: latestCheckin.energy,
            soreness: latestCheckin.soreness,
            // Prefer wearable (Whoop) sleep data over manual check-in entry — more accurate
            sleepHours: whoopSleep?.value ?? latestCheckin.sleep_hours,
            sleepSource: whoopSleep ? 'whoop' : 'checkin',
            mood: latestCheckin.mood,
            date: latestCheckin.date,
          }
        : null,

      activeRecs: activeRecs.slice(0, 3).map((r: any) => ({
        type: r.rec_type ?? r.recType,
        priority: r.priority,
        title: r.title,
        bodyShort: r.body_short ?? r.bodyShort ?? null,
      })),

      dashboardRecs: activeRecs.slice(0, 6).map((r: any) => ({
        recId: r.rec_id ?? r.recId,
        type: r.rec_type ?? r.recType,
        priority: r.priority,
        title: r.title,
        bodyShort: r.body_short ?? r.bodyShort ?? null,
        bodyLong: r.body_long ?? r.bodyLong ?? null,
        context: r.context ?? {},
        createdAt: r.created_at ?? r.createdAt,
      })),

      dailyLoad: pdLoad.map((d: any) => ({
        date: d.load_date,
        trainingLoadAu: Number(d.training_load_au ?? 0),
        sessionCount: d.session_count ?? 0,
      })),

      activePrograms: activePrograms.map((p: any) => ({
        programId: p.program_id,
        startedAt: p.started_at,
        metadata: p.metadata ?? {},
      })),

      // Coach-assigned programmes (published, targeted at this player)
      coachProgrammes: coachProgrammes.slice(0, 5).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        seasonCycle: p.season_cycle,
        startDate: p.start_date,
        weeks: p.weeks,
        coachId: p.coach_id,
      })),

      // AI-recommended programs from deep program refresh (cached in snapshot)
      recommendedPrograms: cachedProgramRecs?.programs
        ? (cachedProgramRecs.programs as any[]).slice(0, 8).map((p: any) => ({
            programId: p.programId,
            name: p.name,
            category: p.category,
            type: p.type,
            priority: p.priority,
            durationWeeks: p.durationWeeks,
            durationMin: p.durationMin,
            description: p.description,
            impact: p.impact,
            frequency: p.frequency,
            difficulty: p.difficulty,
            tags: p.tags ?? [],
            reason: p.reason,
            positionNote: p.positionNote,
          }))
        : [],

      benchmarkSummary: benchmarkProfile
        ? {
            overallPercentile: benchmarkProfile.overallPercentile,
            topStrength: benchmarkProfile.strengths?.[0] ?? null,
            topGap: benchmarkProfile.gaps?.[0] ?? null,
          }
        : null,

      // Per-metric percentiles for status pill zone-based coloring
      // Shape: { [metricKey]: { percentile, zone, value } }
      metricPercentiles: benchmarkProfile?.results
        ? Object.fromEntries(
            benchmarkProfile.results.map((r: any) => [
              r.metricKey,
              { percentile: r.percentile, zone: r.zone, value: r.value },
            ])
          )
        : {},

      currentActiveEvent: currentActiveRaw
        ? {
            id: currentActiveRaw.id,
            title: currentActiveRaw.title,
            type: currentActiveRaw.event_type,
            startAt: currentActiveRaw.start_at,
            endAt: currentActiveRaw.end_at,
            intensity: currentActiveRaw.intensity,
          }
        : null,

      tomorrowFirstEvent: tomorrowFirst
        ? {
            id: tomorrowFirst.id,
            title: tomorrowFirst.title,
            type: tomorrowFirst.event_type,
            startAt: tomorrowFirst.start_at,
            endAt: tomorrowFirst.end_at,
            intensity: tomorrowFirst.intensity,
          }
        : null,

      upcomingExams: upcomingExams.map((e: any) => ({
        title: e.title,
        date: e.start_at,
      })),

      notificationCenter: {
        unreadTotal: notifSummary.total,
        byCategory: notifSummary.by_category,
        hasCriticalUnread: (notifSummary.by_category?.critical ?? 0) > 0,
      },

      tomoIntelligenceScore: (snapshot as any)?.tomo_intelligence_score ?? null,
      adaptationCoefficient: (snapshot as any)?.adaptation_coefficient ?? null,

      // ── PDIL: Performance Director Intelligence Layer ──
      // Contains training modifiers (load cap, intensity cap, contraindications),
      // recommendation guardrails, and active protocol metadata.
      // Frontend uses this to enforce PD decisions across all screens.
      pdContext: pdContext ? {
        trainingModifiers: pdContext.trainingModifiers,
        recGuardrails: pdContext.recGuardrails,
        activeProtocols: pdContext.activeProtocols.map((p: any) => ({
          name: p.name,
          category: p.category,
          priority: p.priority,
          safety_critical: p.safety_critical,
        })),
        protocolsEvaluated: pdContext.auditTrail.length,
        protocolsFired: pdContext.activeProtocols.length,
      } : null,

      // ── Signal Layer: Dashboard Signal Context ──
      // Display-ready signal for the Dashboard hero section.
      // Contains visual config, coaching text, pills, trigger rows, adapted plan.
      // null when no signal conditions match (Dashboard shows neutral state).
      signalContext,

      // ── Recent Vitals (7 days) ──
      // For Dashboard sparklines, sleep bars, and trend calculations.
      recentVitals,

      // ── Yesterday's Vitals ──
      // For Dashboard delta calculations in trigger rows.
      yesterdayVitals,

      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(bootPayload, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (err: any) {
    console.error("[boot] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
