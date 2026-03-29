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
    const [dayStartISO, dayEndISO] = getDayBoundsISO(today, tz);

    const in14Days = new Date(now.getTime() + 14 * 86400000)
      .toLocaleDateString("en-CA", { timeZone: tz });
    const [, in14DaysEndISO] = getDayBoundsISO(in14Days, tz);

    const db = supabaseAdmin();

    // ── 7 parallel queries ──
    const [
      profileRes,
      snapshotRes,
      todayEventsRes,
      checkinRes,
      recsRes,
      benchmarkRes,
      examsRes,
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
    ]);

    // ── Extract results with graceful fallbacks ──
    const profile = profileRes.status === "fulfilled" ? profileRes.value?.data : null;
    const snapshot = snapshotRes.status === "fulfilled" ? snapshotRes.value : null;
    const todayEvents = todayEventsRes.status === "fulfilled" ? todayEventsRes.value?.data ?? [] : [];
    const latestCheckin = checkinRes.status === "fulfilled" ? checkinRes.value?.data ?? null : null;
    const activeRecs = recsRes.status === "fulfilled" ? recsRes.value ?? [] : [];
    const benchmarkProfile = benchmarkRes.status === "fulfilled" ? benchmarkRes.value : null;
    const upcomingExams = examsRes.status === "fulfilled" ? examsRes.value?.data ?? [] : [];

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
            sleepHours: latestCheckin.sleep_hours,
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

      upcomingExams: upcomingExams.map((e: any) => ({
        title: e.title,
        date: e.start_at,
      })),

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
