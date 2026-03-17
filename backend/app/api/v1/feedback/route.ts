import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { feedbackSchema } from "@/lib/validation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { emitEventSafe } from "@/services/events/eventEmitter";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { planId, completed, actualEffort, notes } = parsed.data;
  const db = supabaseAdmin();

  const { data: plan, error } = await db
    .from("plans")
    .update({
      status: completed ? "completed" : "skipped",
      completed_at: completed ? new Date().toISOString() : null,
      actual_effort: actualEffort || null,
      feedback_notes: notes || null,
    })
    .eq("id", planId)
    .eq("user_id", auth.user.id)
    .select()
    .single();

  if (error || !plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  // ── Emit SESSION_LOG event to Athlete Data Fabric (dual-write) ──
  // Completed workouts feed ACWR, load metrics, recovery, and motivation computers
  const planRow = plan as Record<string, unknown>;
  if (completed) {
    const duration = (planRow.duration as number) || 30;
    const rpe = actualEffort || 5;
    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: 'SESSION_LOG',
      occurredAt: new Date().toISOString(),
      source: 'MANUAL',
      payload: {
        planned_session_id: planId,
        actual_duration_min: duration,
        session_rpe: rpe,
        training_load_au: rpe * duration,
        session_type: (planRow.workout_type as string) || 'training',
        sport: (planRow.sport as string) || null,
      },
      createdBy: auth.user.id,
    });
  } else {
    // Skipped session — emit SESSION_SKIPPED for audit trail
    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: 'SESSION_SKIPPED',
      occurredAt: new Date().toISOString(),
      source: 'MANUAL',
      payload: {
        planned_session_id: planId,
        reason: notes || 'No reason provided',
      },
      createdBy: auth.user.id,
    });
  }

  return NextResponse.json(
    { plan },
    { headers: { "api-version": "v1" } }
  );
}
