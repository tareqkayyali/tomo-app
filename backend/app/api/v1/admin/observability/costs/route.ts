import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/admin/observability/costs
 *   Returns aggregated Claude API usage from the daily_api_costs view
 *   (aggregation of api_usage_log).
 *   Query params:
 *     days     — lookback window (default 14, max 90)
 *     group_by — "day" | "agent" | "model" (default "day")
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const sp = req.nextUrl.searchParams;
  const days = Math.min(Math.max(Number(sp.get("days") ?? "14") || 14, 1), 90);
  const groupBy =
    (sp.get("group_by") as "day" | "agent" | "model" | null) ?? "day";

  const since = new Date(Date.now() - days * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any;
  try {
    const { data, error } = await db
      .from("daily_api_costs")
      .select(
        "day, agent_type, model, call_count, total_cost, avg_latency, total_input, total_output"
      )
      .gte("day", since)
      .order("day", { ascending: false });

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{
      day: string | null;
      agent_type: string | null;
      model: string | null;
      call_count: number | null;
      total_cost: number | null;
      avg_latency: number | null;
      total_input: number | null;
      total_output: number | null;
    }>;

    const totals = {
      total_cost: rows.reduce((s, r) => s + Number(r.total_cost ?? 0), 0),
      total_calls: rows.reduce((s, r) => s + (r.call_count ?? 0), 0),
      total_input: rows.reduce((s, r) => s + (r.total_input ?? 0), 0),
      total_output: rows.reduce((s, r) => s + (r.total_output ?? 0), 0),
    };

    // Roll up for the requested dimension. "day" returns rows as-is
    // (already aggregated in the view). "agent" / "model" re-aggregate.
    const grouped = groupBy === "day" ? rows : aggregate(rows, groupBy);

    return NextResponse.json({ since, days, groupBy, totals, rows: grouped });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function aggregate(
  rows: Array<{
    day: string | null;
    agent_type: string | null;
    model: string | null;
    call_count: number | null;
    total_cost: number | null;
    avg_latency: number | null;
    total_input: number | null;
    total_output: number | null;
  }>,
  dim: "agent" | "model"
) {
  const key = dim === "agent" ? "agent_type" : "model";
  const acc = new Map<
    string,
    {
      bucket: string;
      call_count: number;
      total_cost: number;
      total_input: number;
      total_output: number;
      avg_latency_weighted: number;
    }
  >();

  for (const r of rows) {
    const bucket = (r[key] ?? "unknown") as string;
    const prev =
      acc.get(bucket) ?? {
        bucket,
        call_count: 0,
        total_cost: 0,
        total_input: 0,
        total_output: 0,
        avg_latency_weighted: 0,
      };
    prev.call_count += r.call_count ?? 0;
    prev.total_cost += Number(r.total_cost ?? 0);
    prev.total_input += r.total_input ?? 0;
    prev.total_output += r.total_output ?? 0;
    prev.avg_latency_weighted +=
      (r.avg_latency ?? 0) * (r.call_count ?? 0);
    acc.set(bucket, prev);
  }

  return Array.from(acc.values())
    .map((v) => ({
      bucket: v.bucket,
      call_count: v.call_count,
      total_cost: v.total_cost,
      total_input: v.total_input,
      total_output: v.total_output,
      avg_latency:
        v.call_count > 0 ? v.avg_latency_weighted / v.call_count : 0,
    }))
    .sort((a, b) => b.total_cost - a.total_cost);
}
