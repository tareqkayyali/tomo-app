import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health/post-merge-watches
//   ?status=watching|clean|reverted|monitor_down
//   ?limit=50 (max 200)
// Default: status=watching (active queue).

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status = statusParam === null ? "watching" : statusParam;
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_post_merge_watch not in generated types until regen
  let query = db
    .from("ai_post_merge_watch")
    .select("*, ai_fixes(id, title, author, status, pr_url)", { count: "exact" })
    .order("merged_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Failed to load post-merge watches", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    watches: data ?? [],
    total: count ?? 0,
  });
}
