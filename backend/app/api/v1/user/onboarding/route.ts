import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { onboardingSchema } from "@/lib/validation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { emitEventSafe } from "@/services/events/eventEmitter";

export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  const updates: Record<string, unknown> = {
    onboarding_complete: true,
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.sport) updates.sport = parsed.data.sport;
  if (parsed.data.age) updates.age = parsed.data.age;
  if (parsed.data.schoolHours !== undefined) updates.school_hours = parsed.data.schoolHours;
  if (parsed.data.examPeriods !== undefined) updates.exam_periods = parsed.data.examPeriods;
  if (parsed.data.educationType) updates.education_type = parsed.data.educationType;
  if (parsed.data.educationYear) updates.education_year = parsed.data.educationYear;
  if (parsed.data.height) updates.height = parsed.data.height;
  if (parsed.data.weight) updates.weight = parsed.data.weight;
  if (parsed.data.gender) updates.gender = parsed.data.gender;
  if (parsed.data.primaryGoal) updates.primary_goal = parsed.data.primaryGoal;
  if (parsed.data.selectedSports) updates.selected_sports = parsed.data.selectedSports;
  if (parsed.data.footballPosition) updates.football_position = parsed.data.footballPosition;
  if (parsed.data.footballExperience) updates.football_experience = parsed.data.footballExperience;
  if (parsed.data.footballCompetition) updates.football_competition = parsed.data.footballCompetition;
  if (parsed.data.footballSelfAssessment) updates.football_self_assessment = parsed.data.footballSelfAssessment;

  const { data: user, error } = await db
    .from("users")
    .update(updates)
    .eq("id", auth.user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to update onboarding" },
      { status: 500 }
    );
  }

  // ── Emit PHV_MEASUREMENT event to Athlete Data Fabric (dual-write) ──
  // Height + weight feed PHV stage calculation for growth-phase-aware load thresholds
  if (parsed.data.height && parsed.data.weight) {
    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: 'PHV_MEASUREMENT',
      occurredAt: new Date().toISOString(),
      source: 'MANUAL',
      payload: {
        height_cm: parsed.data.height,
        weight_kg: parsed.data.weight,
      },
      createdBy: auth.user.id,
    });
  }

  return NextResponse.json({ user }, { headers: { "api-version": "v1" } });
}
