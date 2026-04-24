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
import { generateAndPersistHeroCoaching } from "@/services/coaching/dynamicHeroCoaching";
import { getFreshReadiness, isReadinessFresh } from "@/lib/snapshot/freshness";
import { resolveDashboardLayout } from "@/services/dashboard/dashboardSectionLoader";
import { getModeDefinition, type ModeParams } from "@/services/scheduling/modeConfig";

/**
 * Composes the full benchmark detail block for Signal Dashboard strength/gap cards.
 * Looks up the BenchmarkResult matching the chosen label and derives a trend string
 * (delta vs cohort p50 with unit) + a coaching note whose tone depends on whether
 * this is a strength or a gap. Returns null when no matching result is found.
 */
function composeBenchmarkDetail(
  label: string | null,
  results: Array<{
    metricKey: string;
    metricLabel: string;
    unit: string;
    direction: "lower_better" | "higher_better";
    value: number;
    percentile: number;
    norm: { p10: number; p25: number; p50: number; p75: number; p90: number };
  }> | undefined,
  kind: "strength" | "gap",
): {
  metric: string;
  value: number;
  unit: string;
  percentile: number;
  trend: string;
  note: string;
} | null {
  if (!label || !Array.isArray(results)) return null;
  const r = results.find((x) => x.metricLabel === label);
  if (!r) return null;

  const p50 = r.norm?.p50 ?? r.value;
  const delta = r.value - p50;
  const absDelta = Math.abs(delta);
  const decimals = r.unit === "cm" || r.unit === "reps" || r.unit === "m" ? 0 : 2;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const formatted = absDelta.toFixed(decimals);
  const unitLabel = r.unit ? ` ${r.unit}` : "";
  const trend = delta === 0
    ? `At cohort median`
    : `${sign}${formatted}${unitLabel} vs cohort median`;

  let note: string;
  if (kind === "strength") {
    if (r.percentile >= 90) note = `Top ${Math.max(1, 100 - Math.round(r.percentile))}% for your position`;
    else if (r.percentile >= 75) note = `Above peers in your position`;
    else note = `Solid for your position`;
  } else {
    if (r.percentile < 25) note = `Priority: dedicated ${r.metricLabel.toLowerCase()} block`;
    else if (r.percentile < 50) note = `Below median — room to improve`;
    else note = `Keep building — not a ceiling`;
  }

  return {
    metric: r.metricLabel,
    value: r.value,
    unit: r.unit,
    percentile: Math.round(r.percentile),
    trend,
    note,
  };
}

/** Calendar events that count as a "session" for Pulse Today's session + signal adaptedPlan */
const TODAY_SESSION_EVENT_TYPES = new Set([
  "training",
  "match",
  "gym",
  "club",
  "club_training",
  "recovery",
]);

function firstTodaySessionEvent(events: Array<{ event_type?: string }>): any | null {
  for (const e of events) {
    if (TODAY_SESSION_EVENT_TYPES.has(String(e?.event_type ?? ""))) return e;
  }
  return null;
}

function sessionClockLabel(startAt: string | null | undefined, timeZone: string): string {
  if (!startAt) return "";
  try {
    const d = new Date(startAt);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-US", {
      timeZone: timeZone || "UTC",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

/** Feeds `SignalEvaluationInput.todaySession` so `adaptedPlan` can show the calendar title (not only CMS overrides). */
function buildTodaySessionForSignal(
  todayEventsRaw: any[],
  timeZone: string,
): { sessionName: string; sessionMeta: string } | null {
  const ev = firstTodaySessionEvent(todayEventsRaw);
  if (!ev) return null;
  const title = String(ev.title ?? "").trim() || "Today's session";
  const clock = sessionClockLabel(ev.start_at, timeZone);
  const intensity =
    ev.intensity != null && String(ev.intensity).trim() !== ""
      ? String(ev.intensity).toUpperCase()
      : "";
  const metaBits = [intensity, clock].filter(Boolean);
  return {
    sessionName: title,
    sessionMeta: metaBits.length > 0 ? metaBits.join(" · ") : "Scheduled today",
  };
}

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
      planningContextRes,
      recentHrvRes,
      upcomingEventsRes,
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

      // 4. Today's checkin ONLY — if the athlete hasn't checked in today,
      // downstream readers (signal evaluation, dashboard coaching text) must
      // see `null` so they fall back to the neutral BASELINE state instead of
      // replaying yesterday's answers as if they were today's.
      db
        .from("checkins")
        .select("energy, soreness, sleep_hours, mood, academic_stress, pain_flag, readiness, date")
        .eq("user_id", userId)
        .eq("date", today)
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

      // 11. Schedule preferences — for sleep window + athlete_mode (source of truth)
      (db as any)
        .from("player_schedule_preferences")
        .select("sleep_start, sleep_end, athlete_mode")
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
      // Only "active" = In Orbit. "player_selected" (My Picks) is a separate
      // Programs-tab concept; mixing them inflates the Dashboard count.
      (db as any)
        .from("program_interactions")
        .select("program_id, action, program_snapshot, created_at")
        .eq("user_id", userId)
        .eq("action", "active")
        .order("created_at", { ascending: false })
        .limit(10),

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

      // 18. Planning context (360 planning fields from snapshot)
      (async () => {
        const { data } = await (db as any)
          .from('athlete_snapshots')
          .select('athlete_mode, dual_load_zone, applicable_protocol_ids, exam_proximity_score, data_confidence_score')
          .eq('athlete_id', userId)
          .maybeSingle();
        return data;
      })(),

      // 19. Recent HRV (7 days) — from health_data so Dashboard sparkline populates
      // for athletes whose HRV comes from a wearable rather than the check-in form.
      db
        .from("health_data")
        .select("date, value")
        .eq("user_id", userId)
        .eq("metric_type", "hrv")
        .gte("date", new Date(now.getTime() - 7 * 86400000).toLocaleDateString("en-CA", { timeZone: tz }))
        .order("date", { ascending: false })
        .limit(7),

      // 20. Upcoming training + match events (next 14 days) — powers Signal
      // Dashboard "What's coming" timeline. Exams live in upcomingExams (query 7).
      db
        .from("calendar_events")
        .select("id, title, event_type, start_at, end_at, intensity")
        .eq("user_id", userId)
        .in("event_type", ["training", "match"])
        .gt("start_at", nowISO)
        .lte("start_at", in14DaysEndISO)
        .order("start_at")
        .limit(20),
    ]);

    // ── Extract results with graceful fallbacks ──
    const profile = profileRes.status === "fulfilled" ? profileRes.value?.data : null;
    const snapshot = snapshotRes.status === "fulfilled" ? snapshotRes.value : null;
    const todayEvents = todayEventsRes.status === "fulfilled" ? todayEventsRes.value?.data ?? [] : [];
    const todaySessionForSignal = buildTodaySessionForSignal(todayEvents, tz);
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
    const upcomingEventsRaw = upcomingEventsRes.status === "fulfilled" ? (upcomingEventsRes.value as any)?.data ?? [] : [];

    // Filter coach programmes: only those targeting this player (by ID, position, or "all")
    const allCoachProgs = coachProgrammesRes.status === "fulfilled" ? (coachProgrammesRes.value as any)?.data ?? [] : [];
    const playerPosition = profile?.position ?? null;
    const coachProgrammes = allCoachProgs.filter((p: any) => {
      if (p.target_type === "all") return true;
      if (p.target_type === "individual" && Array.isArray(p.target_player_ids) && p.target_player_ids.includes(userId)) return true;
      if (p.target_type === "position_group" && playerPosition && Array.isArray(p.target_positions) && p.target_positions.includes(playerPosition)) return true;
      return false;
    });

    // Planning context (360 planning fields)
    // athlete_mode comes from player_schedule_preferences (source of truth),
    // NOT from athlete_snapshots (which may be stale). Other planning fields
    // still come from the snapshot.
    const planningRaw = planningContextRes.status === "fulfilled" ? (planningContextRes.value as any) ?? null : null;
    const prefsAthleteMode = schedulePrefs?.athlete_mode ?? null;
    const planningContext = planningRaw
      ? { ...planningRaw, athlete_mode: prefsAthleteMode ?? planningRaw.athlete_mode ?? 'balanced' }
      : prefsAthleteMode
        ? { athlete_mode: prefsAthleteMode }
        : null;

    // Apply mode priority boosts to recommendation ordering
    // CMS mode params can boost/demote recommendation categories (e.g. study mode boosts ACADEMIC recs)
    const effectiveAthleteMode = planningContext?.athlete_mode ?? 'balanced';
    let boostedRecs = [...activeRecs];
    try {
      const modeDef = await getModeDefinition(effectiveAthleteMode);
      if (modeDef?.params?.priorityBoosts && modeDef.params.priorityBoosts.length > 0) {
        const boostMap = new Map(modeDef.params.priorityBoosts.map((b: { category: string; delta: number }) => [b.category.toUpperCase(), b.delta]));
        boostedRecs = boostedRecs.map((r: any) => {
          const recType = (r.rec_type ?? r.recType ?? '').toUpperCase();
          const delta = boostMap.get(recType) ?? 0;
          if (delta === 0) return r;
          // Lower priority number = higher importance; negative delta = boost (raise importance)
          return { ...r, priority: Math.max(1, (r.priority ?? 3) - delta) };
        });
        // Re-sort by effective priority (lower = more important)
        boostedRecs.sort((a: any, b: any) => (a.priority ?? 3) - (b.priority ?? 3));
      }
    } catch {
      // Graceful degradation — use original ordering if mode lookup fails
    }

    // Recent vitals (7 days) for Dashboard signal sparklines
    const recentVitalsRaw = recentVitalsRes.status === "fulfilled" ? (recentVitalsRes.value as any)?.data ?? [] : [];
    // Build date → HRV map from health_data so the Dashboard HRV sparkline
    // populates for athletes whose HRV comes from a wearable (not check-ins).
    const recentHrvRaw = recentHrvRes.status === "fulfilled" ? (recentHrvRes.value as any)?.data ?? [] : [];
    const hrvByDate = new Map<string, number>();
    for (const row of recentHrvRaw as Array<{ date: string; value: number | string }>) {
      const n = typeof row.value === "number" ? row.value : Number(row.value);
      if (Number.isFinite(n)) hrvByDate.set(row.date, n);
    }
    const recentVitals: RecentVitalEntry[] = recentVitalsRaw.map((v: any) => {
      const rag = typeof v.readiness === "string" ? v.readiness.toUpperCase() : "";
      return {
        date: v.date,
        sleep_hours: v.sleep_hours ?? null,
        hrv_morning_ms: hrvByDate.get(v.date) ?? null,
        energy: v.energy ?? null,
        soreness: v.soreness ?? null,
        mood: v.mood ?? null,
        readiness_score: rag === "GREEN" ? 80 : rag === "YELLOW" ? 55 : rag === "RED" ? 30 : null,
      };
    });

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
        // Readiness fields carry forward on athlete_snapshots across days.
        // Gate them through the calendar-day freshness helper so yesterday's
        // score never drives today's signal. When stale, the signal engine
        // sees no readiness input and falls to the neutral state — mobile
        // then renders the "Check in to activate your signal" card.
        const freshReadiness = getFreshReadiness(snapshot as any, tz);
        const signalVitals = {
          ...(pdVitals ?? {}),
          readiness_score: freshReadiness?.score,
          readiness_rag: freshReadiness?.rag,
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
          todaySession: todaySessionForSignal,
        });
      }
    } catch (err) {
      console.warn('[boot] Signal evaluation failed, continuing without:', err);
      // signalContext stays null — Dashboard shows neutral state
    }

    // ── Dynamic hero coaching — resolve + overlay ──────────────────────
    // Reads the cached line from athlete_snapshots (written by event handlers).
    // When fresh, we use it directly. When stale/missing, briefly await a
    // regen (template pools are AI-free so the resolver is fast) so the FIRST
    // boot already ships the right line — no pull-to-refresh dance. The race
    // timeout keeps boot latency bounded if something pathological happens in
    // the generator's DB hops.
    //
    // Decoupling from the signal layer: evaluateSignal() returns null for the
    // common healthy-athlete case ("no signals match"). Previously the overlay
    // was gated on signalContext being non-null, so the vibe never reached
    // mobile — the hero silently fell through to the hardcoded "Complete your
    // daily check-in" fallback even after a successful check-in. Now we
    // always resolve the coaching line, and when signalContext is null we
    // synthesize a BASELINE stub (matching mobile's NEUTRAL_SIGNAL shape)
    // carrying the vibe, so the hero stays motivational post-checkin.
    try {
      const snap = snapshot as Record<string, unknown> | null;
      const dynamicCoaching = snap?.dynamic_coaching as string | null | undefined;
      const generatedAt = snap?.dynamic_coaching_generated_at as string | null | undefined;
      const STALE_MS = 6 * 60 * 60 * 1000;
      const REGEN_AWAIT_MS = 1200;
      const ageMs = generatedAt ? Date.now() - Date.parse(generatedAt) : Number.POSITIVE_INFINITY;

      let resolvedCoaching: string | null =
        dynamicCoaching && ageMs < STALE_MS ? dynamicCoaching : null;

      if (!resolvedCoaching) {
        // Missing or stale — try to resolve synchronously with a tight cap.
        // Static import (vs dynamic): dynamic imports inside Next.js API
        // routes can be silently dropped from the production bundle when the
        // chunk graph misses them — top-of-file import guarantees bundling.
        const regenPromise = generateAndPersistHeroCoaching(userId).catch((err) => {
          console.warn('[boot] hero coaching regen failed:', err);
          return null as never;
        });
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), REGEN_AWAIT_MS),
        );
        const fresh = await Promise.race([regenPromise, timeoutPromise]);
        if (fresh && typeof fresh === 'object' && 'text' in fresh && fresh.text) {
          resolvedCoaching = fresh.text as string;
        }
        // If the timeout won, the background regen keeps running — next boot
        // will read the freshly persisted row through the warm-path branch.
      }

      if (resolvedCoaching) {
        if (signalContext) {
          signalContext = { ...signalContext, coaching: resolvedCoaching };
        } else if (isReadinessFresh(snapshot as any, tz)) {
          // No signal matched but the athlete has checked in today — ship a
          // BASELINE stub carrying the vibe so the hero renders motivational
          // copy instead of falling through to the mobile "Complete your
          // daily check-in" CTA (which is reserved for readinessFresh=false).
          signalContext = {
            key: 'BASELINE',
            displayName: 'BASELINE',
            subtitle: '',
            color: '#7a9b76',
            heroBackground: '#12141F',
            arcOpacity: { large: 0.3, medium: 0.3, small: 0.3 },
            pillBackground: 'rgba(122,155,118,0.08)',
            barRgba: 'rgba(122,155,118,0.3)',
            coachingColor: '#567A5C',
            pills: [],
            coaching: resolvedCoaching,
            triggerRows: [],
            adaptedPlan: null,
            showUrgencyBadge: false,
            urgencyLabel: null,
            signalId: 'baseline',
            priority: 999,
            evaluatedAt: new Date().toISOString(),
          };
        }
      }
    } catch (err) {
      // Never let coaching overlay break boot.
      console.warn('[boot] dynamic hero coaching overlay failed:', err);
    }

    // ── Dashboard Layout Resolution ──
    // Resolve CMS-managed dashboard sections against athlete snapshot.
    // Filters by visibility conditions + sport. Returns ordered layouts for
    // the Dashboard scroll view (screen-level) and the three slide-up panels
    // (Program / Metrics / Progress) in a single parallel fan-out.
    type ResolvedLayout = Array<{
      section_key: string;
      display_name: string;
      component_type: string;
      sort_order: number;
      config: Record<string, unknown>;
      coaching_text: string | null;
    }>;
    let dashboardLayout: ResolvedLayout = [];
    let panelLayouts: { program: ResolvedLayout; metrics: ResolvedLayout; progress: ResolvedLayout } = {
      program: [],
      metrics: [],
      progress: [],
    };
    try {
      const flatFresh = getFreshReadiness(snapshot as any, tz);
      const snapshotFlat = {
        ...(snapshot as Record<string, unknown> ?? {}),
        readiness_score: flatFresh?.score ?? null,
        readiness_rag: flatFresh?.rag ?? null,
        energy: latestCheckin?.energy,
        soreness: latestCheckin?.soreness,
        mood: latestCheckin?.mood,
        sleep_hours: whoopSleep?.value ?? latestCheckin?.sleep_hours,
        academic_stress: latestCheckin?.academic_stress,
        has_active_protocol: (pdContext?.activeProtocols?.length ?? 0) > 0,
        dual_load_index: (snapshot as any)?.dual_load_index ?? 0,
        phv_stage: (snapshot as any)?.phv_stage ?? 'none',
        first_name: profile?.name?.split(' ')[0] ?? 'Athlete',
        current_streak: profile?.current_streak ?? 0,
        coaching_summary: signalContext?.coaching ?? '',
      };
      const sport = profile?.sport ?? undefined;
      const [screenLayout, programLayout, metricsLayout, progressLayout] = await Promise.all([
        resolveDashboardLayout(snapshotFlat, sport),
        resolveDashboardLayout(snapshotFlat, sport, 'program'),
        resolveDashboardLayout(snapshotFlat, sport, 'metrics'),
        resolveDashboardLayout(snapshotFlat, sport, 'progress'),
      ]);
      dashboardLayout = screenLayout;
      panelLayouts = {
        program: programLayout,
        metrics: metricsLayout,
        progress: progressLayout,
      };
    } catch (err) {
      console.warn('[boot] Dashboard layout resolution failed, returning empty:', err);
      // Layouts stay empty — mobile renders fallback hardcoded layouts
    }

    // ── Shape response ──
    // Scrub stale readiness from the snapshot shipped to mobile so clients
    // that read snapshot.readiness_score directly (e.g. SignalDashboardTab's
    // deriveReadiness) don't resurrect yesterday's value after the signal
    // engine has already rejected it. The calendar-day gate is applied once
    // here; all downstream readers see either today's values or null.
    const boundaryFresh = snapshot ? getFreshReadiness(snapshot as any, tz) : null;
    const snapshotForClient = snapshot
      ? {
          ...(snapshot as Record<string, unknown>),
          readiness_score: boundaryFresh?.score ?? null,
          readiness_rag: boundaryFresh?.rag ?? null,
        }
      : snapshot;
    const readinessFresh = isReadinessFresh(snapshot as any, tz);

    const bootPayload = {
      name: profile?.name ?? "Athlete",
      sport: profile?.sport ?? "football",
      position: profile?.position ?? null,
      isStudent: (profile?.school_hours ?? 0) > 0,
      age: profile?.age ?? null,
      streak: profile?.current_streak ?? 0,

      snapshot: snapshotForClient,
      readinessFresh,

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

      activeRecs: boostedRecs.slice(0, 3).map((r: any) => ({
        type: r.rec_type ?? r.recType,
        priority: r.priority,
        title: r.title,
        bodyShort: r.body_short ?? r.bodyShort ?? null,
      })),

      dashboardRecs: boostedRecs.slice(0, 6).map((r: any) => ({
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
        startedAt: p.created_at,
        metadata: p.program_snapshot ?? {},
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
            topStrengthDetail: composeBenchmarkDetail(
              benchmarkProfile.strengths?.[0] ?? null,
              benchmarkProfile.results,
              "strength",
            ),
            topGapDetail: composeBenchmarkDetail(
              benchmarkProfile.gaps?.[0] ?? null,
              benchmarkProfile.results,
              "gap",
            ),
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

      // ── Upcoming training + match events (next 14 days) ──
      // Powers Signal Dashboard "What's coming" timeline alongside upcomingExams.
      upcomingEvents: upcomingEventsRaw.map((e: any) => ({
        id: e.id,
        title: e.title,
        type: e.event_type,
        startAt: e.start_at,
        endAt: e.end_at,
        intensity: e.intensity,
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

      // ── Planning Context (360 planning fields) ──
      // Athlete mode, dual load zone, applicable protocols, exam proximity, data confidence.
      planningContext,

      // ── Recent Vitals (7 days) ──
      // For Dashboard sparklines, sleep bars, and trend calculations.
      recentVitals,

      // ── Yesterday's Vitals ──
      // For Dashboard delta calculations in trigger rows.
      yesterdayVitals,

      // ── Dashboard Layout (CMS-managed) ──
      // Ordered array of screen-level sections the athlete should see,
      // filtered by visibility conditions and sport. Config + coaching_text
      // are resolved. Empty array = mobile falls back to hardcoded default.
      dashboardLayout,

      // ── Panel Layouts (CMS-managed, Wave 3b.1) ──
      // Per-panel ordered arrays of sub-sections for the three slide-up
      // panels (Program / Metrics / Progress). Mobile consumers iterate and
      // render each component_type. Empty array per panel = fall back to
      // hardcoded order for that panel.
      panelLayouts,

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
