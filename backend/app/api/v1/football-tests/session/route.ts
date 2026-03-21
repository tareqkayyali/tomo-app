import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import type { Json } from "@/types/database";
import { emitEventSafe } from "@/services/events/eventEmitter";

// ── Map football test types → benchmark metric keys (must match TEST_GROUP_MAP) ──
const FOOTBALL_TEST_TO_METRIC: Record<string, { key: string; label: string } | ((unit: string) => { key: string; label: string })> = {
  sprint:           { key: "sprint_10m", label: "10m Sprint" },
  "10m-sprint":     { key: "sprint_10m", label: "10m Sprint" },
  "10m_sprint":     { key: "sprint_10m", label: "10m Sprint" },
  "20m-sprint":     { key: "sprint_20m", label: "20m Sprint" },
  "30m-sprint":     { key: "sprint_30m", label: "30m Sprint" },
  "30m_sprint":     { key: "sprint_30m", label: "30m Sprint" },
  jump:             { key: "cmj", label: "CMJ Jump Height" },
  vertical_jump:    { key: "cmj", label: "CMJ Jump Height" },
  "vertical-jump":  { key: "cmj", label: "CMJ Jump Height" },
  "squat-jump":     { key: "cmj", label: "CMJ Jump Height" },
  "broad-jump":     { key: "broad_jump", label: "Broad Jump" },
  agility:          { key: "agility_505", label: "5-0-5 Agility" },
  "5_10_5_agility": { key: "agility_505", label: "5-0-5 Agility" },
  "5-10-5-agility": { key: "agility_505", label: "5-0-5 Agility" },
  "t-test":         { key: "agility_505", label: "T-Test Agility" },
  "illinois-agility":{ key: "agility_505", label: "Illinois Agility" },
  endurance:        { key: "vo2max", label: "Yo-Yo IR1 / VO2max" },
  "yoyo-ir1":       { key: "vo2max", label: "Yo-Yo IR1" },
  "beep-test":      { key: "vo2max", label: "Beep Test" },
  "cooper-12min":   { key: "vo2max", label: "Cooper 12min" },
  strength: (unit: string) =>
    unit === "xBW"
      ? { key: "squat_rel", label: "Relative Squat Strength" }
      : { key: "grip_strength", label: "Grip Strength" },
  shooting: (unit: string) =>
    unit === "km/h"
      ? { key: "shot_speed", label: "Shot Speed" }
      : { key: "shooting_accuracy", label: "Shooting Accuracy" },
  passing: (_unit: string) => ({ key: "passing_accuracy", label: "Passing Accuracy" }),
  "reaction-time":  { key: "reaction_time", label: "Reaction Time" },
  "reaction-tap":   { key: "reaction_time", label: "Reaction Time" },
};

function resolveMetric(testType: string, unit: string): { key: string; label: string } | null {
  const mapping = FOOTBALL_TEST_TO_METRIC[testType];
  if (!mapping) return null;
  if (typeof mapping === "function") return mapping(unit);
  return mapping;
}

function getZone(percentile: number): string {
  if (percentile >= 90) return "elite";
  if (percentile >= 70) return "good";
  if (percentile >= 30) return "average";
  if (percentile >= 10) return "developing";
  return "below";
}

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

    // ── Write to player_benchmark_snapshots (feeds Mastery page) ──
    const metric = resolveMetric(d.testType, d.primaryUnit);
    if (metric && d.percentile != null) {
      await db
        .from("player_benchmark_snapshots")
        .upsert(
          {
            user_id: auth.user.id,
            metric_key: metric.key,
            metric_label: metric.label,
            value: d.primaryValue,
            percentile: d.percentile,
            zone: getZone(d.percentile),
            tested_at: new Date().toISOString().slice(0, 10),
            source: "manual",
          },
          { onConflict: "user_id,metric_key" }
        );
    }

    // ── Emit ASSESSMENT_RESULT event to Athlete Data Fabric (dual-write) ──
    // Football test results feed DEVELOPMENT, CV_OPPORTUNITY, and MOTIVATION computers
    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: 'ASSESSMENT_RESULT',
      occurredAt: new Date().toISOString(),
      source: 'MANUAL',
      payload: {
        test_type: d.testType,
        primary_value: d.primaryValue,
        primary_unit: d.primaryUnit || null,
        derived_metrics: Object.fromEntries(
          (d.derivedMetrics || []).map((m: { label: string; value: number }) => [m.label, m.value])
        ),
        raw_inputs: d.rawInputs || {},
        percentile: d.percentile ?? null,
        is_new_pb: d.isNewPB ?? false,
      },
      createdBy: auth.user.id,
    });

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
