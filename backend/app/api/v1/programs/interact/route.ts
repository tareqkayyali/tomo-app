import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/v1/programs/interact
 *
 * Mark a program as done, dismissed, active, or player_selected. Done/dismissed
 * programs are excluded from future AI recommendations. Active + player_selected
 * are toggles — sending the same action again removes the row.
 *
 * For active / player_selected, callers SHOULD include `programSnapshot` (full
 * program object) and `source` ('coach' | 'ai_recommended' | 'player_added').
 * This lets the Programs tab survive AI re-generation: active programs render
 * from the snapshot, not from the live recommendations list.
 *
 * Body: {
 *   programId: string,
 *   action: "done" | "dismissed" | "active" | "player_selected",
 *   programSnapshot?: object,
 *   source?: "coach" | "ai_recommended" | "player_added"
 * }
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

  const { programId, action, programSnapshot, source } = body;

  if (!programId || typeof programId !== "string") {
    return NextResponse.json({ error: "programId is required" }, { status: 400 });
  }
  if (action !== "done" && action !== "dismissed" && action !== "active" && action !== "player_selected") {
    return NextResponse.json(
      { error: 'action must be "done", "dismissed", "active", or "player_selected"' },
      { status: 400 }
    );
  }
  if (source !== undefined && source !== "coach" && source !== "ai_recommended" && source !== "player_added") {
    return NextResponse.json(
      { error: 'source must be "coach", "ai_recommended", or "player_added"' },
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

  // Upsert interaction. Persist snapshot + source for active/player_selected so
  // the Programs tab can render them after AI regenerates recommendations.
  const row: Record<string, unknown> = {
    user_id: auth.user.id,
    program_id: programId,
    action,
    created_at: new Date().toISOString(),
  };
  if (programSnapshot && typeof programSnapshot === "object") {
    row.program_snapshot = programSnapshot;
  }
  if (source) {
    row.source = source;
  }

  const { error: upsertError } = await db
    .from("program_interactions")
    .upsert(row, { onConflict: "user_id,program_id" });

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
  // Uses MILESTONE_HIT as closest match — doesn't affect ACWR/load
  try {
    const { emitEventSafe } = await import("@/services/events/eventEmitter");
    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: "MILESTONE_HIT",
      occurredAt: new Date().toISOString(),
      source: "MANUAL",
      payload: {
        milestone_type: "PROGRAM_INTERACTION",
        program_id: programId,
        action,
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
    ...(action === "active" || action === "player_selected" ? { toggled: "on" } : {}),
  });
}
