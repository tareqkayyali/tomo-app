import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { assembleCVBundle } from "@/services/cv/cvAssembler";
import { updateCVProfile } from "@/services/cv/cvService";

/**
 * GET /api/v1/cv/profile — Returns the full assembled CV bundle for the
 * authenticated athlete (or a specific athleteId for admin/coach views,
 * auth permitting).
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const athleteId = req.nextUrl.searchParams.get("athleteId") || auth.user.id;

  try {
    const bundle = await assembleCVBundle(athleteId);
    return NextResponse.json(bundle);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch CV profile", detail: String(err) },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/cv/profile — Update athlete-editable profile fields on
 * cv_profiles head row (formation, dominant zone, visibility toggles).
 *
 * For AI summary edits use /cv/ai-summary/*.
 * For medical consent use /cv/medical-consent.
 * For publishing use /cv/publish.
 */
export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();

    await updateCVProfile(auth.user.id, {
      formation_preference: body.formation_preference,
      dominant_zone: body.dominant_zone,
      show_performance_data: body.show_performance_data,
      show_coachability: body.show_coachability,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update CV profile", detail: String(err) },
      { status: 500 }
    );
  }
}
