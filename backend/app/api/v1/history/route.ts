/**
 * Athlete Historical Data API
 *
 * GET /api/v1/history — single-call aggregator for Profile > Historical Data.
 * Returns training start, history note, historical test entries (pre-Tomo
 * self-reported), and the injury history list.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  // Casts to `any` here match the codebase pattern for tables/columns
  // added in a migration whose generated types haven't been regenerated
  // yet (see schedPrefsRes in contextBuilder, admin/dob-override, etc.).
  const db = supabaseAdmin() as any;

  const [userRes, testsRes, injuriesRes] = await Promise.all([
    db
      .from("users")
      .select("training_started_at, training_history_note")
      .eq("id", auth.user.id)
      .single(),
    db
      .from("phone_test_sessions")
      .select("id, test_type, score, date, raw_data, created_at")
      .eq("user_id", auth.user.id)
      .eq("source", "historical_self_reported")
      .order("date", { ascending: false })
      .limit(200),
    db
      .from("athlete_injury_history")
      .select("id, body_area, severity, year, weeks_out, resolved, note, created_at, updated_at")
      .eq("user_id", auth.user.id)
      .order("year", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (userRes.error && userRes.error.code !== "PGRST116") {
    return NextResponse.json({ error: userRes.error.message }, { status: 500 });
  }

  const user = (userRes.data as { training_started_at: string | null; training_history_note: string | null } | null) ?? null;

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
      trainingStartedAt: user?.training_started_at ?? null,
      trainingHistoryNote: user?.training_history_note ?? null,
      historicalTests,
      injuries,
    },
    { headers: { "api-version": "v1" } },
  );
}
