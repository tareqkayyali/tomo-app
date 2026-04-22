import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health/config
// Returns the single ai_auto_heal_config row. Read-only for analyst+
// institutional_pd; super_admin-only write via PATCH comes in Phase 5
// (kill-switch toggle).

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_auto_heal_config not in generated types until regen
  const { data, error } = await db
    .from("ai_auto_heal_config")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load config", detail: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "ai_auto_heal_config not seeded — run migration 092" },
      { status: 500 },
    );
  }

  return NextResponse.json({ config: data });
}
