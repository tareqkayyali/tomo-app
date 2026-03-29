/**
 * POST /api/v1/player/drills/schedule — Schedule AI-recommended drills onto calendar
 *
 * Distributes selected drills across chosen days-of-week starting from a date,
 * creating calendar_events entries for each.
 *
 * Supports dryRun mode: returns a schedule preview for user confirmation
 * before inserting events. Default: dryRun=true (preview first).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  validateBatch,
  type ProposedEvent,
} from "@/services/scheduling/scheduleValidationService";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin() as any;

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const {
    drillIds,
    startDate,
    daysPerWeek,
    selectedDays,
    timezone,
    dryRun: dryRunParam,
    confirmedEvents,
  }: {
    drillIds: string[];
    startDate: string; // YYYY-MM-DD
    daysPerWeek: number;
    selectedDays: number[]; // 0=Sun..6=Sat
    timezone?: string;
    dryRun?: boolean;
    confirmedEvents?: ProposedEvent[];
  } = body;

  const tz = timezone || "UTC";
  const dryRun = dryRunParam !== false; // default true

  // ── CONFIRM MODE: insert pre-validated events ────────────────
  if (!dryRun && Array.isArray(confirmedEvents) && confirmedEvents.length > 0) {
    const insertRows = confirmedEvents.map((evt) => ({
      user_id: auth.user.id,
      title: evt.title,
      event_type: evt.event_type,
      start_at: localToIso(evt.date, evt.startTime, tz),
      end_at: localToIso(evt.date, evt.endTime, tz),
      intensity: evt.intensity || null,
      notes: evt.notes || "AI recommended",
    }));

    const { data: inserted, error: insertErr } = await db()
      .from("calendar_events")
      .insert(insertRows)
      .select("id, title, event_type, start_at");

    if (insertErr) {
      return NextResponse.json(
        { error: insertErr.message },
        { status: 500, headers: { "api-version": "v1" } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        eventsCreated: inserted?.length ?? 0,
        events: inserted ?? [],
        message: `${inserted?.length ?? 0} training sessions added to your schedule`,
      },
      { headers: { "api-version": "v1" } }
    );
  }

  // ── DRY RUN MODE (default): generate + validate + preview ────

  // Validation
  if (!drillIds?.length || !startDate || !selectedDays?.length) {
    return NextResponse.json(
      { error: "drillIds, startDate, and selectedDays are required" },
      { status: 400, headers: { "api-version": "v1" } }
    );
  }

  if (selectedDays.length < 1 || selectedDays.length > 7) {
    return NextResponse.json(
      { error: "selectedDays must have 1-7 entries" },
      { status: 400, headers: { "api-version": "v1" } }
    );
  }

  // Fetch drill details
  const { data: drills, error: drillErr } = await db()
    .from("training_drills")
    .select("id, name, duration_minutes, intensity, category")
    .in("id", drillIds)
    .eq("active", true);

  if (drillErr || !drills?.length) {
    return NextResponse.json(
      { error: "Could not find requested drills" },
      { status: 404, headers: { "api-version": "v1" } }
    );
  }

  // Build a schedule: distribute drills across selected weekdays
  const sortedDays = [...selectedDays].sort((a, b) => a - b);
  const proposedEvents: ProposedEvent[] = [];
  let drillIndex = 0;
  const weeksToSchedule = Math.ceil(drills.length / Math.max(sortedDays.length, 1));

  const start = new Date(startDate + "T00:00:00");

  for (let week = 0; week < weeksToSchedule; week++) {
    for (const dayOfWeek of sortedDays) {
      if (drillIndex >= drills.length) break;

      const eventDate = getNextDayOfWeek(start, dayOfWeek, week);
      const dateStr = eventDate.toISOString().split("T")[0];
      const drill = drills[drillIndex];
      const duration = drill.duration_minutes || 45;

      proposedEvents.push({
        title: drill.name,
        event_type: "training",
        date: dateStr,
        startTime: "16:00", // Default afternoon slot
        endTime: addMinutes("16:00", duration),
        intensity: drill.intensity || "MODERATE",
        notes: `AI recommended · ${drill.category}`,
      });

      drillIndex++;
    }
  }

  if (proposedEvents.length === 0) {
    return NextResponse.json(
      { error: "No events to schedule" },
      { status: 400, headers: { "api-version": "v1" } }
    );
  }

  // Validate proposed events against rule engine
  const preview = await validateBatch(auth.user.id, proposedEvents, tz);

  return NextResponse.json(
    {
      success: true,
      dryRun: true,
      preview,
      message: preview.summary.withViolations > 0
        ? `${proposedEvents.length} drill sessions proposed — ${preview.summary.withViolations} need attention`
        : `${proposedEvents.length} drill sessions ready to add`,
    },
    { headers: { "api-version": "v1" } }
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function getNextDayOfWeek(start: Date, targetDay: number, weekOffset: number): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + weekOffset * 7);
  const currentDay = d.getDay();
  let diff = targetDay - currentDay;
  if (diff < 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function addMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const totalMin = h * 60 + m + minutes;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

/**
 * Convert local date + time in a timezone to ISO string.
 * Uses formatToParts for reliable cross-runtime conversion.
 */
function localToIso(date: string, time: string, tz: string): string {
  try {
    const normTime = time.includes(':') && time.split(':').length < 3 ? `${time}:00` : time;
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
    return `${date}T${time}:00Z`;
  }
}
