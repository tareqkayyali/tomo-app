import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { grantConsent, type ConsentType, type VerificationMethod } from "@/services/consent/consentService";

// POST /api/v1/consents/grant
// Body: { consentType, version, jurisdiction?, grantedBy?, verificationMethod }
//
// Self-consent (granter === subject) requires verificationMethod='self'.
// Parental consent (granter is the parent guardian) requires one of
// apple_parental_gate | credit_card | gov_id — enforced at service layer.

const VALID_TYPES = new Set<ConsentType>([
  "tos", "privacy", "coppa_parental", "gdpr_k_parental",
  "ccpa_sale_optout", "analytics", "marketing", "ai_coaching",
  "coach_visibility", "parent_visibility", "moderated_content_view",
]);

const VALID_METHODS = new Set<VerificationMethod>([
  "self", "apple_parental_gate", "apple_ask_to_buy", "credit_card",
  "gov_id", "email_plus", "knowledge_based",
]);

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body", code: "INVALID_BODY" }, { status: 400 });
    }

    const {
      consentType,
      version,
      jurisdiction,
      grantedBy,
      verificationMethod,
      subjectUserId, // for parental grants — the child whose consent is being completed
    } = body as Record<string, unknown>;

    if (typeof consentType !== "string" || !VALID_TYPES.has(consentType as ConsentType)) {
      return NextResponse.json(
        { error: "Invalid consentType", code: "INVALID_CONSENT_TYPE" },
        { status: 400 }
      );
    }
    if (typeof version !== "string" || version.length === 0) {
      return NextResponse.json(
        { error: "version required", code: "VERSION_REQUIRED" },
        { status: 400 }
      );
    }
    if (typeof verificationMethod !== "string" || !VALID_METHODS.has(verificationMethod as VerificationMethod)) {
      return NextResponse.json(
        { error: "Invalid verificationMethod", code: "INVALID_METHOD" },
        { status: 400 }
      );
    }

    // Subject defaults to the caller for self-consent; for parental
    // consent the caller is the parent and subjectUserId points at the
    // child.
    const userId = typeof subjectUserId === "string" && subjectUserId.length > 0
      ? subjectUserId
      : auth.user.id;

    // granted_by defaults to the caller (the person making the grant)
    const granter = typeof grantedBy === "string" && grantedBy.length > 0
      ? grantedBy
      : auth.user.id;

    // IP + UA captured for audit trail.
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ipInet = forwardedFor ? forwardedFor.split(",")[0].trim() : null;
    const userAgent = req.headers.get("user-agent");

    const result = await grantConsent({
      userId,
      consentType: consentType as ConsentType,
      version,
      jurisdiction: typeof jurisdiction === "string" ? jurisdiction : "GLOBAL",
      grantedBy: granter,
      verificationMethod: verificationMethod as VerificationMethod,
      ipInet,
      userAgent,
    });

    return NextResponse.json({ id: result.id, ok: true }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg.includes("parental consent cannot be verified via 'self'")
      ? "WEAK_VERIFICATION_REJECTED"
      : msg.includes("verification_method='self' requires granted_by")
        ? "SELF_GRANTER_MISMATCH"
        : "GRANT_FAILED";
    console.error("[POST /consents/grant]", msg);
    return NextResponse.json({ error: msg, code }, { status: 400 });
  }
}
