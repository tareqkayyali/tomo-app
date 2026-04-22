import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health/issues/{id}
// Returns issue + all fixes linked to it (both active and rejected, ordered newest first).

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // extended ai_issues/ai_fixes columns not in generated types until regen

  const [{ data: issue, error: issueError }, { data: fixes, error: fixesError }] =
    await Promise.all([
      db.from("ai_issues").select("*").eq("id", id).maybeSingle(),
      db
        .from("ai_fixes")
        .select("*")
        .eq("issue_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (issueError) {
    return NextResponse.json(
      { error: "Failed to load issue", detail: issueError.message },
      { status: 500 },
    );
  }
  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }
  if (fixesError) {
    return NextResponse.json(
      { error: "Failed to load linked fixes", detail: fixesError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ issue, fixes: fixes ?? [] });
}
