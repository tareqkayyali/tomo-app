import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkinSchema } from "@/lib/validation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generatePlan } from "@/services/planGenerator";
import { processCheckinCompliance } from "@/services/complianceService";
import type { Archetype } from "@/types";
import type { Json } from "@/types/database";
import { emitEventSafe } from "@/services/events/eventEmitter";
// Deep refresh is triggered by the mobile client via POST /recommendations/refresh
// (Vercel serverless kills fire-and-forget tasks after response is sent)

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  // 1. Validate with Zod
  const body = await req.json();
  const parsed = checkinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  // 2. Idempotency check (one per day)
  const { data: existing } = await db
    .from("checkins")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("date", today)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "Already checked in today", checkinId: existing.id },
      { status: 409 }
    );
  }

  // 3. Load user profile
  const { data: user, error: userError } = await db
    .from("users")
    .select("*")
    .eq("id", auth.user.id)
    .single();

  if (userError || !user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // 4-6. Generate training plan (calculates readiness + recommends intensity)
  const recentPlansResult = await db
    .from("plans")
    .select("workout_type")
    .eq("user_id", auth.user.id)
    .order("date", { ascending: false })
    .limit(5);

  const recentPlans = (recentPlansResult.data || []).map((p) => ({
    workoutType: p.workout_type,
  }));

  const plan = generatePlan(
    parsed.data,
    { sport: user.sport, archetype: user.archetype as Archetype | null },
    user.days_since_rest || 0,
    recentPlans
  );

  // 7. Insert checkin record
  const { data: checkin, error: checkinError } = await db
    .from("checkins")
    .insert({
      user_id: auth.user.id,
      date: today,
      energy: parsed.data.energy,
      soreness: parsed.data.soreness,
      pain_flag: parsed.data.painFlag,
      pain_location: parsed.data.painLocation || null,
      sleep_hours: parsed.data.sleepHours,
      effort_yesterday: parsed.data.effortYesterday,
      mood: parsed.data.mood,
      academic_stress: parsed.data.academicStress || null,
      readiness: plan.readiness,
      intensity: plan.intensity,
    })
    .select()
    .single();

  if (checkinError) {
    return NextResponse.json(
      { error: "Failed to save check-in" },
      { status: 500 }
    );
  }

  // 8. Insert plan record
  const { data: planRecord, error: planError } = await db
    .from("plans")
    .insert({
      user_id: auth.user.id,
      checkin_id: checkin.id,
      date: today,
      readiness: plan.readiness,
      intensity: plan.intensity,
      sport: plan.sport,
      workout_type: plan.workoutType,
      duration: plan.duration,
      warmup: plan.warmup as unknown as Json,
      main_workout: plan.mainWorkout as unknown as Json,
      cooldown: plan.cooldown as unknown as Json,
      focus_areas: plan.focusAreas as unknown as Json,
      alerts: plan.alerts as unknown as Json,
      modifications: plan.modifications as unknown as Json,
      recovery_tips: plan.recoveryTips as unknown as Json,
      decision_explanation: plan.decisionExplanation as unknown as Json,
      archetype_message: plan.archetypeMessage as unknown as Json,
      disclaimer: plan.disclaimer,
    })
    .select()
    .single();

  if (planError) {
    return NextResponse.json(
      { error: "Failed to save plan" },
      { status: 500 }
    );
  }

  // 9. Evaluate compliance & compute streak
  const complianceResult = await processCheckinCompliance(
    auth.user.id,
    { readiness: plan.readiness, intensity: plan.intensity, alerts: plan.alerts },
    user.days_since_rest || 0,
    today
  );

  // ── Emit WELLNESS_CHECKIN event to Athlete Data Fabric (dual-write) ──
  await emitEventSafe({
    athleteId: auth.user.id,
    eventType: 'WELLNESS_CHECKIN',
    occurredAt: new Date().toISOString(),
    source: 'MANUAL',
    payload: {
      energy: parsed.data.energy,
      soreness: parsed.data.soreness,
      sleep_hours: parsed.data.sleepHours,
      pain_flag: parsed.data.painFlag,
      pain_location: parsed.data.painLocation || null,
      mood: parsed.data.mood,
      effort_yesterday: parsed.data.effortYesterday,
      academic_stress: parsed.data.academicStress || null,
    },
    createdBy: auth.user.id,
  });

  // Update days_since_rest
  const newDaysSinceRest = plan.intensity === "rest" ? 0 : (user.days_since_rest || 0) + 1;
  await db
    .from("users")
    .update({ days_since_rest: newDaysSinceRest, updated_at: new Date().toISOString() })
    .eq("id", auth.user.id);

  // 10. Return response
  return NextResponse.json(
    {
      checkin: {
        id: checkin.id,
        date: today,
        readiness: plan.readiness,
        intensity: plan.intensity,
      },
      plan: {
        id: planRecord.id,
        workoutType: plan.workoutType,
        duration: plan.duration,
        warmup: plan.warmup,
        mainWorkout: plan.mainWorkout,
        cooldown: plan.cooldown,
        focusAreas: plan.focusAreas,
        alerts: plan.alerts,
        modifications: plan.modifications,
        recoveryTips: plan.recoveryTips,
        decisionExplanation: plan.decisionExplanation,
        archetypeMessage: plan.archetypeMessage,
        disclaimer: plan.disclaimer,
      },
      gamification: {
        pointsEarned: complianceResult.ledger.points,
        pointsReasons: complianceResult.ledger.reasons,
        totalPoints: complianceResult.ledger.newTotalPoints,
        streak: complianceResult.streak,
      },
    },
    { status: 201, headers: { "api-version": "v1" } }
  );
}
