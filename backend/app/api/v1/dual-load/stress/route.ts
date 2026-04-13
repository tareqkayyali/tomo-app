/**
 * POST /api/v1/dual-load/stress
 *
 * Set the athlete's current academic stress level (1-10 scale).
 * Stress >= 7 triggers exam-priority framing in the AI agent.
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
  const { stress_level, notes } = body;

  if (
    typeof stress_level !== "number" ||
    stress_level < 1 ||
    stress_level > 10
  ) {
    return NextResponse.json(
      { error: "stress_level must be a number between 1 and 10" },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  // Update the athlete's snapshot with academic stress
  const { error: snapError } = await (db as any)
    .from("athlete_snapshot")
    .update({
      academic_stress_level: stress_level,
      academic_stress_notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (snapError) {
    return NextResponse.json(
      { error: "Failed to update stress level", detail: snapError.message },
      { status: 500 },
    );
  }

  // If stress >= 7, also activate exam period flag
  if (stress_level >= 7) {
    await (db as any)
      .from("player_schedule_preferences")
      .upsert(
        {
          user_id: userId,
          exam_period_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
  }

  return NextResponse.json({
    success: true,
    stress: {
      level: stress_level,
      notes: notes || null,
      exam_priority_activated: stress_level >= 7,
    },
  });
}
