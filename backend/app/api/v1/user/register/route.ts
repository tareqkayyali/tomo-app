import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { registerSchema } from "@/lib/validation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  MIN_SIGNUP_AGE,
  ageFromDob,
  ageBandFromAge,
  getCurrentLegalVersions,
  initialConsentStatus,
  parseDobOrThrow,
} from "@/services/compliance";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_FAILED", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      name,
      sport,
      dateOfBirth,
      role,
      displayRole,
      tosVersion,
      privacyVersion,
      regionCode,
    } = parsed.data;

    // ── Age gate ────────────────────────────────────────────────────
    // Server-authoritative. Client may not pick its own age.
    let dob: Date;
    try {
      dob = parseDobOrThrow(dateOfBirth);
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid date of birth", code: "INVALID_DOB" },
        { status: 400 }
      );
    }

    const age = ageFromDob(dob);
    if (age < MIN_SIGNUP_AGE) {
      // Client-side age gate failed (tampered or bypassed) — the
      // Supabase auth user already exists at this point. Delete it so
      // we don't retain PII for a rejected signup, then return 403.
      try {
        const db = supabaseAdmin();
        await db.auth.admin.deleteUser(auth.user.id);
      } catch (delErr) {
        console.error('[register] failed to delete auth user for under-age reject:', delErr);
      }
      return NextResponse.json(
        {
          error: "Tomo is for athletes 13 and up.",
          code: "UNDER_MIN_AGE",
          minAge: MIN_SIGNUP_AGE,
        },
        { status: 403 }
      );
    }

    // ── Legal version check ────────────────────────────────────────
    // The client sent the version it saw at acceptance time. If the
    // server has rolled forward since (new legal text published), the
    // client must show the updated docs and re-accept.
    const served = getCurrentLegalVersions();
    if (tosVersion !== served.terms || privacyVersion !== served.privacy) {
      return NextResponse.json(
        {
          error: "Legal documents have been updated — please re-accept.",
          code: "STALE_LEGAL_VERSION",
          served,
          submitted: { terms: tosVersion, privacy: privacyVersion },
        },
        { status: 409 }
      );
    }

    // ── Initial consent state ──────────────────────────────────────
    // EU/UK 13-15 lands in 'awaiting_parent'; everyone else is 'active'.
    // Phase 3 adds the parent invite UI that flips to 'active' on
    // consent. Until then, EU/UK 13-15 accounts exist but migration 062
    // blocks their writes — a safe default.
    const consentStatus = initialConsentStatus(age, regionCode ?? null);
    const ageBand = ageBandFromAge(age);

    const userRole = role || "player";
    if (userRole === "player" && !sport) {
      return NextResponse.json(
        { error: "Sport is required for player accounts", code: "SPORT_REQUIRED" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    const { data: existing } = await db
      .from("users")
      .select("id")
      .eq("id", auth.user.id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "User profile already exists", code: "USER_EXISTS" },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();

    const { data: user, error } = await db
      .from("users")
      .insert({
        id: auth.user.id,
        email: auth.user.email,
        name,
        sport: sport || "football",
        age,
        date_of_birth: dateOfBirth,
        date_of_birth_set_at: now,
        role: userRole,
        display_role: displayRole || null,
        region_code: regionCode ?? null,
        tos_version: tosVersion,
        tos_accepted_at: now,
        privacy_version: privacyVersion,
        privacy_accepted_at: now,
        consent_status: consentStatus,
        consent_given_at: consentStatus === "active" ? now : null,
      })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/v1/user/register] insert error:', error);
      return NextResponse.json(
        { error: "Failed to create user profile", code: "INSERT_FAILED" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        user,
        ageBand,
        consentStatus,
        requiresParentalConsent: consentStatus === "awaiting_parent",
      },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch (err) {
    console.error('[POST /api/v1/user/register] error:', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
