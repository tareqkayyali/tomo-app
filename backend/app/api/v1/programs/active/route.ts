import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/programs/active[?targetPlayerId=<uuid>]
 *
 * Returns the athlete's active and player-added programs. Each entry carries
 * the full `program` snapshot captured at activation time plus `source` and
 * `activatedAt` so the Signal Dashboard Programs tab can render them without
 * re-joining recommendations.
 *
 * When `targetPlayerId` is passed, the caller must be a linked guardian
 * (coach/parent) of that player — we return the player's active list so the
 * coach sees the same "Active" set the athlete sees.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const targetPlayerId = url.searchParams.get("targetPlayerId");

  let resolvedUserId = auth.user.id;
  if (targetPlayerId && targetPlayerId !== auth.user.id) {
    const rel = await requireRelationship(auth.user.id, targetPlayerId);
    if ("error" in rel) return rel.error;
    resolvedUserId = targetPlayerId;
  }

  try {
    const db = supabaseAdmin() as any;
    const { data, error } = await db
      .from("program_interactions")
      .select("program_id, action, program_snapshot, source, created_at")
      .eq("user_id", resolvedUserId)
      .in("action", ["active", "player_selected"]);

    if (error) {
      console.error("[programs/active] Query error:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch active programs" },
        { status: 500 }
      );
    }

    const rows = data || [];

    const shape = (r: any) => ({
      programId: r.program_id,
      program: r.program_snapshot || null,
      source: r.source || null,
      activatedAt: r.created_at,
    });

    const active = rows
      .filter((r: any) => r.action === "active")
      .map(shape);
    const playerAdded = rows
      .filter((r: any) => r.action === "player_selected")
      .map(shape);

    return NextResponse.json({
      active,
      playerAdded,
      programIds: active.map((r: any) => r.programId),
      playerSelectedIds: playerAdded.map((r: any) => r.programId),
    });
  } catch (err) {
    console.error('[GET /api/v1/programs/active] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
