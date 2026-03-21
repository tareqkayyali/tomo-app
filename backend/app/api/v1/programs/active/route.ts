import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/programs/active
 *
 * Returns the list of program IDs the user has marked as "active".
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin() as any;
  const { data, error } = await db
    .from("program_interactions")
    .select("program_id")
    .eq("user_id", auth.user.id)
    .eq("action", "active");

  if (error) {
    console.error("[programs/active] Query error:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch active programs" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    programIds: (data || []).map((r: any) => r.program_id),
  });
}
