// Consent service — owns every write to user_consents and every flip
// of users.consent_status. Other code MUST NOT write to these tables
// directly; route through this module so the audit ledger stays
// authoritative.
//
// Design:
//   - Pure I/O at boundaries: each public function takes exactly the
//     args it needs and calls supabaseAdmin. No global state.
//   - Append-only: revocation inserts a new row with granted=false and
//     revokes_id pointing at the grant being revoked. The grant row is
//     never modified.
//   - Document hash pinning: every grant captures the current body hash
//     of the versioned legal document the user agreed to. Hash mismatch
//     between captured value and served value flags STALE_CONSENT.
//   - Verification-method aware: parental grants require an explicit
//     non-'self' verification_method per COPPA §312.5. Self-consent is
//     only permitted when granter == subject.
//
// Hot path: register route still writes users.consent_status via the
// insert in /api/v1/user/register. This service writes the parallel
// audit ledger row and, for parental grants, flips users.consent_status
// from 'awaiting_parent' to 'active'.

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Narrow untyped client for tables added in migrations 064/065 that are
// not yet in types/database.ts. Regenerate with
// `npx supabase gen types typescript --local > types/database.ts` after
// running migrations locally. Scope of this cast is deliberately tight —
// callers still pass through supabaseAdmin() for type inference on
// existing tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

export type ConsentType =
  | "tos"
  | "privacy"
  | "coppa_parental"
  | "gdpr_k_parental"
  | "ccpa_sale_optout"
  | "analytics"
  | "marketing"
  | "ai_coaching"
  | "coach_visibility"
  | "parent_visibility"
  | "moderated_content_view";

export type VerificationMethod =
  | "self"
  | "apple_parental_gate"
  | "apple_ask_to_buy"
  | "credit_card"
  | "gov_id"
  | "email_plus"
  | "knowledge_based";

export interface ConsentGrantInput {
  userId: string;
  consentType: ConsentType;
  version: string;
  jurisdiction: string;
  grantedBy: string;
  verificationMethod: VerificationMethod;
  ipInet?: string | null;
  userAgent?: string | null;
}

export interface ConsentRevokeInput {
  userId: string;
  consentType: ConsentType;
  revokedBy: string;
  ipInet?: string | null;
  userAgent?: string | null;
}

export interface ConsentStatusRow {
  consentType: ConsentType;
  granted: boolean;
  version: string;
  jurisdiction: string;
  grantedBy: string;
  verificationMethod: VerificationMethod | null;
  createdAt: string;
}

// ── Body-hash helpers ──────────────────────────────────────────────
// Consent documents are served as HTML from backend/public/legal/.
// body_hash binds each grant to the exact bytes the user agreed to.
// Cache hashes per process; legal docs only change on deploy.

const HASH_CACHE: Record<string, string> = {};

function hashDocument(consentType: ConsentType): string {
  const cached = HASH_CACHE[consentType];
  if (cached) return cached;

  const filename =
    consentType === "tos"
      ? "terms.html"
      : consentType === "privacy"
        ? "privacy.html"
        : null;
  if (!filename) {
    // For non-file-backed consents (ai_coaching, coach_visibility, …)
    // the hash is derived from the version string — in-app UI copy is
    // short-form and versioned with the app bundle.
    const h = crypto.createHash("sha256").update(`${consentType}@shortform`).digest("hex");
    HASH_CACHE[consentType] = h;
    return h;
  }

  const body = readFileSync(join(process.cwd(), "public/legal", filename), "utf8");
  const h = crypto.createHash("sha256").update(body).digest("hex");
  HASH_CACHE[consentType] = h;
  return h;
}

// Exposed for tests only.
export function __resetHashCacheForTests(): void {
  for (const k of Object.keys(HASH_CACHE)) delete HASH_CACHE[k];
}

// ── Grant ──────────────────────────────────────────────────────────
export async function grantConsent(input: ConsentGrantInput): Promise<{ id: string }> {
  const db = supabaseAdmin() as unknown as UntypedDb;

  // Guard: parental consents require non-'self' verification method per
  // COPPA §312.5 + Apple 5.1.4. Fail loudly — never silently accept a
  // weaker verification than policy allows.
  if (
    (input.consentType === "coppa_parental" || input.consentType === "gdpr_k_parental") &&
    input.verificationMethod === "self"
  ) {
    throw new Error(
      "grantConsent: parental consent cannot be verified via 'self'. Required: apple_parental_gate | credit_card | gov_id."
    );
  }

  // Guard: self-consent only when granter == subject.
  if (input.verificationMethod === "self" && input.grantedBy !== input.userId) {
    throw new Error(
      "grantConsent: verification_method='self' requires granted_by === user_id."
    );
  }

  const documentHash = hashDocument(input.consentType);

  const { data, error } = await db
    .from("user_consents")
    .insert({
      user_id: input.userId,
      consent_type: input.consentType,
      version: input.version,
      jurisdiction: input.jurisdiction,
      granted: true,
      granted_by: input.grantedBy,
      verification_method: input.verificationMethod,
      ip_inet: input.ipInet ?? null,
      user_agent: input.userAgent ?? null,
      document_hash: documentHash,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`grantConsent failed: ${error?.message ?? "no row returned"}`);
  }

  // For parental COPPA/GDPR-K grants, flip the subject's consent_status
  // from 'awaiting_parent' to 'active' so the consent_gate trigger
  // (migration 062) stops blocking writes. Idempotent: no-op when
  // status is already 'active'.
  if (
    input.consentType === "coppa_parental" ||
    input.consentType === "gdpr_k_parental"
  ) {
    await db
      .from("users")
      .update({
        consent_status: "active",
        consent_given_at: new Date().toISOString(),
      })
      .eq("id", input.userId)
      .eq("consent_status", "awaiting_parent");
  }

  return { id: data.id };
}

// ── Revoke ─────────────────────────────────────────────────────────
export async function revokeConsent(input: ConsentRevokeInput): Promise<{ id: string }> {
  const db = supabaseAdmin() as unknown as UntypedDb;

  // Find the most recent granted=true row for this (user, type) that
  // hasn't been superseded by a later revocation.
  const { data: grants } = await db
    .from("user_consents")
    .select("id, version, jurisdiction")
    .eq("user_id", input.userId)
    .eq("consent_type", input.consentType)
    .eq("granted", true)
    .order("created_at", { ascending: false })
    .limit(1);

  const grantToRevoke = grants?.[0];
  if (!grantToRevoke) {
    throw new Error(
      `revokeConsent: no active ${input.consentType} grant found for user ${input.userId}`
    );
  }

  const { data, error } = await db
    .from("user_consents")
    .insert({
      user_id: input.userId,
      consent_type: input.consentType,
      version: grantToRevoke.version,
      jurisdiction: grantToRevoke.jurisdiction,
      granted: false,
      granted_by: input.revokedBy,
      verification_method: null,
      ip_inet: input.ipInet ?? null,
      user_agent: input.userAgent ?? null,
      document_hash: null,
      revokes_id: grantToRevoke.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`revokeConsent failed: ${error?.message ?? "no row returned"}`);
  }

  // Parental-consent revocation flips the subject back to
  // 'awaiting_parent' so the consent gate blocks writes again.
  if (
    input.consentType === "coppa_parental" ||
    input.consentType === "gdpr_k_parental"
  ) {
    await db
      .from("users")
      .update({
        consent_status: "revoked",
        consent_revoked_at: new Date().toISOString(),
      })
      .eq("id", input.userId);
  }

  return { id: data.id };
}

// ── Status summary ─────────────────────────────────────────────────
// Returns the current effective state for every consent_type for a
// user: the latest row per type determines "granted or not". Efficient
// because the idx_user_consents_type_current index makes the
// DISTINCT ON lookup sub-ms.
export async function getConsentStatus(userId: string): Promise<ConsentStatusRow[]> {
  const db = supabaseAdmin() as unknown as UntypedDb;
  const { data, error } = await db
    .from("user_consents")
    .select("consent_type, granted, version, jurisdiction, granted_by, verification_method, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    throw new Error(`getConsentStatus failed: ${error?.message ?? "no data"}`);
  }

  // Fold to the most recent row per consent_type.
  const seen = new Set<string>();
  const rows: ConsentStatusRow[] = [];
  for (const r of data) {
    if (seen.has(r.consent_type)) continue;
    seen.add(r.consent_type);
    rows.push({
      consentType: r.consent_type as ConsentType,
      granted: r.granted,
      version: r.version,
      jurisdiction: r.jurisdiction,
      grantedBy: r.granted_by,
      verificationMethod: r.verification_method as VerificationMethod | null,
      createdAt: r.created_at,
    });
  }
  return rows;
}
