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
      .select(
        "training_categories, study_subjects, exam_subjects, exam_schedule, exam_period_active, week_start_day",
      )
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
  // Exam subjects live in TWO places depending on which capsule wrote them:
  //   - player_schedule_preferences.exam_subjects (text[])
  //   - player_schedule_preferences.exam_schedule (JSONB, {subject, ...}[])
  // The ExamCapsule writes to exam_schedule only (see timelineAgent.ts:777
  // add_exam), so we must merge both or exam-added subjects go missing.
  const examSubjectsDirect: string[] = Array.isArray(prefs?.exam_subjects)
    ? prefs.exam_subjects
    : [];
  const examScheduleSubjects: string[] = Array.isArray(prefs?.exam_schedule)
    ? (prefs.exam_schedule as Array<{ subject?: string }>)
        .map((e) => e?.subject)
        .filter((s): s is string => typeof s === "string" && s.length > 0)
    : [];
  const examSubjects: string[] = Array.from(
    new Set([...examSubjectsDirect, ...examScheduleSubjects]),
  );
  const examPeriodActive = Boolean(prefs?.exam_period_active);
  // My Rules week-start day (0=Sun..6=Sat). Defaults to 6 (Saturday)
  // when not set — the column has a DB default too, this is
  // belt-and-suspenders for legacy rows.
  const weekStartDay = typeof prefs?.week_start_day === "number"
    ? prefs.week_start_day
    : 6;

  const prior = priorRes?.data ?? null;
  const baseline = buildBaselineTrainingMix(catalog, prefs?.training_categories);
  const baselineStudy = buildBaselineStudyMix(studySubjects, examSubjects, examPeriodActive);

  if (!prior || prior.status !== "completed" || prior.compliance_rate == null) {
    return NextResponse.json({
      weekStart,
      weekStartDay,
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
    weekStartDay,
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
    label: string;
    defaultMode: string;
    defaultSessionsPerWeek: number;
    defaultDurationMin: number;
    defaultPreferredTime: "morning" | "afternoon" | "evening";
  }>,
  playerOverride: unknown,
) {
  // My Rules is the source of truth. If the athlete has configured
  // `training_categories` JSONB, respect their ENABLED list — only show
  // categories they've turned on. Categories disabled in My Rules don't
  // appear in the Training Mix capsule at all.
  //
  // Fallback: when the JSONB is missing or empty, use the CMS catalog
  // (training_category_templates) so first-time athletes see a sensible
  // starting palette.
  const override = isRecord(playerOverride) ? (playerOverride as Record<string, unknown>) : null;
  const catalogById = new Map(catalog.map((c) => [c.category, c]));

  // Path A — My Rules has entries → filter by enabled, use the player's
  //           per-category frequency/duration/days.
  if (override) {
    const enabledEntries: Array<[string, Record<string, unknown>]> = [];
    for (const [id, raw] of Object.entries(override)) {
      if (!isRecord(raw)) continue;
      const o = raw as Record<string, unknown>;
      // Treat "enabled missing" as enabled — many legacy rows don't set
      // the flag. If explicitly false, hide.
      if (o.enabled === false) continue;
      enabledEntries.push([id, o]);
    }
    if (enabledEntries.length > 0) {
      return enabledEntries.map(([id, o]) => {
        const c = catalogById.get(id);
        return {
          category: id,
          // Prefer My Rules config; cascade to catalog defaults if a
          // specific field isn't set; final fallback is a sensible
          // baseline so the capsule never crashes.
          sessionsPerWeek: numberOr(o.daysPerWeek, c?.defaultSessionsPerWeek ?? 2),
          durationMin: numberOr(o.sessionDurationMin, c?.defaultDurationMin ?? 60),
          placement: inferPlacement(o, c) as "fixed" | "flexible",
          fixedDays: Array.isArray(o.fixedDays) ? (o.fixedDays as number[]) : [],
          preferredTime: (c?.defaultPreferredTime ?? "afternoon") as
            | "morning" | "afternoon" | "evening",
          label: c?.label ?? id,
        };
      });
    }
  }

  // Path B — My Rules empty/unset → cascade to CMS catalog defaults.
  return catalog.map((c) => ({
    category: c.category,
    sessionsPerWeek: c.defaultSessionsPerWeek,
    durationMin: c.defaultDurationMin,
    placement: (c.defaultMode === "fixed_days" ? "fixed" : "flexible") as
      | "fixed"
      | "flexible",
    fixedDays: [],
    preferredTime: c.defaultPreferredTime,
    label: c.label,
  }));
}

/** Derive placement from a My Rules JSONB entry, falling back to the
 *  catalog's defaultMode, finally to 'flexible'. */
function inferPlacement(
  o: Record<string, unknown>,
  c?: { defaultMode: string },
): "fixed" | "flexible" {
  if (o.mode === "fixed_days" || o.placement === "fixed") return "fixed";
  if (o.mode === "days_per_week" || o.placement === "flexible") return "flexible";
  if (Array.isArray(o.fixedDays) && (o.fixedDays as unknown[]).length > 0) return "fixed";
  if (c?.defaultMode === "fixed_days") return "fixed";
  return "flexible";
}

function buildBaselineStudyMix(
  studySubjects: string[],
  examSubjects: string[],
  examPeriodActive: boolean,
) {
  const examSet = new Set(examSubjects);
  // Union every known subject from every source, preserving insertion order
  // so exam subjects (populated via ExamCapsule → exam_schedule) appear
  // alongside study subjects (populated via SubjectCapsule → study_subjects).
  // Without this union, athletes who set up exams but never opened the
  // SubjectCapsule see an empty "No subjects yet" state.
  const seen = new Set<string>();
  const subjects: string[] = [];
  for (const s of [...studySubjects, ...examSubjects]) {
    const key = s.trim();
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    subjects.push(key);
  }
  return subjects.map((subject) => {
    const isExam = examSet.has(subject);
    // Exam subjects auto-select with bumped frequency when the athlete is
    // in exam mode; otherwise everything defaults to 0 (opt-in). That way
    // the athlete sees their full subject list but only schedules what
    // they actually want this week.
    const defaultSessions = isExam && examPeriodActive ? 3 : 0;
    return {
      subject,
      sessionsPerWeek: defaultSessions,
      durationMin: 45,
      placement: "flexible" as const,
      fixedDays: [],
      preferredTime: (isExam && examPeriodActive ? "morning" : "afternoon") as
        | "morning"
        | "afternoon"
        | "evening",
      isExamSubject: isExam,
    };
  });
}

function isRecord(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function numberOr(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
