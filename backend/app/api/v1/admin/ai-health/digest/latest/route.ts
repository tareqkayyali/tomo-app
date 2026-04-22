import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health/digest/latest
//
// Direct-DB replacement of the old Python proxy. Returns the most recent
// ai_monthly_digest row, or {narrative: null} if none exist. Response shape
// matches the legacy contract exactly.

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_monthly_digest column set differs from generated types
  const { data, error } = await db
    .from("ai_monthly_digest")
    .select("id, month_start, narrative, top_issues, top_fixes, stats, created_at")
    .order("month_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load digest", detail: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ narrative: null });
  }
  return NextResponse.json(data);
}
