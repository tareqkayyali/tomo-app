/**
 * POST /api/v1/recovery/deload
 *
 * Trigger a deload week — caps intensity on existing training events
 * and optionally creates recovery sessions for the deload period.
 *
 * Called by Recovery Agent via Python bridge.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-tomo-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Missing user ID" }, { status: 401 });
  }

  const body = await req.json();
  const {
    start_date,
    duration_days = 5,
    intensity_cap = "LIGHT",
  } = body;

  if (!start_date) {
    return NextResponse.json({ error: "start_date required" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Calculate end date
  const startMs = new Date(start_date).getTime();
  const endDate = new Date(startMs + duration_days * 86400000)
    .toISOString()
    .split("T")[0];

  // Cap intensity on existing training events in the deload window
  const { data: updated, error: updateError } = await db
    .from("calendar_events")
    .update({ intensity: intensity_cap })
    .eq("user_id", userId)
    .in("event_type", ["training", "gym", "club_training"])
    .gte("start_at", `${start_date}T00:00:00`)
    .lte("start_at", `${endDate}T23:59:59`)
    .in("intensity", ["HARD", "MODERATE"])
    .select("id, title, intensity");

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update events", detail: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    deload: {
      start_date,
      end_date: endDate,
      duration_days,
      intensity_cap,
      events_modified: updated?.length ?? 0,
    },
  });
}
