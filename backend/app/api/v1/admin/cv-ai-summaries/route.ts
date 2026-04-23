import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/admin/cv-ai-summaries
 *
 * Read-only ops view of every athlete's current AI summary. Used by the
 * CMS AI-summary review page — admins can spot abandoned drafts or
 * stale summaries ("needs_update") and nudge athletes.
 *
 * Query: ?status=draft|approved|needs_update (optional filter)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const statusFilter = req.nextUrl.searchParams.get("status");
  const db = supabaseAdmin();

  try {
    let q = (db as any)
      .from("cv_profiles")
      .select("athlete_id, ai_summary, ai_summary_status, ai_summary_last_generated, ai_summary_approved_at, is_published, athlete:athlete_id(name, email, sport)")
      .not("ai_summary", "is", null)
      .order("ai_summary_last_generated", { ascending: false })
      .limit(200);

    if (statusFilter && ["draft", "approved", "needs_update"].includes(statusFilter)) {
      q = q.eq("ai_summary_status", statusFilter);
    }

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ summaries: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list summaries", detail: String(err) },
      { status: 500 }
    );
  }
}
