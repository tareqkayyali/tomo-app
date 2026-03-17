/**
 * POST /api/v1/calendar/ghost-suggestions/confirm — Confirm a ghost suggestion
 *
 * Validates the proposed event against the rule engine before inserting.
 * Supports dryRun mode for preview before confirmation.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateBatch } from "@/services/scheduling/scheduleValidationService";
import { estimateTotalLoad } from "@/services/events/computations/loadEstimator";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const {
      name,
      date,
      eventType,
      startTime,
      endTime,
      notes,
      intensity,
      timezone,
      dryRun: dryRunParam,
    } = body;

    if (!name || !date) {
      return NextResponse.json(
        { error: "name and date are required" },
        { status: 400 }
      );
    }

    const tz = timezone || "UTC";
    const dryRun = dryRunParam === true; // default false for single-event confirm (backwards compat)

    // ── DRY RUN: validate before inserting ────────────────────
    if (dryRun && startTime && endTime) {
      const preview = await validateBatch(
        auth.user.id,
        [{
          title: name,
          event_type: eventType || "training",
          date,
          startTime,
          endTime,
          intensity: intensity || undefined,
          notes: notes || "Created from ghost suggestion",
        }],
        tz
      );

      return NextResponse.json(
        {
          dryRun: true,
          preview,
          message: preview.summary.withViolations > 0
            ? "Event has scheduling conflicts — review before confirming"
            : "Event looks good — ready to confirm",
        },
        { headers: { "api-version": "v1" } }
      );
    }

    // ── INSERT (default or after user confirms preview) ─────────
    const startAt = startTime ? `${date}T${startTime}:00` : `${date}T00:00:00`;
    const endAt = endTime ? `${date}T${endTime}:00` : null;

    const evtDurationMin = endAt
      ? (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000
      : 60;
    const evtEstimatedLoad = estimateTotalLoad({
      event_type: eventType || "training",
      intensity: intensity ?? null,
      duration_min: evtDurationMin,
    });

    const db = supabaseAdmin();
    const { data: event, error } = await (db as any)
      .from("calendar_events")
      .insert({
        user_id: auth.user.id,
        title: name,
        event_type: eventType || "training",
        start_at: startAt,
        end_at: endAt,
        intensity: intensity || null,
        notes: notes || "Created from ghost suggestion",
        estimated_load_au: evtEstimatedLoad,
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
