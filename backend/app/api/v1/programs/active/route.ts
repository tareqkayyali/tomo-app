import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/programs/active
 *
 * Returns program IDs the user has marked as "active" and "player_selected".
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const db = supabaseAdmin() as any;
    const { data, error } = await db
      .from("program_interactions")
      .select("program_id, action")
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
    return NextResponse.json({
      programIds: rows.filter((r: any) => r.action === "active").map((r: any) => r.program_id),
      playerSelectedIds: rows.filter((r: any) => r.action === "player_selected").map((r: any) => r.program_id),
    });
  } catch (err) {
    console.error('[GET /api/v1/programs/active] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
