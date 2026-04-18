import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  parentLoadLabel,
  nextExamFrom,
  buildWeeklyDigest,
} from "@/services/triangle/parentProgress";

// GET /api/v1/parent/education/progress?child_id=<uuid>
//
// Parent-facing progress lens focused on the education/academic angle.
// Returns parent-readable labels ONLY — no raw ACWR/HRV/PHV leaks.
// Enforced at two layers:
//   1. Backend composes labels via parentLoadLabel() before send.
//   2. parentProgress tests assert banned-term lists stay clean.
//
// Fail-closed shape: every field returns a safe default instead of
// failing the whole response if a sub-query errors out. The parent
// portal degrades gracefully rather than flashing errors.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;
  const roleRes = await requireRole(auth.user.id, ["parent"]);
  if ("error" in roleRes) return roleRes.error;

  const url = new URL(req.url);
  const childId = url.searchParams.get("child_id");
  if (!childId) {
    return NextResponse.json(
      { error: "child_id required", code: "CHILD_ID_REQUIRED" },
      { status: 400 }
    );
  }

  const rel = await requireRelationship(auth.user.id, childId, ["parent"]);
  if ("error" in rel) return rel.error;

  const db = supabaseAdmin() as unknown as UntypedDb;

  // Load the four data sources in parallel. Missing data → graceful
  // degradation via pure renderers.
  const [snapRes, digestRes, examRes, userRes] = await Promise.all([
    db
      .from("athlete_snapshots")
      .select("dual_load_index, dual_load_zone, current_streak")
      .eq("athlete_id", childId)
      .maybeSingle(),
    db
      .from("athlete_weekly_digest")
      .select("training_sessions, training_minutes, study_sessions, study_minutes_total, check_ins_completed, wellness_trend")
      .eq("athlete_id", childId)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("exam_periods")
      .select("subject, exam_date")
      .eq("user_id", childId)
      .order("exam_date", { ascending: true })
      .limit(10),
    db
      .from("users")
      .select("current_streak, date_of_birth")
      .eq("id", childId)
      .maybeSingle(),
  ]);

  const snap = snapRes.data as {
    dual_load_index: number | null;
    dual_load_zone: "green" | "amber" | "red" | "critical" | null;
    current_streak: number | null;
  } | null;
  const digest = digestRes.data as {
    training_sessions: number | null;
    training_minutes: number | null;
    study_sessions: number | null;
    study_minutes_total: number | null;
    check_ins_completed: number | null;
    wellness_trend: "IMPROVING" | "STABLE" | "DECLINING" | null;
  } | null;
  const examsRaw = (examRes.data ?? []) as Array<{ subject: string; exam_date: string }>;
  const user = userRes.data as { current_streak: number | null; date_of_birth: string | null } | null;

  const loadLabel = parentLoadLabel(
    snap?.dual_load_zone ?? null,
    snap?.dual_load_index ?? null
  );

  const nextExam = nextExamFrom(examsRaw);

  const streak = user?.current_streak ?? snap?.current_streak ?? null;

  const bullets = buildWeeklyDigest({
    weeklyDigestRow: digest,
    streak,
    exam: nextExam ? { subject: nextExam.subject, daysUntil: nextExam.daysUntil } : null,
  });

  return NextResponse.json({
    childId,
    load: {
      label: loadLabel.label,
      color: loadLabel.color,
      hint: loadLabel.hint,
    },
    nextExam,
    streak,
    digest: bullets,
    // Minimal raw numbers that ARE parent-safe (session counts + minutes
    // are opaque aggregates, not clinical signals).
    week: digest
      ? {
          trainingSessions: digest.training_sessions ?? 0,
          trainingMinutes: digest.training_minutes ?? 0,
          studySessions: digest.study_sessions ?? 0,
          studyMinutes: digest.study_minutes_total ?? 0,
          checkIns: digest.check_ins_completed ?? 0,
        }
      : null,
  });
}
