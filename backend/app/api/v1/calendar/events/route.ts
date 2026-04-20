import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import {
  mapDbRowToCalendarEvent,
  toDbEventType,
  localToUtc,
} from "@/lib/calendarHelpers";
import { attachJournalState } from "@/lib/calendarJournalHelper";
import { attachLinkedPrograms, autoLinkPrescribedPrograms } from "@/lib/calendarLinkedProgramsHelper";
import { attachConflictFlags } from "@/lib/calendarConflictHelper";
import {
  validateEvent,
  autoPosition,
  timeToMinutes,
  minutesToTime,
  getSchedulingConfigFromCMS,
} from "@/services/schedulingEngine";
import type { ScheduleEvent } from "@/services/schedulingEngine";
import { estimateTotalLoad } from "@/services/events/computations/loadEstimator";
import { resolveCalendarIntensity } from "@/services/events/resolveCalendarIntensity";
import { bridgeCalendarToEventStream } from "@/services/events/calendarBridge";
import { parsePagination, paginatedResponse, hasPaginationParams } from "@/lib/pagination";
import { checkPHVSafety } from "@/services/safety/phvSafetyMiddleware";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Normalize intensity to DB CHECK constraint values: REST, LIGHT, MODERATE, HARD */
function normalizeIntensity(raw: string): string {
  const map: Record<string, string> = {
    rest: "REST", light: "LIGHT", moderate: "MODERATE",
    medium: "MODERATE", hard: "HARD",
    REST: "REST", LIGHT: "LIGHT", MODERATE: "MODERATE", HARD: "HARD",
  };
  return map[raw] ?? raw.toUpperCase();
}

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
    .enum(["REST", "LIGHT", "MODERATE", "HARD", "rest", "light", "moderate", "medium", "hard"])
    .nullable()
    .optional(),
  notes: z.string().max(500).nullable().optional(),
  // Structured session plan (drill list built by the AI multi_step flow).
  // Free-form JSONB validated at app layer; see migration 046.
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
  // Phase 5: Tomo auto-link prescribed programs on create.
  // Slug list forwarded from the ai-service build_session flow.
  // Backend resolves slug -> training_programs.id via FOOTBALL_PROGRAMS
  // name lookup and inserts event_linked_programs rows with
  // linked_by='tomo' in the same request. Fail-open on any error.
  linkedProgramSlugs: z.array(z.string().min(1).max(80)).max(10).optional(),
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

    const { name, date, startTime, endTime, intensity, notes, sport, sessionPlan, linkedProgramSlugs } = parsed.data;
    const tz = (body as Record<string, unknown>).timezone as string || "UTC";

    // Resolve event type: prefer "type" (new), fall back to "eventType" (legacy)
    const rawType = parsed.data.type || parsed.data.eventType || "training";
    const dbEventType = toDbEventType(rawType);

    // Build start_at/end_at as UTC, converting from the user's local timezone
    const startAt = startTime
      ? localToUtc(date, `${startTime}:00`, tz)
      : localToUtc(date, "00:00:00", tz);

    const endAt = endTime ? localToUtc(date, `${endTime}:00`, tz) : null;

    const db = supabaseAdmin();

    // Check if day is locked
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lockRow } = await (db as any)
      .from("day_locks")
      .select("id")
      .eq("user_id", auth.user.id)
      .eq("date", date)
      .maybeSingle();

    if (lockRow) {
      return NextResponse.json(
        { error: "Day is locked" },
        { status: 423 }
      );
    }

    // ── PHV safety guard (Mid-PHV athletes) ─────────────────────
    // Server-enforced blocklist for heavy barbell + depth-drop work.
    // Prompts alone don't guarantee the LLM obeys, so the guard lives
    // on the write path.
    const phvCheck = await checkPHVSafety(db, {
      userId: auth.user.id,
      eventType: dbEventType,
      name,
      notes: notes ?? null,
    });
    if (!phvCheck.ok) {
      return NextResponse.json(
        {
          error: phvCheck.reason,
          code: phvCheck.code,
          suggestion: phvCheck.suggestion,
          matchedKeyword: phvCheck.matchedKeyword,
        },
        { status: 400 }
      );
    }

    // ── Smart Calendar: conflict validation ─────────────────────
    let finalStartAt = startAt;
    let finalEndAt = endAt;
    let autoRepositioned = false;
    let originalTime: { startTime: string | null; endTime: string | null } | null = null;

    if (startTime && endTime) {
      // Fetch existing events for the day
      const dayStart = localToUtc(date, "00:00:00", tz);
      const dayEnd = localToUtc(date, "23:59:59", tz);
      const { data: dayRows } = await db
        .from("calendar_events")
        .select("*")
        .eq("user_id", auth.user.id)
        .gte("start_at", dayStart)
        .lte("start_at", dayEnd);

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

      // CMS scheduling rules (live-editable via admin panel)
      const config = await getSchedulingConfigFromCMS();
      const gapPref = (body as Record<string, unknown>).gapMinutes;
      if (typeof gapPref === "number" && gapPref >= 0 && gapPref <= 120) {
        config.gapMinutes = gapPref;
      }

      const newStartMin = timeToMinutes(startTime);
      const newEndMin = timeToMinutes(endTime);
      const conflict = validateEvent(newStartMin, newEndMin, existingEvents, config);

      if (conflict.hasConflict) {
        const duration = newEndMin - newStartMin;
        const repositioned = autoPosition(duration, newStartMin, existingEvents, config);

        if (!repositioned) {
          return NextResponse.json(
            {
              error: "No available time slot for this event",
              conflicts: conflict.conflictingEvents,
              gapViolations: conflict.gapViolations,
            },
            { status: 409, headers: { "api-version": "v1" } }
          );
        }

        // Auto-reposition to the next available slot
        autoRepositioned = true;
        originalTime = { startTime, endTime };
        const newStart = minutesToTime(repositioned.startMin);
        const newEnd = minutesToTime(repositioned.endMin);
        finalStartAt = localToUtc(date, `${newStart}:00`, tz);
        finalEndAt = localToUtc(date, `${newEnd}:00`, tz);
      }
    }

    // Resolve intensity via the cascade: explicit pick → event-type override
    // → linked program's default_intensity → program difficulty map →
    // catalog default (MODERATE). Prevents the class of bugs where athletes
    // schedule without picking an intensity and SESSION_LOG later fires
    // with intensity=null, leaving training_load_au=0 for every session.
    const resolvedIntensity = await resolveCalendarIntensity({
      db,
      athleteId: auth.user.id,
      eventType: dbEventType,
      explicitIntensity: intensity ?? null,
      linkedProgramSlugs: linkedProgramSlugs ?? null,
      sport: sport ?? null,
    });

    // Compute estimated load from event metadata using the resolved intensity.
    const durationMin = finalEndAt
      ? (new Date(finalEndAt).getTime() - new Date(finalStartAt).getTime()) / 60000
      : 60;
    const estimatedLoad = estimateTotalLoad({
      event_type: dbEventType,
      intensity: resolvedIntensity,
      duration_min: durationMin,
    });

    // Base insert object (matches generated Supabase types)
    const insertBase = {
      user_id: auth.user.id,
      title: name,
      event_type: dbEventType,
      start_at: finalStartAt,
      end_at: finalEndAt,
      notes: notes || null,
    };

    // Extended fields (intensity, sport, estimated_load_au, session_plan) — columns added via migrations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertData = {
      ...insertBase,
      // resolvedIntensity is already the normalized canonical form (REST/LIGHT/MODERATE/HARD or null)
      intensity: resolvedIntensity,
      sport: sport || null,
      estimated_load_au: estimatedLoad,
      session_plan: sessionPlan ?? null,
    } as typeof insertBase;

    const { data: event, error } = await db
      .from("calendar_events")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Phase 5: Tomo auto-link prescribed programs ───────────────
    // When build_session forwards linkedProgramSlugs, resolve slugs ->
    // training_programs.id and insert event_linked_programs rows with
    // linked_by='tomo'. Fail-open: any error here is logged and
    // swallowed; the event is already persisted and the user still
    // sees it. Matches calendarLinkedProgramsHelper.ts read-path
    // convention.
    let autoLinkedCount = 0;
    if (linkedProgramSlugs && linkedProgramSlugs.length > 0) {
      try {
        autoLinkedCount = await autoLinkPrescribedPrograms({
          eventId: (event as { id: string }).id,
          userId: auth.user.id,
          slugs: linkedProgramSlugs,
          sport: sport || "football",
        });
        console.log(
          `[events POST] auto-linked ${autoLinkedCount} programs to event ${(event as { id: string }).id}`
        );
      } catch (e) {
        console.warn(
          "[events POST] auto-link failed (fail-open):",
          e instanceof Error ? e.message : String(e)
        );
      }
    }

    // Bridge to Layer 1 event stream for RIE (fire-and-forget)
    bridgeCalendarToEventStream({
      athleteId: auth.user.id,
      calendarEvent: {
        id: (event as any).id,
        title: name,
        event_type: dbEventType,
        start_at: finalStartAt,
        end_at: finalEndAt,
        intensity: intensity ?? null,
        estimated_load_au: estimatedLoad,
      },
      action: 'CREATED',
      createdBy: auth.user.id,
    }).catch((err) => console.error('[CalendarBridge] live bridge error:', err));

    // Return transformed event matching frontend CalendarEvent shape
    const mappedEvent = mapDbRowToCalendarEvent(event as Record<string, unknown>, tz);
    return NextResponse.json(
      {
        event: mappedEvent,
        ...(autoLinkedCount > 0 && { autoLinkedProgramCount: autoLinkedCount }),
        ...(autoRepositioned && {
          autoRepositioned: true,
          originalTime,
          suggestedTime: { startTime: mappedEvent.startTime, endTime: mappedEvent.endTime },
        }),
      },
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
  const tz = searchParams.get("tz") || "UTC";
  const paginate = hasPaginationParams(req);

  const db = supabaseAdmin();

  if (date) {
    // Convert local day boundaries to UTC for querying
    const dayStart = localToUtc(date, "00:00:00", tz);
    const dayEnd = localToUtc(date, "23:59:59", tz);

    if (paginate) {
      const params = parsePagination(req, 50, 200);
      const { data: rows, error, count } = await db
        .from("calendar_events")
        .select("*", { count: "exact" })
        .eq("user_id", auth.user.id)
        .gte("start_at", dayStart)
        .lte("start_at", dayEnd)
        .order("start_at", { ascending: true })
        .range(params.offset, params.offset + params.limit - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const mappedEvents = (rows || []).map((r) =>
        mapDbRowToCalendarEvent(r as Record<string, unknown>, tz)
      );
      const withJournal = await attachJournalState(mappedEvents, auth.user.id);
    const withPrograms = await attachLinkedPrograms(withJournal);
    const events = await attachConflictFlags(withPrograms);

      return NextResponse.json(
        paginatedResponse(events, count ?? 0, params),
        { headers: { "api-version": "v1" } }
      );
    }

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

    const mappedEvents = (rows || []).map((r) =>
      mapDbRowToCalendarEvent(r as Record<string, unknown>, tz)
    );
    const withJournal = await attachJournalState(mappedEvents, auth.user.id);
    const withPrograms = await attachLinkedPrograms(withJournal);
    const events = await attachConflictFlags(withPrograms);

    return NextResponse.json(
      { events },
      { headers: { "api-version": "v1" } }
    );
  }

  if (startDate && endDate) {
    const rangeStart = localToUtc(startDate, "00:00:00", tz);
    const rangeEnd = localToUtc(endDate, "23:59:59", tz);

    if (paginate) {
      const params = parsePagination(req, 50, 200);
      const { data: rows, error, count } = await db
        .from("calendar_events")
        .select("*", { count: "exact" })
        .eq("user_id", auth.user.id)
        .gte("start_at", rangeStart)
        .lte("start_at", rangeEnd)
        .order("start_at", { ascending: true })
        .range(params.offset, params.offset + params.limit - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const mappedEvents = (rows || []).map((r) =>
        mapDbRowToCalendarEvent(r as Record<string, unknown>, tz)
      );
      const withJournal = await attachJournalState(mappedEvents, auth.user.id);
    const withPrograms = await attachLinkedPrograms(withJournal);
    const events = await attachConflictFlags(withPrograms);

      return NextResponse.json(
        paginatedResponse(events, count ?? 0, params),
        { headers: { "api-version": "v1" } }
      );
    }

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

    const mappedEvents = (rows || []).map((r) =>
      mapDbRowToCalendarEvent(r as Record<string, unknown>, tz)
    );
    const withJournal = await attachJournalState(mappedEvents, auth.user.id);
    const withPrograms = await attachLinkedPrograms(withJournal);
    const events = await attachConflictFlags(withPrograms);

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
