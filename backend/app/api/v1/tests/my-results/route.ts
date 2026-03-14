/**
 * My Test Results API
 *
 * GET  — Fetch user's test results (from phone_test_sessions)
 * POST — Log a new test result (any test from catalog or custom)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import type { Json } from "@/types/database";
import { calculatePercentile } from "@/services/benchmarkService";

// ── GET /api/v1/tests/my-results?limit=50&testType=cmj ────────────────

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const testType = searchParams.get("testType") || undefined;

  const db = supabaseAdmin();
  let query = db
    .from("phone_test_sessions")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (testType) {
    query = query.eq("test_type", testType);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = (data || []).map((row: Record<string, unknown>) => ({
    id: row.id,
    testType: row.test_type,
    score: row.score,
    rawData: row.raw_data,
    date: row.date,
    createdAt: row.created_at,
  }));

  return NextResponse.json(
    { results, count: results.length },
    { headers: { "api-version": "v1" } },
  );
}

// ── POST /api/v1/tests/my-results ─────────────────────────────────────

const testResultSchema = z.object({
  testType: z.string().min(1).max(200), // matches catalog id or custom
  score: z.number(),
  unit: z.string().max(20).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = testResultSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { testType, score, unit, date, notes } = parsed.data;

    const db = supabaseAdmin();
    const { data: row, error } = await db
      .from("phone_test_sessions")
      .insert({
        user_id: auth.user.id,
        date: date || new Date().toISOString().slice(0, 10),
        test_type: testType,
        score,
        raw_data: { unit, notes } as unknown as Json,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map catalog test types to benchmark metric keys
    const CATALOG_TO_METRIC: Record<string, string> = {
      "10m_sprint": "sprint_10m",
      "30m_sprint": "sprint_30m",
      countermovement_jump: "cmj",
      broad_jump: "broad_jump",
      yoyo_ir1: "yoyo_ir1",
      "505_agility": "agility_505",
      vo2max: "vo2max",
      reaction_time: "reaction_time",
      body_fat: "body_fat_pct",
      squat_relative: "squat_rel",
      max_speed: "max_speed",
    };

    const metricKey = CATALOG_TO_METRIC[testType];
    let benchmark = null;
    if (metricKey) {
      benchmark = await calculatePercentile(auth.user.id, metricKey, score, {
        source: "manual",
        testedAt: date,
      });
    }

    return NextResponse.json(
      {
        result: {
          id: (row as Record<string, unknown>).id,
          testType: (row as Record<string, unknown>).test_type,
          score: (row as Record<string, unknown>).score,
          date: (row as Record<string, unknown>).date,
        },
        benchmark,
      },
      { status: 201, headers: { "api-version": "v1" } },
    );
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
