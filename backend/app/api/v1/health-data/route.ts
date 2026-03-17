/**
 * Health Data (Vitals) API
 *
 * GET  — Fetch user's vitals from health_data table
 * POST — Manually log a vital reading
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import { emitEventSafe } from "@/services/events/eventEmitter";

// ── GET /api/v1/health-data?days=7&metric=heart_rate ──────────────────

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const days = Math.min(parseInt(searchParams.get("days") || "7", 10), 90);
  const metric = searchParams.get("metric") || undefined;

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const db = supabaseAdmin();
  let query = db
    .from("health_data")
    .select("*")
    .eq("user_id", auth.user.id)
    .gte("date", sinceStr)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (metric) {
    query = query.eq("metric_type", metric);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by metric_type for easier frontend consumption
  const grouped: Record<string, Array<{ date: string; value: number; unit: string | null; source: string | null }>> = {};
  for (const row of data || []) {
    const mt = (row as Record<string, unknown>).metric_type as string;
    if (!grouped[mt]) grouped[mt] = [];
    grouped[mt].push({
      date: (row as Record<string, unknown>).date as string,
      value: Number((row as Record<string, unknown>).value),
      unit: ((row as Record<string, unknown>).unit as string) || null,
      source: ((row as Record<string, unknown>).source as string) || null,
    });
  }

  return NextResponse.json(
    { vitals: grouped, count: (data || []).length },
    { headers: { "api-version": "v1" } },
  );
}

// ── POST /api/v1/health-data ──────────────────────────────────────────

const healthDataSchema = z.object({
  metricType: z.string().min(1).max(100),
  value: z.number(),
  unit: z.string().max(20).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: z.string().max(50).optional(),
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = healthDataSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { metricType, value, unit, date, source } = parsed.data;

    const db = supabaseAdmin();
    const { data: row, error } = await db
      .from("health_data")
      .insert({
        user_id: auth.user.id,
        date: date || new Date().toISOString().slice(0, 10),
        metric_type: metricType,
        value,
        unit: unit || null,
        source: source || "manual",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Emit VITAL_READING event to Athlete Data Fabric (dual-write) ──
    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: 'VITAL_READING',
      occurredAt: new Date().toISOString(),
      source: (source === 'manual' || !source) ? 'MANUAL' : 'WEARABLE',
      payload: {
        metric_type: metricType,
        value,
        unit: unit || null,
        wearable_device: source || 'manual',
      },
      createdBy: auth.user.id,
    });

    return NextResponse.json({ data: row }, { status: 201, headers: { "api-version": "v1" } });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
