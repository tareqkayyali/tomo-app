import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Phase 2 per-step onboarding. Schemas are inlined here (not in
// lib/validation.ts) so this feature is additive and doesn't touch
// the shared validation module owned by other in-flight work.
const ONBOARDING_STEPS = ["sport", "position", "heightWeight", "goal"] as const;

const onboardingAnswersSchema = z.object({
  sport: z.enum(["football", "soccer", "basketball", "tennis", "padel"]).optional(),
  position: z.string().max(32).optional(),
  heightCm: z.number().min(100).max(230).optional(),
  weightKg: z.number().min(25).max(180).optional(),
  primaryGoal: z
    .enum(["get_better", "stay_consistent", "recover", "get_recruited", "have_fun"])
    .optional(),
});

const onboardingProgressSchema = z.object({
  step: z.enum(ONBOARDING_STEPS),
  answers: onboardingAnswersSchema,
});

/**
 * POST /api/v1/user/onboarding/progress
 *
 * Phase 2 per-step onboarding persistence. Writes the current step +
 * answers into users.onboarding_state (JSONB) so a crash or app
 * switch resumes at the last unanswered step.
 *
 * Merges by taking the union of previously-stored answers and the
 * new answers in this request. Clients should only send their own
 * step's fields; the server handles the merge.
 *
 * Returns the full merged state so the client can use it as
 * source-of-truth on resume without a second GET.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = onboardingProgressSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_FAILED", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    const { data: existing, error: readErr } = await db
      .from("users")
      .select("onboarding_state, onboarding_complete")
      .eq("id", auth.user.id)
      .single();

    if (readErr) {
      console.error('[onboarding/progress] read error:', readErr);
      return NextResponse.json({ error: "User not found", code: "USER_NOT_FOUND" }, { status: 404 });
    }

    // Onboarding already complete — treat as idempotent 200. The
    // client may be replaying a request; no state change needed.
    if (existing.onboarding_complete) {
      return NextResponse.json(
        { state: existing.onboarding_state, alreadyComplete: true },
        { status: 200, headers: { "api-version": "v1" } }
      );
    }

    const prevState = (existing.onboarding_state as { answers?: Record<string, unknown> } | null) ?? {};
    const prevAnswers = prevState.answers ?? {};

    const nextState = {
      step: parsed.data.step,
      answers: { ...prevAnswers, ...parsed.data.answers },
      updatedAt: new Date().toISOString(),
    };

    const { error: writeErr } = await db
      .from("users")
      .update({
        onboarding_state: nextState,
        updated_at: nextState.updatedAt,
      })
      .eq("id", auth.user.id);

    if (writeErr) {
      console.error('[onboarding/progress] write error:', writeErr);
      return NextResponse.json({ error: "Failed to save progress", code: "WRITE_FAILED" }, { status: 500 });
    }

    return NextResponse.json(
      { state: nextState },
      { status: 200, headers: { "api-version": "v1" } }
    );
  } catch (err) {
    console.error('[onboarding/progress] error:', err);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL" }, { status: 500 });
  }
}

/**
 * GET /api/v1/user/onboarding/progress
 *
 * Returns the current onboarding state. Used by the mobile
 * OnboardingNavigator on mount to resume at the last unanswered
 * step.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("users")
      .select("onboarding_state, onboarding_complete")
      .eq("id", auth.user.id)
      .single();

    if (error) {
      return NextResponse.json({ error: "User not found", code: "USER_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(
      {
        state: data.onboarding_state ?? null,
        onboardingComplete: !!data.onboarding_complete,
      },
      { status: 200, headers: { "api-version": "v1" } }
    );
  } catch (err) {
    console.error('[onboarding/progress GET] error:', err);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL" }, { status: 500 });
  }
}
