/**
 * POST /api/v1/schedule/validate — Validate proposed events against rule engine
 *
 * Accepts an array of proposed events and validates them against:
 * - Player schedule preferences (day bounds, buffers, intensity caps)
 * - Existing calendar events (overlaps, gap violations)
 * - Scenario modifiers (exam period, league active)
 *
 * Returns a SchedulePreviewResponse with violations and alternative time slots.
 * Does NOT insert anything — purely read-only dry run.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { validateBatch } from "@/services/scheduling/scheduleValidationService";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { events, timezone = "Asia/Riyadh" } = body;

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: "events array is required and must not be empty" },
        { status: 400 },
      );
    }

    // Validate all events have required fields
    for (const evt of events) {
      if (!evt.title || !evt.event_type || !evt.date || !evt.startTime || !evt.endTime) {
        return NextResponse.json(
          { error: "Each event must have title, event_type, date, startTime, endTime" },
          { status: 400 },
        );
      }
    }

    const preview = await validateBatch(auth.user.id, events, timezone);

    return NextResponse.json(preview);
  } catch (err: any) {
    console.error("[schedule/validate] Error:", err);
    return NextResponse.json(
      { error: err.message || "Validation failed" },
      { status: 500 },
    );
  }
}
