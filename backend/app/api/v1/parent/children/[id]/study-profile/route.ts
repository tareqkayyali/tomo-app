/**
 * GET /api/v1/parent/children/[id]/study-profile
 *
 * Returns the linked child's study profile data (subjects, exams, training prefs).
 * Parent only — requires active relationship.
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
  // Note: study_subjects, exam_schedule, training_preferences are JSONB columns
  // added after the last type generation. Using raw query select + type assertion.
  const { data: child, error } = await db
    .from("users")
    .select("name, school_hours")
    .eq("id", childId)
    .single();

  if (error || !child) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  // Fetch JSONB columns separately via raw select to avoid generated type mismatch
  const { data: rawUser } = await db
    .from("users")
    .select("*")
    .eq("id", childId)
    .single();

  const raw = rawUser as Record<string, unknown> | null;

  return NextResponse.json({
    studyProfile: {
      name: child.name,
      studySubjects: (raw?.study_subjects as unknown[]) || [],
      examSchedule: (raw?.exam_schedule as unknown[]) || [],
      trainingPreferences: (raw?.training_preferences as Record<string, unknown>) || {},
      studyPlanConfig: (raw?.study_plan_config as Record<string, unknown>) || {},
      schoolHours: child.school_hours,
    },
  });
}
