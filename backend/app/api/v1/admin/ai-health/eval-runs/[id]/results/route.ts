import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health/eval-runs/{id}/results
//   ?status=pass|fail|error|skip
//   ?suite=routing_live|safety_live|behavior_live|...
//   ?limit=100 (max 500)
//   ?offset=0

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { id: runId } = await params;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const suite = url.searchParams.get("suite");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "100", 10) || 100,
    500,
  );
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_eval_* not in generated types until regen

  const runPromise = db
    .from("ai_eval_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();

  let resultsQuery = db
    .from("ai_eval_results")
    .select("*", { count: "exact" })
    .eq("run_id", runId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (status) resultsQuery = resultsQuery.eq("status", status);
  if (suite) resultsQuery = resultsQuery.eq("suite", suite);

  const [{ data: run, error: runError }, { data: results, count, error }] =
    await Promise.all([runPromise, resultsQuery]);

  if (runError) {
    return NextResponse.json(
      { error: "Failed to load run", detail: runError.message },
      { status: 500 },
    );
  }
  if (!run) {
    return NextResponse.json({ error: "Eval run not found" }, { status: 404 });
  }
  if (error) {
    return NextResponse.json(
      { error: "Failed to load results", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    run,
    results: results ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
