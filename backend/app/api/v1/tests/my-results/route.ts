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
  let phoneQuery = db
    .from("phone_test_sessions")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  let footballQuery = db
    .from("football_test_results")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (testType) {
    phoneQuery = phoneQuery.eq("test_type", testType);
    footballQuery = footballQuery.eq("test_type", testType);
  }

  const [phoneRes, footballRes] = await Promise.all([phoneQuery, footballQuery]);

  if (phoneRes.error) {
    return NextResponse.json({ error: phoneRes.error.message }, { status: 500 });
  }

  const phoneResults = (phoneRes.data || []).map((row: Record<string, unknown>) => ({
    id: row.id,
    testType: row.test_type,
    score: row.score,
    rawData: row.raw_data,
    date: row.date,
    createdAt: row.created_at,
  }));
  const footballResults = (footballRes.data || []).map((row: Record<string, unknown>) => ({
    id: row.id,
    testType: row.test_type,
    score: row.primary_value,
    rawData: row.raw_inputs,
    date: row.date,
    createdAt: row.created_at,
  }));

  // Merge, deduplicate by testType+date, sort by date desc
  const mergedMap = new Map<string, any>();
  for (const r of [...phoneResults, ...footballResults]) {
    const key = `${r.testType}_${r.date}`;
    if (!mergedMap.has(key)) mergedMap.set(key, r);
  }
  const results = [...mergedMap.values()]
    .sort((a: any, b: any) => (b.date > a.date ? 1 : -1))
    .slice(0, limit);

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
  "t-test": "agility_ttest",
  "illinois-agility": "illinois_agility",
  "pro-agility": "agility_5105",
  "arrowhead-agility": "arrowhead_agility",
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
  "5-10-5-agility": "agility_5105",
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
  // Historical Data: pre-Tomo self-reported tests (Profile > Historical Data).
  // Flagged on the snapshot row + emitted as source=HISTORICAL so handlers
  // skip current-profile, ACWR, and load aggregation updates.
  source: z.enum(['manual', 'historical_self_reported']).default('manual'),
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

    const { testType, score, unit, date, notes, source } = parsed.data;
    const isHistorical = source === 'historical_self_reported';

    // Historical tests must carry a past date.
    if (isHistorical) {
      if (!date) {
        return NextResponse.json(
          { error: "Historical tests require a date (YYYY-MM-DD)" },
          { status: 400 },
        );
      }
      const todayStr = new Date().toISOString().slice(0, 10);
      if (date >= todayStr) {
        return NextResponse.json(
          { error: "Historical test date must be in the past" },
          { status: 400 },
        );
      }
    }

    const db = supabaseAdmin();
    const { data: row, error } = await db
      .from("phone_test_sessions")
      .insert({
        user_id: auth.user.id,
        date: date || new Date().toISOString().slice(0, 10),
        test_type: testType,
        score,
        raw_data: { unit, notes } as unknown as Json,
        source,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Emit ASSESSMENT_RESULT event — HISTORICAL source so handlers skip
    //    current-profile, ACWR, load, and PHV updates (see assessmentHandler).
    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: 'ASSESSMENT_RESULT',
      occurredAt: isHistorical
        ? new Date(`${date}T12:00:00Z`).toISOString()
        : new Date().toISOString(),
      source: isHistorical ? 'HISTORICAL' : 'MANUAL',
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
        source: isHistorical ? "historical_self_reported" : "manual",
        testedAt: date,
      });
    }

    // Supersede stale CV_OPPORTUNITY recs (e.g., "Missing Key Test" for a test just logged)
    try {
      const { supersedeExisting } = await import("@/services/recommendations/supersedeExisting");
      await supersedeExisting(auth.user.id, "CV_OPPORTUNITY");
      // Re-compute CV opportunity with fresh data
      const { computeCvOpportunityRec } = await import("@/services/recommendations/computers/cvOpportunityComputer");
      await computeCvOpportunityRec(auth.user.id, {
        event_id: '',
        athlete_id: auth.user.id,
        event_type: 'ASSESSMENT_RESULT',
        occurred_at: new Date().toISOString(),
        source: 'MANUAL',
        payload: { test_type: testType },
        created_at: new Date().toISOString(),
        created_by: auth.user.id,
      } as any);
    } catch (e) {
      console.warn('[tests/my-results] CV rec refresh failed (non-fatal):', e);
    }

    // Fire-and-forget: refresh deep recs + programs so Own It reflects new test data
    try {
      const { triggerDeepRefreshAsync } = await import("@/services/recommendations/deepRecRefresh");
      const { triggerDeepProgramRefreshAsync } = await import("@/services/programs/deepProgramRefresh");
      triggerDeepRefreshAsync(auth.user.id);
      triggerDeepProgramRefreshAsync(auth.user.id);
    } catch (e) { console.error("[my-results] Deep refresh failed:", e); }

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
