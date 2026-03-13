import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import { mapDbRowToCalendarEvent } from "@/lib/calendarHelpers";

// ─── Validation ────────────────────────────────────────────────────────────

const patchEventSchema = z.object({
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
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

// ─── Helper: check if a date is locked for a user ──────────────────────────

async function isDayLocked(userId: string, date: string): Promise<boolean> {
  const db = supabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from("day_locks")
    .select("id")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  return !!data;
}

// ─── PATCH /api/v1/calendar/events/[id] ────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await req.json();
    const parsed = patchEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    // Fetch existing event
    const { data: existing } = await db
      .from("calendar_events")
      .select("*")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (existing.user_id !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check lock on the event's current date
    const currentDate = String(existing.start_at).slice(0, 10);
    if (await isDayLocked(auth.user.id, currentDate)) {
      return NextResponse.json(
        { error: "Day is locked" },
        { status: 423 }
      );
    }

    // If moving to a different date, check that date's lock too
    const { startTime, endTime, date: newDate } = parsed.data;
    const targetDate = newDate || currentDate;

    if (newDate && newDate !== currentDate) {
      if (await isDayLocked(auth.user.id, newDate)) {
        return NextResponse.json(
          { error: "Target day is locked" },
          { status: 423 }
        );
      }
    }

    // Build update object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {};

    if (startTime !== undefined) {
      update.start_at = startTime
        ? `${targetDate}T${startTime}:00`
        : `${targetDate}T00:00:00`;
    } else if (newDate) {
      // Date changed but startTime not provided — keep existing time
      const existingTime = String(existing.start_at).slice(11, 16) || "00:00";
      update.start_at = `${targetDate}T${existingTime}:00`;
    }

    if (endTime !== undefined) {
      update.end_at = endTime ? `${targetDate}T${endTime}:00` : null;
    } else if (newDate) {
      // Date changed but endTime not provided — keep existing end time
      const existingEnd = existing.end_at
        ? String(existing.end_at).slice(11, 16)
        : null;
      update.end_at = existingEnd ? `${targetDate}T${existingEnd}:00` : null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data: updated, error } = await db
      .from("calendar_events")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { event: mapDbRowToCalendarEvent(updated as Record<string, unknown>) },
      { headers: { "api-version": "v1" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

// ─── DELETE /api/v1/calendar/events/[id] ───────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const db = supabaseAdmin();

  // Verify ownership before delete
  const { data: event } = await db
    .from("calendar_events")
    .select("id, user_id, start_at")
    .eq("id", id)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.user_id !== auth.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check day lock
  const eventDate = String(event.start_at).slice(0, 10);
  if (await isDayLocked(auth.user.id, eventDate)) {
    return NextResponse.json(
      { error: "Day is locked" },
      { status: 423 }
    );
  }

  const { error } = await db.from("calendar_events").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { success: true },
    { headers: { "api-version": "v1" } }
  );
}
