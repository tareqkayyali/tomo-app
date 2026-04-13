/**
 * POST /api/v1/dual-load/academic-priority
 *
 * Set an academic priority period — reduces training load during exams.
 * Marks date range as exam-priority, triggers intensity reduction on
 * overlapping training events.
 *
 * Called by Dual-Load Agent via Python bridge.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-tomo-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Missing user ID" }, { status: 401 });
  }

  const body = await req.json();
  const { start_date, end_date, reason, intensity_modifier = 0.75 } = body;

  if (!start_date || !end_date) {
    return NextResponse.json(
      { error: "start_date and end_date required" },
      { status: 400 },
    );
  }

  if (new Date(end_date) <= new Date(start_date)) {
    return NextResponse.json(
      { error: "end_date must be after start_date" },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  // Upsert academic priority period into player_schedule_preferences
  const { error: prefError } = await (db as any)
    .from("player_schedule_preferences")
    .upsert(
      {
        user_id: userId,
        exam_period_active: true,
        exam_start_date: start_date,
        exam_end_date: end_date,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (prefError) {
    return NextResponse.json(
      { error: "Failed to set academic priority", detail: prefError.message },
      { status: 500 },
    );
  }

  // Cap intensity on training events in the exam window
  const intensityCap = intensity_modifier <= 0.75 ? "LIGHT" : "MODERATE";
  const { data: updated, error: updateError } = await db
    .from("calendar_events")
    .update({ intensity: intensityCap })
    .eq("user_id", userId)
    .in("event_type", ["training", "gym", "club_training"])
    .gte("start_at", `${start_date}T00:00:00`)
    .lte("start_at", `${end_date}T23:59:59`)
    .in("intensity", ["HARD", "MODERATE"])
    .select("id, title, intensity");

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to adjust events", detail: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    academic_priority: {
      start_date,
      end_date,
      reason: reason || "exam_period",
      intensity_modifier,
      intensity_cap: intensityCap,
      events_modified: updated?.length ?? 0,
    },
  });
}
