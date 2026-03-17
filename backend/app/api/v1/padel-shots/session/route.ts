import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import type { Json } from "@/types/database";
import { emitEventSafe } from "@/services/events/eventEmitter";

const shotRatingSchema = z.object({
  shotType: z.string().min(1).max(50),
  subMetrics: z.record(z.string(), z.number()),
  overall: z.number().int().min(0).max(100),
});

const sessionSchema = z.object({
  shots: z.array(shotRatingSchema).min(1).max(10),
  sessionType: z.enum(["training", "match"]).default("training"),
  notes: z.string().max(1000).optional().default(""),
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = sessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const today = new Date().toISOString().slice(0, 10);

    const rows = d.shots.map((shot) => ({
      user_id: auth.user.id,
      date: today,
      shot_type: shot.shotType,
      sub_metrics: shot.subMetrics as unknown as Json,
      overall: shot.overall,
      session_type: d.sessionType,
      notes: d.notes,
    }));

    const db = supabaseAdmin();
    const { data: results, error } = await db
      .from("padel_shot_results")
      .insert(rows)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Emit ASSESSMENT_RESULT event to Athlete Data Fabric (dual-write) ──
    // Padel shot session results feed DEVELOPMENT, CV_OPPORTUNITY, and MOTIVATION computers
    const avgOverall = d.shots.reduce((sum: number, s: { overall: number }) => sum + s.overall, 0) / d.shots.length;
    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: 'ASSESSMENT_RESULT',
      occurredAt: new Date().toISOString(),
      source: 'MANUAL',
      payload: {
        test_type: 'padel_shot_session',
        primary_value: Math.round(avgOverall),
        primary_unit: 'rating',
        derived_metrics: Object.fromEntries(
          d.shots.map((s: { shotType: string; overall: number }) => [`padel_${s.shotType}`, s.overall])
        ),
        raw_inputs: {
          session_type: d.sessionType,
          shot_count: d.shots.length,
        },
      },
      createdBy: auth.user.id,
    });

    return NextResponse.json(
      { results, count: results?.length || 0 },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
