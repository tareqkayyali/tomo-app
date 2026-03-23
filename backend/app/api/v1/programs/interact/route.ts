import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/v1/programs/interact
 *
 * Mark a program as done, dismissed, or active. Done/dismissed programs
 * are excluded from future AI recommendations. Active is a toggle —
 * sending 'active' again removes the interaction row.
 *
 * Body: { programId: string, action: "done" | "dismissed" | "active" }
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { programId, action } = body;

  if (!programId || typeof programId !== "string") {
    return NextResponse.json({ error: "programId is required" }, { status: 400 });
  }
  if (action !== "done" && action !== "dismissed" && action !== "active" && action !== "player_selected") {
    return NextResponse.json(
      { error: 'action must be "done", "dismissed", "active", or "player_selected"' },
      { status: 400 }
    );
  }

  const db = supabaseAdmin() as any;

  // For 'active' or 'player_selected' action, check if already set — toggle off by deleting
  if (action === "active" || action === "player_selected") {
    const { data: existing } = await db
      .from("program_interactions")
      .select("action")
      .eq("user_id", auth.user.id)
      .eq("program_id", programId)
      .maybeSingle();

    if (existing?.action === action) {
      // Toggle off — delete the interaction row
      const { error: deleteError } = await db
        .from("program_interactions")
        .delete()
        .eq("user_id", auth.user.id)
        .eq("program_id", programId);

      if (deleteError) {
        console.error("[programs/interact] Delete error:", deleteError.message);
        return NextResponse.json(
          { error: "Failed to toggle active off" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, programId, action, toggled: "off" });
    }
  }

  // Upsert interaction (update action if already exists)
  const { error: upsertError } = await db
    .from("program_interactions")
    .upsert(
      {
        user_id: auth.user.id,
        program_id: programId,
        action,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,program_id" }
    );

  if (upsertError) {
    console.error("[programs/interact] Upsert error:", upsertError.message);
    return NextResponse.json(
      { error: "Failed to save interaction" },
      { status: 500 }
    );
  }

  // Clear the AI program cache only for done/dismissed (not active/player_selected)
  if (action !== "active" && action !== "player_selected") {
    const { error: clearError } = await (supabaseAdmin() as any)
      .from("athlete_snapshots")
      .update({ program_recommendations: null })
      .eq("athlete_id", auth.user.id);

    if (clearError) {
      console.warn("[programs/interact] Cache clear failed:", clearError.message);
      // Non-fatal — programs will still be filtered on next read
    }
  }

  // Emit event to athlete data fabric (non-fatal)
  try {
    const { emitEventSafe } = await import("@/services/events/eventEmitter");
    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: "SESSION_LOG",
      occurredAt: new Date().toISOString(),
      source: "MANUAL",
      payload: {
        interaction_type: "PROGRAM_INTERACTION",
        program_id: programId,
        action,
        training_load_au: 0,
      },
      createdBy: auth.user.id,
    });
  } catch (e: any) {
    console.warn("[programs/interact] Event emit failed (non-fatal):", e?.message);
  }

  return NextResponse.json({
    success: true,
    programId,
    action,
    ...(action === "active" ? { toggled: "on" } : {}),
  });
}
