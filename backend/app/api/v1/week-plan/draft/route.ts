/**
 * POST /api/v1/week-plan/draft
 *
 * Stateless preview of a week plan. Takes the athlete's input mix,
 * runs the deterministic builder against live context (school hours,
 * existing events, readiness, scenario flags, day locks), and returns
 * the generated `plan_items[]` + summary + warnings.
 *
 * No writes. Called by the Python multi-step flow to render the
 * preview card, and again after any in-draft edit.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";
import {
  buildWeekPlan,
  type WeekPlanBuilderInput,
} from "@/services/weekPlan/weekPlanBuilder";
import { loadWeekPlanContext } from "@/services/weekPlan/weekPlanContext";

const CATEGORY_IDS = [
  "club",
  "gym",
  "personal",
  "recovery",
  "individual_technical",
  "tactical",
  "match_competition",
  "mental_performance",
] as const;

const preferredTimeSchema = z.enum(["morning", "afternoon", "evening"]).optional();

const trainingMixSchema = z
  .array(
    z.object({
      category: z.enum(CATEGORY_IDS),
      sessionsPerWeek: z.number().int().min(0).max(5),
      durationMin: z.number().int().min(15).max(180),
      placement: z.enum(["fixed", "flexible"]),
      fixedDays: z.array(z.number().int().min(0).max(6)).optional(),
      preferredTime: preferredTimeSchema,
    }),
  )
  .default([]);

const studyMixSchema = z
  .array(
    z.object({
      subject: z.string().min(1).max(60),
      sessionsPerWeek: z.number().int().min(0).max(5),
      durationMin: z.number().int().min(15).max(180),
      placement: z.enum(["fixed", "flexible"]),
      fixedDays: z.array(z.number().int().min(0).max(6)).optional(),
      preferredTime: preferredTimeSchema,
      isExamSubject: z.boolean().optional(),
    }),
  )
  .default([]);

const bodySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().optional(),
  trainingMix: trainingMixSchema,
  studyMix: studyMixSchema,
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid request", detail: (err as Error).message },
      { status: 400 },
    );
  }

  // Guard: weekStart must be a Monday — the whole flow assumes Mon-Sun.
  if (!isMonday(body.weekStart)) {
    return NextResponse.json(
      { error: "weekStart must be a Monday" },
      { status: 400 },
    );
  }

  const ctx = await loadWeekPlanContext({
    userId: auth.user.id,
    weekStart: body.weekStart,
    timezone: body.timezone ?? "UTC",
  });

  const input: WeekPlanBuilderInput = {
    weekStart: body.weekStart,
    trainingMix: body.trainingMix,
    studyMix: body.studyMix,
    existingEvents: ctx.existingEvents,
    playerPrefs: ctx.playerPrefs,
    readinessRag: ctx.readinessRag,
    acwr: ctx.acwr,
    dayLocks: ctx.dayLocks,
    config: ctx.config,
  };

  const result = buildWeekPlan(input);

  return NextResponse.json({
    weekStart: body.weekStart,
    planItems: result.planItems,
    summary: result.summary,
    warnings: result.warnings,
    // Echo the inputs so the caller can pass them back to /commit unchanged.
    inputs: {
      trainingMix: body.trainingMix,
      studyMix: body.studyMix,
    },
  });
}

function isMonday(iso: string): boolean {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay() === 1;
}
