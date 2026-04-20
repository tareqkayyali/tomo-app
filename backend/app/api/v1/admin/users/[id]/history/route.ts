/**
 * Admin-scoped view of an athlete's historical data (Profile > Historical Data).
 *
 * Read-only in v1 — admin edits require admin_override_log audit wiring
 * (migration 076) and are tracked as a v2 item in the plan.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json(
      { error: "id required", code: "ID_REQUIRED" },
      { status: 400 },
    );
  }

  // Cast to `any` — athlete_injury_history + new users columns come from
  // migration 077, not yet present in types/database.ts.
  const db = supabaseAdmin() as any;

  const [userRes, testsRes, injuriesRes] = await Promise.all([
    db
      .from("users")
      .select("id, name, training_started_at, training_history_note, date_of_birth, created_at")
      .eq("id", id)
      .single(),
    db
      .from("phone_test_sessions")
      .select("id, test_type, score, date, raw_data, created_at")
      .eq("user_id", id)
      .eq("source", "historical_self_reported")
      .order("date", { ascending: false })
      .limit(500),
    db
      .from("athlete_injury_history")
      .select("id, body_area, severity, year, weeks_out, resolved, note, created_at, updated_at")
      .eq("user_id", id)
      .order("year", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (userRes.error) {
    return NextResponse.json(
      { error: userRes.error.message, code: "USER_FETCH_FAILED" },
      { status: userRes.error.code === "PGRST116" ? 404 : 500 },
    );
  }

  const user = userRes.data as {
    id: string;
    name: string | null;
    training_started_at: string | null;
    training_history_note: string | null;
    date_of_birth: string | null;
    created_at: string;
  };

  const historicalTests = ((testsRes.data as any[] | null) ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    testType: row.test_type,
    score: row.score,
    date: row.date,
    unit: ((row.raw_data as Record<string, unknown> | null)?.unit as string | undefined) ?? null,
    notes: ((row.raw_data as Record<string, unknown> | null)?.notes as string | undefined) ?? null,
    createdAt: row.created_at,
  }));

  const injuries = ((injuriesRes.data as any[] | null) ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    bodyArea: row.body_area,
    severity: row.severity,
    year: row.year,
    weeksOut: row.weeks_out,
    resolved: row.resolved,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return NextResponse.json(
    {
      user: {
        id: user.id,
        name: user.name,
        dateOfBirth: user.date_of_birth,
        createdAt: user.created_at,
      },
      trainingStartedAt: user.training_started_at,
      trainingHistoryNote: user.training_history_note,
      historicalTests,
      injuries,
    },
    { headers: { "api-version": "v1" } },
  );
}
