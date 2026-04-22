import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health/audit
//   ?actor=admin:<email>|pg_cron|service:<name>
//   ?action=<any>
//   ?target_table=ai_fixes|ai_issues|ai_auto_heal_config|...
//   ?limit=100 (max 500)
//   ?offset=0
// Append-only audit log. Ordered newest first.

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const actor = url.searchParams.get("actor");
  const action = url.searchParams.get("action");
  const targetTable = url.searchParams.get("target_table");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "100", 10) || 100,
    500,
  );
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_* tables not in generated types until regen
  let query = db
    .from("ai_auto_heal_audit")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (actor) query = query.eq("actor", actor);
  if (action) query = query.eq("action", action);
  if (targetTable) query = query.eq("target_table", targetTable);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Failed to load audit log", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    audit: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
