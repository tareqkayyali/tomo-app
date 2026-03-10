import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

const calendarEventSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  eventType: z
    .enum(["training", "match", "recovery", "study", "exam", "other"])
    .optional()
    .default("training"),
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

    const { name, date, eventType, startTime, endTime, notes } = parsed.data;

    // Build start_at from date + optional startTime
    const startAt = startTime
      ? `${date}T${startTime}:00`
      : `${date}T00:00:00`;

    const endAt =
      endTime
        ? `${date}T${endTime}:00`
        : null;

    const db = supabaseAdmin();
    const { data: event, error } = await db
      .from("calendar_events")
      .insert({
        user_id: auth.user.id,
        title: name,
        event_type: eventType || "training",
        start_at: startAt,
        end_at: endAt,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { event },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = req.nextUrl;
  const date = searchParams.get("date");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const db = supabaseAdmin();

  if (date) {
    // Single day — query events whose start_at falls on that date
    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;

    const { data: events, error } = await db
      .from("calendar_events")
      .select("*")
      .eq("user_id", auth.user.id)
      .gte("start_at", dayStart)
      .lte("start_at", dayEnd)
      .order("start_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { events: events || [] },
      { headers: { "api-version": "v1" } }
    );
  }

  if (startDate && endDate) {
    const rangeStart = `${startDate}T00:00:00`;
    const rangeEnd = `${endDate}T23:59:59`;

    const { data: events, error } = await db
      .from("calendar_events")
      .select("*")
      .eq("user_id", auth.user.id)
      .gte("start_at", rangeStart)
      .lte("start_at", rangeEnd)
      .order("start_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { events: events || [] },
      { headers: { "api-version": "v1" } }
    );
  }

  return NextResponse.json(
    { error: "Provide 'date' or 'startDate' + 'endDate' query params" },
    { status: 400 }
  );
}
