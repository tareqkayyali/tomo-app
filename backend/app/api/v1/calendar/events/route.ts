import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import {
  mapDbRowToCalendarEvent,
  toDbEventType,
} from "@/lib/calendarHelpers";

// ─── Validation ────────────────────────────────────────────────────────────

const calendarEventSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  // Accept both frontend ("type") and legacy ("eventType") field names
  type: z
    .enum(["training", "match", "recovery", "study_block", "study", "exam", "other"])
    .optional(),
  eventType: z
    .enum(["training", "match", "recovery", "study_block", "study", "exam", "other"])
    .optional(),
  sport: z
    .enum(["football", "padel", "general", "basketball", "tennis"])
    .optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  intensity: z
    .enum(["REST", "LIGHT", "MODERATE", "HARD"])
    .nullable()
    .optional(),
  notes: z.string().max(500).nullable().optional(),
});

// ─── POST /api/v1/calendar/events ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = calendarEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, date, startTime, endTime, intensity, notes, sport } = parsed.data;

    // Resolve event type: prefer "type" (new), fall back to "eventType" (legacy)
    const rawType = parsed.data.type || parsed.data.eventType || "training";
    const dbEventType = toDbEventType(rawType);

    // Build start_at from date + optional startTime
    const startAt = startTime
      ? `${date}T${startTime}:00`
      : `${date}T00:00:00`;

    const endAt = endTime ? `${date}T${endTime}:00` : null;

    const db = supabaseAdmin();

    // Base insert object (matches generated Supabase types)
    const insertBase = {
      user_id: auth.user.id,
      title: name,
      event_type: dbEventType,
      start_at: startAt,
      end_at: endAt,
      notes: notes || null,
    };

    // Extended fields (intensity, sport) — columns added via migration 0008
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertData = {
      ...insertBase,
      intensity: intensity || null,
      sport: sport || null,
    } as typeof insertBase;

    const { data: event, error } = await db
      .from("calendar_events")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return transformed event matching frontend CalendarEvent shape
    return NextResponse.json(
      { event: mapDbRowToCalendarEvent(event as Record<string, unknown>) },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

// ─── GET /api/v1/calendar/events ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = req.nextUrl;
  const date = searchParams.get("date");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const db = supabaseAdmin();

  if (date) {
    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;

    const { data: rows, error } = await db
      .from("calendar_events")
      .select("*")
      .eq("user_id", auth.user.id)
      .gte("start_at", dayStart)
      .lte("start_at", dayEnd)
      .order("start_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const events = (rows || []).map((r) =>
      mapDbRowToCalendarEvent(r as Record<string, unknown>)
    );

    return NextResponse.json(
      { events },
      { headers: { "api-version": "v1" } }
    );
  }

  if (startDate && endDate) {
    const rangeStart = `${startDate}T00:00:00`;
    const rangeEnd = `${endDate}T23:59:59`;

    const { data: rows, error } = await db
      .from("calendar_events")
      .select("*")
      .eq("user_id", auth.user.id)
      .gte("start_at", rangeStart)
      .lte("start_at", rangeEnd)
      .order("start_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const events = (rows || []).map((r) =>
      mapDbRowToCalendarEvent(r as Record<string, unknown>)
    );

    return NextResponse.json(
      { events },
      { headers: { "api-version": "v1" } }
    );
  }

  return NextResponse.json(
    { error: "Provide 'date' or 'startDate' + 'endDate' query params" },
    { status: 400 }
  );
}
