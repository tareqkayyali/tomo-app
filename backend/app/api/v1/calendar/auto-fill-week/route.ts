/**
 * POST /api/v1/calendar/auto-fill-week — Fill My Week
 *
 * Uses ghost suggestions (pattern-based) + scheduling engine to
 * batch-create conflict-free events for the upcoming week.
 *
 * Supports dryRun mode: returns a schedule preview for user confirmation
 * before inserting events. Default: dryRun=true (preview first).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mapDbRowToCalendarEvent, localToUtc } from "@/lib/calendarHelpers";
import {
  autoPosition,
  timeToMinutes,
  minutesToTime,
  DEFAULT_CONFIG,
} from "@/services/schedulingEngine";
import type { ScheduleEvent } from "@/services/schedulingEngine";
import {
  validateBatch,
  type ProposedEvent,
} from "@/services/scheduling/scheduleValidationService";
import { estimateTotalLoad } from "@/services/events/computations/loadEstimator";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin() as any;

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const tz: string = body.timezone || "UTC";
    const gapMinutes: number =
      typeof body.gapMinutes === "number" ? body.gapMinutes : 30;
    const dryRun: boolean = body.dryRun !== false; // default true — preview first

    // ── CONFIRM MODE: insert pre-validated events ────────────────
    if (!dryRun && Array.isArray(body.confirmedEvents)) {
      const createdEvents: Array<Record<string, unknown>> = [];

      for (const evt of body.confirmedEvents as ProposedEvent[]) {
        const evtStartAt = localToUtc(evt.date, `${evt.startTime}:00`, tz);
        const evtEndAt = localToUtc(evt.date, `${evt.endTime}:00`, tz);
        const evtDurationMin = (new Date(evtEndAt).getTime() - new Date(evtStartAt).getTime()) / 60000;
        const evtEstimatedLoad = estimateTotalLoad({
          event_type: evt.event_type,
          intensity: evt.intensity ?? null,
          duration_min: evtDurationMin,
        });

        const { data: inserted, error: insertErr } = await db()
          .from("calendar_events")
          .insert({
            user_id: auth.user.id,
            title: evt.title,
            event_type: evt.event_type,
            start_at: evtStartAt,
            end_at: evtEndAt,
            intensity: evt.intensity || null,
            notes: evt.notes || "Auto-filled from your patterns",
            estimated_load_au: evtEstimatedLoad,
          })
          .select("*")
          .single();

        if (!insertErr && inserted) {
          const mapped = mapDbRowToCalendarEvent(
            inserted as Record<string, unknown>,
            tz,
          );
          createdEvents.push(mapped as unknown as Record<string, unknown>);
        }
      }

      return NextResponse.json(
        {
          success: true,
          eventsCreated: createdEvents.length,
          events: createdEvents,
          message:
            createdEvents.length > 0
              ? `${createdEvents.length} sessions added to your week`
              : "No events were created",
        },
        { headers: { "api-version": "v1" } },
      );
    }

    // ── DRY RUN MODE (default): generate + validate + preview ────

    // 1. Get ghost suggestions for the upcoming week
    const ghostRes = await fetch(
      new URL("/api/v1/calendar/ghost-suggestions", req.url),
      {
        headers: { authorization: req.headers.get("authorization") || "" },
      },
    );

    if (!ghostRes.ok) {
      return NextResponse.json(
        { error: "Could not fetch suggestions" },
        { status: 502, headers: { "api-version": "v1" } },
      );
    }

    const { suggestions } = (await ghostRes.json()) as {
      suggestions: Array<{
        suggestion: {
          name: string;
          type: string;
          startTime: string | null;
          endTime: string | null;
          intensity?: string;
        };
        date: string;
      }>;
    };

    if (!suggestions || suggestions.length === 0) {
      return NextResponse.json(
        {
          success: true,
          eventsCreated: 0,
          events: [],
          preview: null,
          message: "No patterns detected yet — keep logging events!",
        },
        { headers: { "api-version": "v1" } },
      );
    }

    // 2. Position events using the scheduling engine (conflict-free placement)
    const config = { ...DEFAULT_CONFIG, gapMinutes };
    const proposedEvents: ProposedEvent[] = [];

    // Group suggestions by date
    const byDate: Record<
      string,
      Array<{ name: string; type: string; startTime: string | null; endTime: string | null; intensity?: string }>
    > = {};
    for (const s of suggestions) {
      if (!byDate[s.date]) byDate[s.date] = [];
      byDate[s.date].push(s.suggestion);
    }

    for (const [dateStr, daySuggestions] of Object.entries(byDate)) {
      // Check day lock
      const { data: lockData } = await db()
        .from("day_locks")
        .select("id")
        .eq("user_id", auth.user.id)
        .eq("date", dateStr)
        .maybeSingle();

      if (lockData) continue; // Skip locked days

      // Fetch existing events for this date
      const dayStartUtc = localToUtc(dateStr, "00:00:00", tz);
      const dayEndUtc = localToUtc(dateStr, "23:59:59", tz);
      const { data: dayRows } = await db()
        .from("calendar_events")
        .select("*")
        .eq("user_id", auth.user.id)
        .gte("start_at", dayStartUtc)
        .lte("start_at", dayEndUtc);

      const existingEvents: ScheduleEvent[] = (dayRows || []).map(
        (r: Record<string, unknown>) => {
          const mapped = mapDbRowToCalendarEvent(r, tz);
          return {
            id: mapped.id,
            name: mapped.name,
            startTime: mapped.startTime,
            endTime: mapped.endTime,
            type: mapped.type,
            intensity: mapped.intensity,
          };
        },
      );

      // Track events we're adding this round (so they don't overlap each other)
      const addedThisDay: ScheduleEvent[] = [...existingEvents];

      for (const suggestion of daySuggestions) {
        // Determine duration
        let durationMin = 60; // default
        if (suggestion.startTime && suggestion.endTime) {
          durationMin =
            timeToMinutes(suggestion.endTime) -
            timeToMinutes(suggestion.startTime);
          if (durationMin <= 0) durationMin = 60;
        }

        // Preferred start time
        const preferredStart = suggestion.startTime
          ? timeToMinutes(suggestion.startTime)
          : 960; // default 4 PM

        const slot = autoPosition(
          durationMin,
          preferredStart,
          addedThisDay,
          config,
        );

        if (!slot) continue; // No room on this day

        const startTime = minutesToTime(slot.startMin);
        const endTime = minutesToTime(slot.endMin);

        proposedEvents.push({
          title: suggestion.name,
          event_type: suggestion.type,
          date: dateStr,
          startTime,
          endTime,
          intensity: suggestion.intensity,
          notes: "Auto-filled from your patterns",
        });

        // Add to tracking array so next suggestion avoids this slot
        addedThisDay.push({
          id: `proposed_${addedThisDay.length}`,
          name: suggestion.name,
          startTime,
          endTime,
          type: suggestion.type,
        });
      }
    }

    if (proposedEvents.length === 0) {
      return NextResponse.json(
        {
          success: true,
          eventsCreated: 0,
          events: [],
          preview: null,
          message: "All suggested slots were already filled",
        },
        { headers: { "api-version": "v1" } },
      );
    }

    // 3. Validate proposed events against rule engine
    const preview = await validateBatch(auth.user.id, proposedEvents, tz);

    return NextResponse.json(
      {
        success: true,
        dryRun: true,
        preview,
        message: preview.summary.withViolations > 0
          ? `${proposedEvents.length} events proposed — ${preview.summary.withViolations} need attention`
          : `${proposedEvents.length} events ready to add`,
      },
      { headers: { "api-version": "v1" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
