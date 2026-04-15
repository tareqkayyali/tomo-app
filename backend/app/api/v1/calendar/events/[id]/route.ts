import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import { mapDbRowToCalendarEvent, localToUtc } from "@/lib/calendarHelpers";
import {
  validateEvent,
  autoPosition,
  timeToMinutes,
  minutesToTime,
  DEFAULT_CONFIG,
} from "@/services/schedulingEngine";
import type { ScheduleEvent } from "@/services/schedulingEngine";
import { bridgeCalendarToEventStream } from "@/services/events/calendarBridge";
import { estimateTotalLoad } from "@/services/events/computations/loadEstimator";

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
  notes: z.string().optional(),
  name: z.string().min(1).max(200).optional(),
  intensity: z.enum(["REST", "LIGHT", "MODERATE", "HARD", "rest", "light", "moderate", "medium", "hard"]).nullable().optional(),
  // Structured session plan (drill list). See migration 046.
  sessionPlan: z
    .object({
      builtBy: z.string().optional(),
      focus: z.string().optional(),
      totalMinutes: z.number().optional(),
      drills: z
        .array(
          z.object({
            name: z.string(),
            category: z.string().optional(),
            durationMin: z.number().optional(),
            intensity: z.string().optional(),
            description: z.string().optional(),
          })
        )
        .optional(),
    })
    .passthrough()
    .nullable()
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
    const { startTime, endTime, date: newDate, notes, name, intensity, sessionPlan } = parsed.data;
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
    const tz = (body as Record<string, unknown>).timezone as string || "UTC";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {};

    if (startTime !== undefined) {
      update.start_at = startTime
        ? localToUtc(targetDate, `${startTime}:00`, tz)
        : localToUtc(targetDate, "00:00:00", tz);
    } else if (newDate) {
      // Date changed but startTime not provided — convert existing UTC time to local, then back
      const existingUtc = new Date(String(existing.start_at));
      const localTime = existingUtc.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
      update.start_at = localToUtc(targetDate, `${localTime}:00`, tz);
    }

    if (endTime !== undefined) {
      update.end_at = endTime ? localToUtc(targetDate, `${endTime}:00`, tz) : null;
    } else if (newDate && existing.end_at) {
      // Date changed but endTime not provided — convert existing UTC end time to local, then back
      const existingEndUtc = new Date(String(existing.end_at));
      const localEndTime = existingEndUtc.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
      update.end_at = localToUtc(targetDate, `${localEndTime}:00`, tz);
    }

    if (notes !== undefined) {
      update.notes = notes;
    }

    if (name !== undefined) {
      update.name = name;
    }

    if (intensity !== undefined) {
      update.intensity = intensity;
    }

    if (sessionPlan !== undefined) {
      update.session_plan = sessionPlan;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // ── Smart Calendar: conflict validation for moves ───────────
    let autoRepositioned = false;
    let originalTime: { startTime: string | null; endTime: string | null } | null = null;

    const resolvedStartTime = startTime ?? (existing.start_at
      ? new Date(String(existing.start_at)).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
      : null);
    const resolvedEndTime = endTime ?? (existing.end_at
      ? new Date(String(existing.end_at)).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
      : null);

    if (resolvedStartTime && resolvedEndTime) {
      // Fetch existing events for the target date (excluding this event)
      const dayStartUtc = localToUtc(targetDate, "00:00:00", tz);
      const dayEndUtc = localToUtc(targetDate, "23:59:59", tz);
      const { data: dayRows } = await db
        .from("calendar_events")
        .select("*")
        .eq("user_id", auth.user.id)
        .gte("start_at", dayStartUtc)
        .lte("start_at", dayEndUtc)
        .neq("id", id);

      const existingEvents: ScheduleEvent[] = (dayRows || []).map((r: Record<string, unknown>) => {
        const mapped = mapDbRowToCalendarEvent(r, tz);
        return {
          id: String(mapped.id),
          name: String(mapped.name),
          startTime: mapped.startTime as string | null,
          endTime: mapped.endTime as string | null,
          type: String(mapped.type),
          intensity: mapped.intensity as string | null,
        };
      });

      const config = { ...DEFAULT_CONFIG };
      const gapPref = (body as Record<string, unknown>).gapMinutes;
      if (typeof gapPref === "number" && gapPref >= 0 && gapPref <= 120) {
        config.gapMinutes = gapPref;
      }

      const newStartMin = timeToMinutes(resolvedStartTime);
      const newEndMin = timeToMinutes(resolvedEndTime);
      const conflict = validateEvent(newStartMin, newEndMin, existingEvents, config);

      if (conflict.hasConflict) {
        const duration = newEndMin - newStartMin;
        const repositioned = autoPosition(duration, newStartMin, existingEvents, config);

        if (!repositioned) {
          return NextResponse.json(
            {
              error: "No available time slot for this move",
              conflicts: conflict.conflictingEvents,
              gapViolations: conflict.gapViolations,
            },
            { status: 409, headers: { "api-version": "v1" } }
          );
        }

        autoRepositioned = true;
        originalTime = { startTime: resolvedStartTime, endTime: resolvedEndTime };
        const newStart = minutesToTime(repositioned.startMin);
        const newEnd = minutesToTime(repositioned.endMin);
        update.start_at = localToUtc(targetDate, `${newStart}:00`, tz);
        update.end_at = localToUtc(targetDate, `${newEnd}:00`, tz);
      }
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

    // Bridge update to Layer 1 event stream for RIE (fire-and-forget)
    const updatedRow = updated as any;
    const durationMin = updatedRow.end_at && updatedRow.start_at
      ? (new Date(updatedRow.end_at).getTime() - new Date(updatedRow.start_at).getTime()) / 60000
      : 60;
    bridgeCalendarToEventStream({
      athleteId: auth.user.id,
      calendarEvent: {
        id: updatedRow.id,
        title: updatedRow.title,
        event_type: updatedRow.event_type,
        start_at: updatedRow.start_at,
        end_at: updatedRow.end_at,
        intensity: updatedRow.intensity ?? null,
        estimated_load_au: updatedRow.estimated_load_au ?? estimateTotalLoad({
          event_type: updatedRow.event_type,
          intensity: updatedRow.intensity ?? null,
          duration_min: durationMin,
        }),
      },
      action: 'UPDATED',
      createdBy: auth.user.id,
    }).catch((err) => console.error('[CalendarBridge] live bridge error:', err));

    const mappedEvent = mapDbRowToCalendarEvent(updated as Record<string, unknown>, tz);
    return NextResponse.json(
      {
        event: mappedEvent,
        ...(autoRepositioned && {
          autoRepositioned: true,
          originalTime,
          suggestedTime: { startTime: mappedEvent.startTime, endTime: mappedEvent.endTime },
        }),
      },
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

  // Verify ownership before delete (select extra fields for bridge)
  const { data: event } = await db
    .from("calendar_events")
    .select("id, user_id, start_at, end_at, event_type, intensity, estimated_load_au, title")
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

  // Bridge deletion to Layer 1 event stream before deleting (fire-and-forget)
  const evtData = event as any;
  bridgeCalendarToEventStream({
    athleteId: auth.user.id,
    calendarEvent: {
      id: evtData.id,
      title: evtData.title ?? '',
      event_type: evtData.event_type,
      start_at: evtData.start_at,
      end_at: evtData.end_at,
      intensity: evtData.intensity ?? null,
      estimated_load_au: evtData.estimated_load_au ?? null,
    },
    action: 'DELETED',
    createdBy: auth.user.id,
  }).catch((err) => console.error('[CalendarBridge] live bridge error:', err));

  const { error } = await db.from("calendar_events").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { success: true },
    { headers: { "api-version": "v1" } }
  );
}
