import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health/eval-runs
//   ?trigger=nightly|pr|pre_deploy|manual|auto_heal_reeval
//   ?status=running|passed|failed|errored|aborted
//   ?limit=50 (max 200)
//   ?offset=0
// Returns eval run headers. Phase 0: reads only; Phase 1+ writes via Python.

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const trigger = url.searchParams.get("trigger");
  const status = url.searchParams.get("status");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200,
  );
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_eval_runs not in generated types until regen
  let query = db
    .from("ai_eval_runs")
    .select("*", { count: "exact" })
    .order("started_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (trigger) query = query.eq("trigger", trigger);
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Failed to list eval runs", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    runs: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
