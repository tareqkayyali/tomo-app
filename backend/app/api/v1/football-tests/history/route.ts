import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Map snake_case DB row to camelCase for the mobile client. */
function mapResult(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    createdAt: row.created_at,
    testType: row.test_type,
    primaryValue: row.primary_value,
    primaryUnit: row.primary_unit ?? "",
    primaryLabel: row.primary_label ?? "",
    derivedMetrics: row.derived_metrics ?? [],
    percentile: row.percentile ?? null,
    percentileLabel: row.percentile_label ?? "",
    ageMean: row.age_mean ?? null,
    ageMeanUnit: row.age_mean_unit ?? "",
    isNewPB: row.is_new_pb ?? false,
    previousBest: row.previous_best ?? null,
    rawInputs: row.raw_inputs ?? {},
  };
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = req.nextUrl;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
    const testType = searchParams.get("testType");

    const db = supabaseAdmin();
    let query = db
      .from("football_test_results")
      .select("*")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (testType) {
      query = query.eq("test_type", testType);
    }

    const { data: results, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mapped = (results || []).map((r) => mapResult(r as Record<string, unknown>));

    return NextResponse.json(
      { results: mapped, count: mapped.length },
      { headers: { "api-version": "v1" } }
    );
  } catch (err) {
    console.error('[GET /api/v1/football-tests/history] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
