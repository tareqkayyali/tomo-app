/**
 * POST /api/v1/training-program/blocks
 *
 * Create a new training block (mesocycle) for periodization.
 * Blocks represent structured phases: general_prep → specific_prep →
 * competition → transition.
 *
 * ACWR > 1.5 blocks creation at the Python tool level — this route
 * trusts the agent has already performed that gate check.
 *
 * Called by Training Program Agent via Python bridge.
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
    name,
    phase,
    start_date,
    duration_weeks,
    program_id,
    goals,
    load_targets,
  } = body;

  if (!name || !phase || !start_date || !duration_weeks) {
    return NextResponse.json(
      { error: "name, phase, start_date, and duration_weeks are required" },
      { status: 400 },
    );
  }

  const validPhases = [
    "general_prep",
    "specific_prep",
    "competition",
    "transition",
  ];

  if (!validPhases.includes(phase)) {
    return NextResponse.json(
      { error: `phase must be one of: ${validPhases.join(", ")}` },
      { status: 400 },
    );
  }

  if (duration_weeks < 1 || duration_weeks > 16) {
    return NextResponse.json(
      { error: "duration_weeks must be between 1 and 16" },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  // Close any currently active block for this user
  const { error: closeError } = await (db as any)
    .from("training_blocks")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("status", "active");

  if (closeError) {
    console.error("[training-blocks] Failed to close existing block:", closeError.message);
    // Non-fatal — continue creating the new block
  }

  // Calculate end date
  const startMs = new Date(start_date).getTime();
  const endDate = new Date(startMs + duration_weeks * 7 * 86400000)
    .toISOString()
    .split("T")[0];

  // Create the new training block
  const { data: block, error: insertError } = await (db as any)
    .from("training_blocks")
    .insert({
      user_id: userId,
      name,
      phase,
      start_date,
      end_date: endDate,
      duration_weeks,
      program_id: program_id || null,
      goals: goals || null,
      load_targets: load_targets || null,
      status: "active",
      week_number: 1,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to create training block", detail: insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    block: {
      id: block?.id,
      name,
      phase,
      start_date,
      end_date: endDate,
      duration_weeks,
      status: "active",
      week_number: 1,
    },
  });
}
