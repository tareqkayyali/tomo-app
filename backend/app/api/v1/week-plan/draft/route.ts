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
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import {
  buildWeekPlan,
  type WeekPlanBuilderInput,
} from "@/services/weekPlan/weekPlanBuilder";
import { loadWeekPlanContext } from "@/services/weekPlan/weekPlanContext";
import {
  resolveCategoryPriority,
  detectScenario,
} from "@/services/weekPlan/priorityResolver";

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
  // Mode id from the week-scope capsule (e.g. 'balanced' | 'league'
  // | 'study' | 'rest'). Forwarded to the builder as a scenario
  // override — doesn't mutate the athlete's global athlete_mode.
  modeId: z.string().optional(),
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

  // weekStart must match the athlete's configured week_start_day. Load
  // from prefs here so Python can pass any date it resolved client-side
  // (which in turn honored the same My Rules setting). Reject mismatches
  // so we never silently schedule against the wrong 7-day window.
  const prefs = await (supabaseAdmin() as any)
    .from("player_schedule_preferences")
    .select("week_start_day")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const weekStartDay = typeof prefs?.data?.week_start_day === "number"
    ? prefs.data.week_start_day
    : 6;
  if (weekdayOf(body.weekStart) !== weekStartDay) {
    return NextResponse.json(
      {
        error: "weekStart does not match the athlete's configured week_start_day",
        expectedWeekday: weekStartDay,
        got: weekdayOf(body.weekStart),
      },
      { status: 400 },
    );
  }

  const ctx = await loadWeekPlanContext({
    userId: auth.user.id,
    weekStart: body.weekStart,
    timezone: body.timezone ?? "UTC",
  });

  // Resolve category priority from CMS BEFORE running the builder so the
  // repair engine has deterministic swap direction. Scenario comes from
  // live prefs; priority boosts from the selected mode.
  const scenario = detectScenario({
    league_is_active: ctx.playerPrefs.leagueActive,
    exam_period_active: ctx.playerPrefs.examPeriodActive,
  });
  const priority = await resolveCategoryPriority({
    scenario,
    modeId: body.modeId ?? "balanced",
  });

  // Today in the athlete's local timezone. The builder uses this to
  // ban placement on past days (critical when "this week" is picked
  // mid-week — without this guard the planner would schedule Monday
  // sessions on a Saturday).
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: body.timezone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const input: WeekPlanBuilderInput = {
    weekStart: body.weekStart,
    today,
    trainingMix: body.trainingMix,
    studyMix: body.studyMix,
    existingEvents: ctx.existingEvents,
    playerPrefs: ctx.playerPrefs,
    readinessRag: ctx.readinessRag,
    acwr: ctx.acwr,
    dayLocks: ctx.dayLocks,
    config: ctx.config,
    modeId: body.modeId,
    priority,
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

/** 0=Sun..6=Sat, via UTC to avoid local-tz drift. */
function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}
