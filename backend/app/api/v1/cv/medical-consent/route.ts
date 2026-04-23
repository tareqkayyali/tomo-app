import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { updateMedicalConsent } from "@/services/cv/cvService";

/**
 * PUT /api/v1/cv/medical-consent
 *
 * Update the three medical-consent toggles on cv_profiles.
 *
 * Body (any subset):
 *   share_with_coach: boolean
 *   share_with_scouts_summary: boolean
 *   share_raw_data: boolean
 *   last_screening_date: string (ISO date) | null
 */
export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    await updateMedicalConsent(auth.user.id, {
      share_with_coach: body.share_with_coach,
      share_with_scouts_summary: body.share_with_scouts_summary,
      share_raw_data: body.share_raw_data,
      last_screening_date: body.last_screening_date,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update medical consent", detail: String(err) },
      { status: 500 }
    );
  }
}
