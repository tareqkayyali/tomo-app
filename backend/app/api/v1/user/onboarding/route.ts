import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { onboardingFinalizeSchema } from "@/lib/validation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { emitEventSafe } from "@/services/events/eventEmitter";
import { ageBandFromAge, ageFromDob, parseDobOrThrow } from "@/services/compliance";
import { seedSchedulePreferences } from "@/services/onboarding/seedSchedulePreferences";

/**
 * PUT /api/v1/user/onboarding
 *
 * Phase 2 finalize. Reads the accumulated onboarding_state from
 * /progress saves, validates it's complete, materialises answers
 * into top-level users columns, fires the PHV event, and seeds My
 * Rules.
 *
 * The client may also pass the full answers in the body as a
 * convenience — if present, they take precedence over the stored
 * state. This lets the last screen ship even if a /progress save
 * mid-flow was lost.
 */
export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));

    const db = supabaseAdmin();

    const { data: user, error: readErr } = await db
      .from("users")
      .select("id, role, date_of_birth, onboarding_state, onboarding_complete")
      .eq("id", auth.user.id)
      .single();

    if (readErr || !user) {
      return NextResponse.json({ error: "User not found", code: "USER_NOT_FOUND" }, { status: 404 });
    }

    if (user.onboarding_complete) {
      return NextResponse.json(
        { user, alreadyComplete: true },
        { status: 200, headers: { "api-version": "v1" } }
      );
    }

    // Merge stored state with anything the client sent in this request.
    const storedAnswers =
      ((user.onboarding_state as { answers?: Record<string, unknown> } | null)?.answers) ?? {};
    const merged = { ...storedAnswers, ...body };

    const parsed = onboardingFinalizeSchema.safeParse(merged);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Onboarding incomplete — some answers are missing.",
          code: "ONBOARDING_INCOMPLETE",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    // Derive age band for the seeder. We need the DOB from the age
    // gate; if a user somehow reached finalize without one, fail
    // loudly rather than silently default to 'unknown'.
    if (!user.date_of_birth) {
      return NextResponse.json(
        { error: "Missing date of birth — please restart signup.", code: "DOB_MISSING" },
        { status: 400 }
      );
    }
    const age = ageFromDob(parseDobOrThrow(user.date_of_birth));
    const ageBand = ageBandFromAge(age);

    const now = new Date().toISOString();

    // Materialise answers into top-level columns. Note: we write to
    // height_cm / weight_kg (the correct columns; prior route wrote
    // to non-existent height/weight).
    const { data: updated, error: updateErr } = await db
      .from("users")
      .update({
        sport: parsed.data.sport,
        football_position: parsed.data.sport === "football" ? parsed.data.position : null,
        height_cm: parsed.data.heightCm,
        weight_kg: parsed.data.weightKg,
        primary_goal: parsed.data.primaryGoal,
        onboarding_complete: true,
        onboarding_state: null, // clear transient state; answers are now in columns
        updated_at: now,
      })
      .eq("id", auth.user.id)
      .select()
      .single();

    if (updateErr) {
      console.error("[onboarding finalize] update error:", updateErr);
      return NextResponse.json(
        { error: "Failed to finalize onboarding", code: "UPDATE_FAILED" },
        { status: 500 }
      );
    }

    // Seed My Rules. Players only — coaches/parents don't have
    // player_schedule_preferences rows.
    if ((user.role ?? "player") === "player") {
      try {
        await seedSchedulePreferences(db, {
          userId: auth.user.id,
          sport: parsed.data.sport,
          ageBand,
        });
      } catch (seedErr) {
        // Log but don't fail the finalize — athlete can configure My
        // Rules manually if seeding hit a DB error.
        console.error("[onboarding finalize] seed My Rules failed:", seedErr);
      }
    }

    // PHV event — feeds growth-phase-aware load thresholds.
    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: "PHV_MEASUREMENT",
      occurredAt: now,
      source: "MANUAL",
      payload: {
        height_cm: parsed.data.heightCm,
        weight_kg: parsed.data.weightKg,
      },
      createdBy: auth.user.id,
    });

    return NextResponse.json(
      { user: updated, ageBand },
      { status: 200, headers: { "api-version": "v1" } }
    );
  } catch (err) {
    console.error("[onboarding finalize] error:", err);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL" }, { status: 500 });
  }
}
