/**
 * GET /api/v1/week-plan/suggest?weekStart=YYYY-MM-DD
 *
 * Seed the week planner's Step 2/3 defaults using the athlete's last
 * completed plan. If no prior plan exists, return the catalog defaults
 * from `training_category_templates` + the subjects stored on
 * `player_schedule_preferences`.
 *
 * Adaptive logic (v1):
 *   compliance_rate >= 0.85 → keep same mix (+ encouraging note)
 *   compliance_rate in [0.60, 0.85) → keep same (+ gentle note)
 *   compliance_rate < 0.60 → suggest sessions/week − 1 per affected category
 *                            (+ coaching note explaining why)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const weekStart = req.nextUrl.searchParams.get("weekStart");
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json(
      { error: "weekStart (YYYY-MM-DD) required" },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  // ── Catalog defaults (always returned as fallback) ──
  const [catalogRes, prefsRes, priorRes] = await Promise.all([
    (db as any)
      .from("training_category_templates")
      .select(
        "id, label, default_mode, default_days_per_week, default_session_duration, default_preferred_time, sort_order, is_enabled",
      )
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true }),
    (db as any)
      .from("player_schedule_preferences")
      .select("training_categories, study_subjects, exam_subjects, exam_period_active")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
    // Prior completed plan — the most recent one before this week.
    (db as any)
      .from("athlete_week_plans")
      .select("week_start, compliance_rate, outcome, inputs, plan_items, status")
      .eq("user_id", auth.user.id)
      .lt("week_start", weekStart)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const catalog = (catalogRes?.data ?? []).map((row: any) => ({
    category: row.id,
    label: row.label,
    defaultMode: row.default_mode,
    defaultSessionsPerWeek: row.default_days_per_week,
    defaultDurationMin: row.default_session_duration,
    defaultPreferredTime: mapPreferredTime(row.default_preferred_time),
  }));

  const prefs = prefsRes?.data ?? null;
  const studySubjects: string[] = Array.isArray(prefs?.study_subjects)
    ? prefs.study_subjects
    : [];
  const examSubjects: string[] = Array.isArray(prefs?.exam_subjects)
    ? prefs.exam_subjects
    : [];
  const examPeriodActive = Boolean(prefs?.exam_period_active);

  const prior = priorRes?.data ?? null;
  const baseline = buildBaselineTrainingMix(catalog, prefs?.training_categories);
  const baselineStudy = buildBaselineStudyMix(studySubjects, examSubjects, examPeriodActive);

  if (!prior || prior.status !== "completed" || prior.compliance_rate == null) {
    return NextResponse.json({
      weekStart,
      source: "catalog",
      trainingMix: baseline,
      studyMix: baselineStudy,
      notes: prior
        ? [{ level: "info", text: "Last week's plan is still in progress — keeping your defaults." }]
        : [{ level: "info", text: "First week — starting from your default mix." }],
    });
  }

  // Prior plan exists and is completed. Compute per-category compliance if
  // `outcome` is populated; otherwise fall back to the plan-level rate.
  const priorInputs = prior.inputs ?? { trainingMix: [], studyMix: [] };
  const priorTraining = Array.isArray(priorInputs.trainingMix)
    ? priorInputs.trainingMix
    : [];
  const priorStudy = Array.isArray(priorInputs.studyMix)
    ? priorInputs.studyMix
    : [];
  const overallRate = Number(prior.compliance_rate);

  // Adapt training mix: start from prior inputs, apply the rate rule.
  const adaptedTraining = priorTraining.map((item: any) => {
    const sessions = Number(item.sessionsPerWeek ?? 0);
    let nextSessions = sessions;
    if (overallRate < 0.6 && sessions > 0) nextSessions = sessions - 1;
    return { ...item, sessionsPerWeek: nextSessions };
  });

  const adaptedStudy = priorStudy.map((item: any) => {
    const sessions = Number(item.sessionsPerWeek ?? 0);
    let nextSessions = sessions;
    if (overallRate < 0.6 && sessions > 0) nextSessions = sessions - 1;
    return { ...item, sessionsPerWeek: nextSessions };
  });

  const notes: Array<{ level: "info" | "warn"; text: string }> = [];
  if (overallRate >= 0.85) {
    notes.push({
      level: "info",
      text: `You hit ${Math.round(overallRate * 100)}% of last week's plan — keeping the same mix.`,
    });
  } else if (overallRate >= 0.6) {
    notes.push({
      level: "info",
      text: `Last week was ${Math.round(overallRate * 100)}%. Same mix, still pushing.`,
    });
  } else {
    notes.push({
      level: "warn",
      text: `Last week was ${Math.round(overallRate * 100)}%. Trimmed one session per category — fewer, but done.`,
    });
  }

  return NextResponse.json({
    weekStart,
    source: "adapted_from_prior",
    priorWeekStart: prior.week_start,
    priorComplianceRate: overallRate,
    trainingMix: adaptedTraining.length > 0 ? adaptedTraining : baseline,
    studyMix: adaptedStudy.length > 0 ? adaptedStudy : baselineStudy,
    notes,
  });
}

function mapPreferredTime(raw: string | null): "morning" | "afternoon" | "evening" {
  const s = (raw ?? "afternoon").toLowerCase();
  if (s === "morning") return "morning";
  if (s === "evening") return "evening";
  return "afternoon";
}

function buildBaselineTrainingMix(
  catalog: Array<{
    category: string;
    defaultMode: string;
    defaultSessionsPerWeek: number;
    defaultDurationMin: number;
    defaultPreferredTime: "morning" | "afternoon" | "evening";
  }>,
  playerOverride: unknown,
) {
  // If the player has configured `training_categories` JSONB on their prefs,
  // respect their per-category frequencies/durations. Otherwise use catalog.
  const override = isRecord(playerOverride) ? (playerOverride as Record<string, unknown>) : null;

  return catalog.map((c) => {
    const o = override?.[c.category];
    const oo = isRecord(o) ? (o as Record<string, unknown>) : null;
    return {
      category: c.category,
      sessionsPerWeek: numberOr(oo?.daysPerWeek, c.defaultSessionsPerWeek),
      durationMin: numberOr(oo?.sessionDurationMin, c.defaultDurationMin),
      placement:
        (c.defaultMode === "fixed_days" ? "fixed" : "flexible") as
          | "fixed"
          | "flexible",
      fixedDays: Array.isArray(oo?.fixedDays) ? (oo?.fixedDays as number[]) : [],
      preferredTime: c.defaultPreferredTime,
    };
  });
}

function buildBaselineStudyMix(
  studySubjects: string[],
  examSubjects: string[],
  examPeriodActive: boolean,
) {
  const examSet = new Set(examSubjects);
  const subjects = studySubjects.length > 0
    ? studySubjects
    : Array.from(examSet);
  return subjects.map((subject) => ({
    subject,
    sessionsPerWeek: examSet.has(subject) && examPeriodActive ? 3 : 2,
    durationMin: 45,
    placement: "flexible" as const,
    fixedDays: [],
    preferredTime: (examSet.has(subject) && examPeriodActive ? "morning" : "afternoon") as
      | "morning"
      | "afternoon"
      | "evening",
    isExamSubject: examSet.has(subject),
  }));
}

function isRecord(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function numberOr(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
