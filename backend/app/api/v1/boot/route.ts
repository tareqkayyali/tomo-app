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

      // 5. Active recommendations (top 3)
      getRecommendations(userId, { role: "ATHLETE", limit: 3 }),

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
