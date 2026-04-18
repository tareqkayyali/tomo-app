import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { generateInviteCode } from "@/services/relationshipService";

/**
 * POST /api/v1/relationships/invite-parent
 *
 * Phase 3 child-initiated parent consent flow. A player generates a
 * 6-char code with target_role='parent'. They share it out-of-band
 * (SMS, screenshot, in-person) and the parent enters it on their
 * Tomo app at /relationships/accept-guardian.
 *
 * Distinct from /relationships/invite (coach/parent-only) so the
 * existing coach→player invite flow stays untouched.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["player"]);
  if ("error" in roleCheck) return roleCheck.error;

  try {
    const { code, expiresAt } = await generateInviteCode(auth.user.id, "parent");
    return NextResponse.json(
      { code, expiresAt },
      { status: 201, headers: { "api-version": "v1" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
