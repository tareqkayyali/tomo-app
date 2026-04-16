import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mapDbRowToCalendarEvent, localToUtc } from "@/lib/calendarHelpers";
import {
  suggestBestTimes,
  format12h,
  minutesToTime,
  getSchedulingConfigFromCMS,
} from "@/services/schedulingEngine";
import type { ScheduleEvent } from "@/services/schedulingEngine";

// ─── GET /api/v1/calendar/suggest-slots ──────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const eventType = url.searchParams.get("eventType") || "training";
  const durationMin = parseInt(url.searchParams.get("durationMin") || "60", 10);
  const tz = url.searchParams.get("timezone") || "UTC";
  // How many top slots the scheduling engine should return. Default 6
  // so conflict-resolution cards can show a useful selection, not a
  // single chip. Capped at 10 to keep the response tight.
  const limitRaw = parseInt(url.searchParams.get("limit") || "6", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 6, 1), 10);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Missing or invalid date parameter (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  try {
    const db = supabaseAdmin();

    // Fetch existing events for the day
    const dayStart = localToUtc(date, "00:00:00", tz);
    const dayEnd = localToUtc(date, "23:59:59", tz);
    const { data: dayRows } = await db
      .from("calendar_events")
      .select("*")
      .eq("user_id", auth.user.id)
      .gte("start_at", dayStart)
      .lte("start_at", dayEnd);

    const existingEvents: ScheduleEvent[] = (dayRows || []).map(
      (r: Record<string, unknown>) => {
        const mapped = mapDbRowToCalendarEvent(r, tz);
        return {
          id: String(mapped.id),
          name: String(mapped.name),
          startTime: mapped.startTime as string | null,
          endTime: mapped.endTime as string | null,
          type: String(mapped.type),
          intensity: mapped.intensity as string | null,
        };
      }
    );

    // Get readiness level from snapshot (optional)
    const { data: snapshot } = await db
      .from("athlete_snapshots")
      .select("readiness_rag")
      .eq("athlete_id", auth.user.id)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const readinessLevel = snapshot?.readiness_rag || null;

    // Get day of week (0=Sun, 6=Sat)
    const dayOfWeek = new Date(date).getDay();

    // Build config from CMS scheduling_rules, then layer on school schedule
    const config = await getSchedulingConfigFromCMS();

    // Get user schedule preferences for school hours
    const { data: prefs } = await db
      .from("player_schedule_preferences")
      .select("school_days, school_start, school_end")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (prefs?.school_start && prefs?.school_end) {
      config.respectSchoolHours = true;
      config.schoolSchedule = {
        days: prefs.school_days || [1, 2, 3, 4, 5],
        startTime: prefs.school_start,
        endTime: prefs.school_end,
      };
    }

    const slots = suggestBestTimes(
      eventType,
      durationMin,
      existingEvents,
      readinessLevel,
      config,
      dayOfWeek,
      limit
    );

    // Format response with 12h times
    const formattedSlots = slots.map((s) => ({
      start: format12h(minutesToTime(s.startMin)),
      end: format12h(minutesToTime(s.endMin)),
      startTime24: minutesToTime(s.startMin),
      endTime24: minutesToTime(s.endMin),
      score: s.score,
      reason: s.reason,
    }));

    return NextResponse.json(
      {
        date,
        eventType,
        durationMin,
        existingEvents: existingEvents.map((e) => ({
          id: e.id,
          name: e.name,
          startTime: e.startTime ? format12h(e.startTime) : null,
          endTime: e.endTime ? format12h(e.endTime) : null,
          type: e.type,
        })),
        slots: formattedSlots,
      },
      { headers: { "api-version": "v1" } }
    );
  } catch (err) {
    console.error("[suggest-slots] Error:", err);
    return NextResponse.json(
      { error: "Failed to compute slot suggestions" },
      { status: 500 }
    );
  }
}
