import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "node:crypto";

// GET  /api/v1/admin/consents
//   Lists consent_documents grouped by (consent_type, jurisdiction)
//   with the latest effective version highlighted + affected-user
//   counts per type (via user_consents ledger).
//
// POST /api/v1/admin/consents
//   Body: { consentType, jurisdiction, version, bodyMd, dryRun? }
//   When dryRun=true, returns { affectedUsers } WITHOUT writing —
//   lets admin preview "N users will need reconsent" before bumping.
//   Otherwise inserts the new consent_documents row (compute hash
//   server-side) and returns it.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

const VALID_CONSENT_TYPES = new Set([
  "tos", "privacy", "coppa_parental", "gdpr_k_parental",
  "ccpa_sale_optout", "analytics", "marketing", "ai_coaching",
  "coach_visibility", "parent_visibility", "moderated_content_view",
]);

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin() as unknown as UntypedDb;

  const { data: docs, error } = await db
    .from("consent_documents")
    .select("version, consent_type, jurisdiction, body_hash, title, effective_at, retired_at")
    .order("effective_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message, code: "LIST_FAILED" }, { status: 500 });
  }

  const rows = (docs ?? []) as Array<{
    version: string;
    consent_type: string;
    jurisdiction: string;
    body_hash: string;
    title: string | null;
    effective_at: string;
    retired_at: string | null;
  }>;

  // Group by (consent_type, jurisdiction) with latest effective first.
  type Group = { key: string; consentType: string; jurisdiction: string; versions: typeof rows };
  const groupMap = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.consent_type}|${r.jurisdiction}`;
    const g = groupMap.get(key);
    if (g) g.versions.push(r);
    else groupMap.set(key, { key, consentType: r.consent_type, jurisdiction: r.jurisdiction, versions: [r] });
  }
  const groups = Array.from(groupMap.values());

  // Affected-user count per consent_type: number of active users who
  // have granted this consent_type AT LEAST ONCE. Used to preview a
  // version bump impact.
  const counts: Record<string, number> = {};
  try {
    const { data: grants } = await db
      .from("user_consents")
      .select("consent_type, user_id, granted");
    const active = new Map<string, Map<string, boolean>>();
    for (const g of ((grants ?? []) as Array<{ consent_type: string; user_id: string; granted: boolean }>)) {
      if (!active.has(g.consent_type)) active.set(g.consent_type, new Map());
      active.get(g.consent_type)!.set(g.user_id, g.granted);
    }
    for (const [ct, users] of active) {
      let count = 0;
      for (const [, granted] of users) if (granted) count++;
      counts[ct] = count;
    }
  } catch (err) {
    console.error("[admin/consents] user_consents count failed:", err);
  }

  return NextResponse.json({ groups, counts });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body", code: "INVALID_BODY" }, { status: 400 });
  }

  const {
    consentType, jurisdiction, version, bodyMd, title, dryRun,
  } = body as Record<string, unknown>;

  if (typeof consentType !== "string" || !VALID_CONSENT_TYPES.has(consentType)) {
    return NextResponse.json({ error: "Invalid consentType", code: "INVALID_CONSENT_TYPE" }, { status: 400 });
  }
  if (typeof jurisdiction !== "string" || jurisdiction.length === 0) {
    return NextResponse.json({ error: "jurisdiction required", code: "JURISDICTION_REQUIRED" }, { status: 400 });
  }
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    return NextResponse.json(
      { error: "version must be semver (x.y.z)", code: "INVALID_VERSION" },
      { status: 400 }
    );
  }
  if (typeof bodyMd !== "string" || bodyMd.length < 10) {
    return NextResponse.json(
      { error: "bodyMd must be at least 10 characters", code: "BODY_TOO_SHORT" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin() as unknown as UntypedDb;
  const hash = crypto.createHash("sha256").update(bodyMd).digest("hex");

  // Count users who have ACTIVE grants of this consent_type at any
  // prior version — those are the users a version bump would require
  // to re-consent once the 30-day grace expires.
  let affectedUsers = 0;
  try {
    const { data: grants } = await db
      .from("user_consents")
      .select("user_id, granted")
      .eq("consent_type", consentType);
    const state = new Map<string, boolean>();
    for (const g of ((grants ?? []) as Array<{ user_id: string; granted: boolean }>)) {
      state.set(g.user_id, g.granted);
    }
    for (const [, granted] of state) if (granted) affectedUsers++;
  } catch (err) {
    console.error("[admin/consents] affected-user count failed:", err);
  }

  if (dryRun === true) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      affectedUsers,
      hash,
      version,
    });
  }

  const { data, error } = await db
    .from("consent_documents")
    .insert({
      version,
      consent_type: consentType,
      jurisdiction,
      body_hash: hash,
      title: typeof title === "string" ? title : null,
      effective_at: new Date().toISOString(),
    })
    .select("version, consent_type, jurisdiction, body_hash, title, effective_at")
    .single();

  if (error) {
    // Unique violation = already exists
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "Version already exists for this type + jurisdiction", code: "VERSION_EXISTS" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message, code: "INSERT_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, document: data, affectedUsers }, { status: 201 });
}
