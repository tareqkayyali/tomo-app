import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/programs/active
 *
 * Returns the athlete's active and player-added programs. Each entry carries
 * the full `program` snapshot captured at activation time plus `source` and
 * `activatedAt` so the Signal Dashboard Programs tab can render them without
 * re-joining recommendations.
 *
 * Response:
 * {
 *   active:      Array<{ programId, program, source, activatedAt }>,
 *   playerAdded: Array<{ programId, program, source, activatedAt }>,
 *   // legacy — kept for backwards compat with older mobile builds:
 *   programIds: string[],
 *   playerSelectedIds: string[]
 * }
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const db = supabaseAdmin() as any;
    const { data, error } = await db
      .from("program_interactions")
      .select("program_id, action, program_snapshot, source, created_at")
      .eq("user_id", auth.user.id)
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
