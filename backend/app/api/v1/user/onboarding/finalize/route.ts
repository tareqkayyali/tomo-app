import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { emitEventSafe } from "@/services/events/eventEmitter";
import { ageBandFromAge, ageFromDob, parseDobOrThrow } from "@/services/compliance";
import { seedSchedulePreferences } from "@/services/onboarding/seedSchedulePreferences";

/**
 * POST /api/v1/user/onboarding/finalize
 *
 * Phase 2 finalize for the new 4-screen player onboarding. Reads
 * the accumulated users.onboarding_state written by /progress,
 * validates every required field is present, materialises into
 * top-level columns, seeds My Rules, fires the PHV event, and flips
 * onboarding_complete.
 *
 * Intentionally a new endpoint — the legacy PUT /onboarding remains
 * in place for any client still on the old flow. Once mobile is
 * migrated, the legacy route becomes dead code.
 */

const finalizeSchema = z
  .object({
    sport: z.enum(["football", "soccer", "basketball", "tennis", "padel"]),
    position: z.string().min(1).max(32),
    heightCm: z.number().min(100).max(230),
    weightKg: z.number().min(25).max(180),
    primaryGoal: z.enum(["get_better", "stay_consistent", "recover", "get_recruited", "have_fun"]),
  })
  .passthrough();

export async function POST(req: NextRequest) {
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

    // Merge stored state with anything the client sent in this
    // request (insurance against a lost /progress save on the last
    // screen).
    const storedAnswers =
      ((user.onboarding_state as { answers?: Record<string, unknown> } | null)?.answers) ?? {};
    const merged = { ...storedAnswers, ...body };

    const parsed = finalizeSchema.safeParse(merged);
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

    if (!user.date_of_birth) {
      return NextResponse.json(
        { error: "Missing date of birth — please restart signup.", code: "DOB_MISSING" },
        { status: 400 }
      );
    }
    const age = ageFromDob(parseDobOrThrow(user.date_of_birth));
    const ageBand = ageBandFromAge(age);

    const now = new Date().toISOString();

    // Materialise answers into top-level columns. Writes to the
    // correct height_cm / weight_kg columns (the legacy PUT route
    // writes to non-existent height / weight — don't copy that bug).
    const { data: updated, error: updateErr } = await db
      .from("users")
      .update({
        sport: parsed.data.sport,
        football_position: parsed.data.sport === "football" ? parsed.data.position : null,
        height_cm: parsed.data.heightCm,
        weight_kg: parsed.data.weightKg,
        primary_goal: parsed.data.primaryGoal,
        onboarding_complete: true,
        onboarding_state: null,
        updated_at: now,
      })
      .eq("id", auth.user.id)
      .select()
      .single();

    if (updateErr) {
      console.error("[onboarding/finalize] update error:", updateErr);
      return NextResponse.json(
        { error: "Failed to finalize onboarding", code: "UPDATE_FAILED" },
        { status: 500 }
      );
    }

    // Seed My Rules — players only.
    if ((user.role ?? "player") === "player") {
      try {
        await seedSchedulePreferences(db, {
          userId: auth.user.id,
          sport: parsed.data.sport,
          ageBand,
        });
      } catch (seedErr) {
        console.error("[onboarding/finalize] seed My Rules failed:", seedErr);
      }
    }

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
    console.error("[onboarding/finalize] error:", err);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL" }, { status: 500 });
  }
}
