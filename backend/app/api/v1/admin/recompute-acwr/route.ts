/**
 * POST /api/v1/admin/recompute-acwr
 *
 * Recomputes ACWR for all athletes (or a specific one).
 * Use after backfilling athlete_daily_load via SQL.
 *
 * Body: { athlete_id?: string } — if omitted, recomputes ALL athletes.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recomputeACWR } from "@/services/events/computations/acwrComputation";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const db = supabaseAdmin();

    if (body.athlete_id) {
      // Single athlete
      const result = await recomputeACWR(body.athlete_id);
      return NextResponse.json({ ok: true, athlete_id: body.athlete_id, acwr: result });
    }

    // All athletes with daily load data
    const { data: athletes } = await (db as any)
      .from("athlete_daily_load")
      .select("athlete_id")
      .gte("load_date", new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10));

    if (!athletes || athletes.length === 0) {
      return NextResponse.json({ ok: true, message: "No athletes with load data", count: 0 });
    }

    // Deduplicate athlete IDs
    const uniqueIds = [...new Set(athletes.map((a: any) => a.athlete_id))];

    const results: { id: string; acwr: number }[] = [];
    for (const id of uniqueIds) {
      const result = await recomputeACWR(id as string);
      results.push({ id: id as string, acwr: result.acwr });
    }

    return NextResponse.json({
      ok: true,
      count: results.length,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to recompute ACWR", detail: String(err) },
      { status: 500 }
    );
  }
}
