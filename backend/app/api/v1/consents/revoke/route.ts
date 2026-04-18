import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { revokeConsent, type ConsentType } from "@/services/consent/consentService";

// POST /api/v1/consents/revoke
// Body: { consentType, subjectUserId? }
// Revokes the most recent grant of (user, type). For parental revocation
// the caller is the parent; subjectUserId points at the child. For
// self-revocation (athlete pulling their own analytics consent) the
// caller and subject are the same.

const VALID_TYPES = new Set<ConsentType>([
  "tos", "privacy", "coppa_parental", "gdpr_k_parental",
  "ccpa_sale_optout", "analytics", "marketing", "ai_coaching",
  "coach_visibility", "parent_visibility", "moderated_content_view",
]);

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body", code: "INVALID_BODY" }, { status: 400 });
    }

    const { consentType, subjectUserId } = body as Record<string, unknown>;

    if (typeof consentType !== "string" || !VALID_TYPES.has(consentType as ConsentType)) {
      return NextResponse.json(
        { error: "Invalid consentType", code: "INVALID_CONSENT_TYPE" },
        { status: 400 }
      );
    }

    const userId = typeof subjectUserId === "string" && subjectUserId.length > 0
      ? subjectUserId
      : auth.user.id;

    const forwardedFor = req.headers.get("x-forwarded-for");
    const ipInet = forwardedFor ? forwardedFor.split(",")[0].trim() : null;
    const userAgent = req.headers.get("user-agent");

    const result = await revokeConsent({
      userId,
      consentType: consentType as ConsentType,
      revokedBy: auth.user.id,
      ipInet,
      userAgent,
    });

    return NextResponse.json({ id: result.id, ok: true }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg.includes("no active") ? "NO_ACTIVE_GRANT" : "REVOKE_FAILED";
    console.error("[POST /consents/revoke]", msg);
    return NextResponse.json({ error: msg, code }, { status: 400 });
  }
}
