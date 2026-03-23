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
import { emitEventSafe } from "@/services/events/eventEmitter";

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

// Map catalog test IDs to benchmark metric keys
// NOTE: Catalog IDs use hyphens (e.g. "10m-sprint"), not underscores
const CATALOG_TO_METRIC: Record<string, string> = {
  "10m-sprint": "sprint_10m",
  "20m-sprint": "sprint_20m",
  "30m-sprint": "sprint_30m",
  "flying-10m": "est_max_speed",
  "flying-20m": "flying_20m",
  "max-speed": "est_max_speed",
  cmj: "cmj",
  "broad-jump": "broad_jump",
  "squat-jump": "cmj",
  "vertical-jump": "vertical_jump",
  "drop-jump": "cmj",
  "5-0-5": "agility_505",
  "t-test": "agility_505",
  "illinois-agility": "agility_505",
  "pro-agility": "agility_505",
  "arrowhead-agility": "agility_505",
  "yoyo-ir1": "vo2max",
  "beep-test": "vo2max",
  vo2max: "vo2max",
  "cooper-12min": "vo2max",
  "reaction-time": "reaction_time",
  "choice-reaction": "reaction_time",
  "1rm-squat": "squat_1rm",
  "squat-relative": "squat_rel",
  "grip-strength": "grip_strength",
  "body-fat": "body_fat_pct",
  hrv: "hrv_rmssd",
  "mas-running": "mas_running",
  "mas": "mas_running",
  "1rm-bench": "bench_1rm",
  "bench-press": "bench_1rm",
  "sl-broad-jump-r": "sl_broad_jump_r",
  "sl-broad-jump-l": "sl_broad_jump_l",
  "seated-mb-throw": "seated_mb_throw",
  "5-10-5-agility": "agility_505",
  "glycolytic-power": "glycolytic_power",
  "shot-power": "shot_speed",
  "10m_sprint": "sprint_10m",
  "30m_sprint": "sprint_30m",
  countermovement_jump: "cmj",
  broad_jump: "broad_jump",
  yoyo_ir1: "vo2max",
  "505_agility": "agility_505",
  reaction_time: "reaction_time",
  body_fat: "body_fat_pct",
  squat_relative: "squat_rel",
  max_speed: "est_max_speed",
};

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

    // ── Emit ASSESSMENT_RESULT event to Athlete Data Fabric (dual-write) ──
    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: 'ASSESSMENT_RESULT',
      occurredAt: new Date().toISOString(),
      source: 'MANUAL',
      payload: {
        test_type: testType,
        primary_value: score,
        primary_unit: unit || null,
        raw_inputs: { notes },
      },
      createdBy: auth.user.id,
    });

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
  } catch (err) {
    console.error("[POST /tests/my-results] Error:", err);
    const message = err instanceof Error ? err.message : "Invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// ── DELETE /api/v1/tests/my-results?metricKey=sprint_10m ──────────────

export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const metricKey = searchParams.get("metricKey");
  if (!metricKey) {
    return NextResponse.json({ error: "metricKey is required" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Find catalog test types that map to this metric key
  const catalogIds = Object.entries(CATALOG_TO_METRIC)
    .filter(([, mk]) => mk === metricKey)
    .map(([catId]) => catId);

  // Also include the metric key itself as a test_type (direct match)
  const allTestTypes = [...new Set([...catalogIds, metricKey])];

  // Delete from phone_test_sessions
  const { error: sessErr } = await db
    .from("phone_test_sessions")
    .delete()
    .eq("user_id", auth.user.id)
    .in("test_type", allTestTypes);

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  // Delete from player_benchmark_snapshots
  await db
    .from("player_benchmark_snapshots")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("metric_key", metricKey);

  return NextResponse.json(
    { deleted: true, metricKey },
    { headers: { "api-version": "v1" } },
  );
}
