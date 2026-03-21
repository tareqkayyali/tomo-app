/**
 * GET /api/v1/parent/children/[id]/study-profile
 *
 * Returns the linked child's study profile data (subjects, exams, schedule prefs).
 * Parent only — requires active relationship.
 *
 * Reads exam data from player_schedule_preferences (single source of truth)
 * and basic info from users table.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["parent"]);
  if ("error" in roleCheck) return roleCheck.error;

  const { id: childId } = await params;

  const relResult = await requireRelationship(auth.user.id, childId);
  if ("error" in relResult) return relResult.error;

  const db = supabaseAdmin();

  // 1. Get basic user info
  const { data: child, error } = await db
    .from("users")
    .select("name, school_hours")
    .eq("id", childId)
    .single();

  if (error || !child) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  // 2. Get exam/study data from player_schedule_preferences (the correct table)
  const { data: schedPrefs } = await db
    .from("player_schedule_preferences")
    .select("*")
    .eq("user_id", childId)
    .single();

  const prefs = schedPrefs as Record<string, unknown> | null;

  // 3. Build study profile from the correct source
  const examSchedule = (prefs?.exam_schedule as any[]) || [];
  const studySubjects = (prefs?.study_subjects as string[]) || (prefs?.exam_subjects as string[]) || [];

  return NextResponse.json({
    studyProfile: {
      name: child.name,
      studySubjects,
      examSchedule,
      examPeriodActive: prefs?.exam_period_active ?? false,
      examStartDate: prefs?.exam_start_date ?? null,
      preExamStudyWeeks: prefs?.pre_exam_study_weeks ?? 4,
      daysPerSubject: prefs?.days_per_subject ?? 2,
      schoolHours: child.school_hours,
    },
  });
}
