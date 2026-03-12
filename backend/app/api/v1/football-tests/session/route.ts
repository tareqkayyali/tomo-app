import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import type { Json } from "@/types/database";

const footballTestSchema = z.object({
  testType: z.string().min(1).max(100),
  primaryValue: z.number(),
  primaryUnit: z.string().max(50).default(""),
  primaryLabel: z.string().max(200).default(""),
  derivedMetrics: z
    .array(
      z.object({
        label: z.string(),
        value: z.number(),
        unit: z.string(),
      })
    )
    .optional()
    .default([]),
  percentile: z.number().int().min(0).max(100).nullable().optional(),
  percentileLabel: z.string().max(100).optional().default(""),
  ageMean: z.number().nullable().optional(),
  ageMeanUnit: z.string().max(50).optional().default(""),
  isNewPB: z.boolean().optional().default(false),
  previousBest: z.number().nullable().optional(),
  rawInputs: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = footballTestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const d = parsed.data;

    const db = supabaseAdmin();
    const { data: result, error } = await db
      .from("football_test_results")
      .insert({
        user_id: auth.user.id,
        date: new Date().toISOString().slice(0, 10),
        test_type: d.testType,
        primary_value: d.primaryValue,
        primary_unit: d.primaryUnit,
        primary_label: d.primaryLabel,
        derived_metrics: d.derivedMetrics as unknown as Json,
        percentile: d.percentile ?? null,
        percentile_label: d.percentileLabel,
        age_mean: d.ageMean ?? null,
        age_mean_unit: d.ageMeanUnit,
        is_new_pb: d.isNewPB,
        previous_best: d.previousBest ?? null,
        raw_inputs: d.rawInputs as unknown as Json,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { result },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
