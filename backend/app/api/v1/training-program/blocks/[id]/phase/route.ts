/**
 * PUT /api/v1/training-program/blocks/:id/phase
 *
 * Transition a training block to its next phase.
 * Valid transitions: general_prep → specific_prep → competition → transition.
 *
 * Called by Training Program Agent via Python bridge.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const PHASE_ORDER = [
  "general_prep",
  "specific_prep",
  "competition",
  "transition",
] as const;

type Phase = (typeof PHASE_ORDER)[number];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = req.headers.get("x-tomo-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Missing user ID" }, { status: 401 });
  }

  const { id: blockId } = await params;
  const body = await req.json();
  const { new_phase } = body;

  if (!new_phase || !PHASE_ORDER.includes(new_phase as Phase)) {
    return NextResponse.json(
      { error: `new_phase must be one of: ${PHASE_ORDER.join(", ")}` },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  // Fetch current block
  const { data: block, error: fetchError } = await (db as any)
    .from("training_blocks")
    .select("*")
    .eq("id", blockId)
    .eq("user_id", userId)
    .single();

  if (fetchError || !block) {
    return NextResponse.json(
      { error: "Training block not found" },
      { status: 404 },
    );
  }

  if (block.status !== "active") {
    return NextResponse.json(
      { error: "Can only transition active blocks" },
      { status: 400 },
    );
  }

  // Validate phase ordering — must advance forward
  const currentIdx = PHASE_ORDER.indexOf(block.phase as Phase);
  const newIdx = PHASE_ORDER.indexOf(new_phase as Phase);

  if (newIdx <= currentIdx) {
    return NextResponse.json(
      {
        error: `Cannot transition from ${block.phase} to ${new_phase}. Must advance forward.`,
      },
      { status: 400 },
    );
  }

  // Update the block phase
  const { data: updated, error: updateError } = await (db as any)
    .from("training_blocks")
    .update({
      phase: new_phase,
      phase_transitioned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", blockId)
    .eq("user_id", userId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update phase", detail: updateError.message },
      { status: 500 },
    );
  }

  // If transitioning to "transition" phase, mark block as winding down
  const isWindingDown = new_phase === "transition";

  return NextResponse.json({
    success: true,
    block: {
      id: blockId,
      name: updated?.name || block.name,
      previous_phase: block.phase,
      current_phase: new_phase,
      is_winding_down: isWindingDown,
      transitioned_at: new Date().toISOString(),
    },
  });
}
