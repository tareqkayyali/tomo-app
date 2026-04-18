/**
 * Relationship Service
 * Handles invite code generation, acceptance, listing, and revocation
 * for the multi-role (player/coach/parent) relationship system.
 */

import { supabaseAdmin } from "../lib/supabase/admin";
import { createNotification } from "./notificationService";
import { grantConsent } from "./consent/consentService";
import { ageFromDob, parseDobOrThrow } from "./compliance";
import type { RelationshipType } from "../types";

// ═══════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════

const CODE_LENGTH = 6;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
const EXPIRY_DAYS = 7;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
}

// ═══════════════════════════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a 6-char alphanumeric invite code.
 * Stored in invite_codes table, expires in 7 days.
 */
export async function generateInviteCode(
  creatorId: string,
  targetRole: "coach" | "parent"
): Promise<{ code: string; expiresAt: string }> {
  const db = supabaseAdmin();

  const code = generateCode();
  const expiresAt = new Date(
    Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await db.from("invite_codes").insert({
    code,
    creator_id: creatorId,
    target_role: targetRole,
    expires_at: expiresAt,
  });

  if (error) {
    // Handle unlikely collision — retry once
    if (error.code === "23505") {
      const retryCode = generateCode();
      const { error: retryError } = await db.from("invite_codes").insert({
        code: retryCode,
        creator_id: creatorId,
        target_role: targetRole,
        expires_at: expiresAt,
      });
      if (retryError) throw new Error(`Invite code insert failed: ${retryError.message}`);
      return { code: retryCode, expiresAt };
    }
    throw new Error(`Invite code insert failed: ${error.message}`);
  }

  return { code, expiresAt };
}

/**
 * Accept an invite code.
 * Validates code, creates relationship with status 'accepted', marks code as used.
 */
export async function acceptInviteCode(
  playerId: string,
  code: string
): Promise<{ relationshipId: string; guardianId: string; relationshipType: RelationshipType }> {
  const db = supabaseAdmin();

  // 1. Look up the invite code
  const { data: invite, error: inviteError } = await db
    .from("invite_codes")
    .select("*")
    .eq("code", code.toUpperCase())
    .is("used_by", null)
    .single();

  if (inviteError || !invite) {
    throw new Error("Invalid or already-used invite code");
  }

  // 2. Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    throw new Error("Invite code has expired");
  }

  // 3. Prevent self-linking
  if (invite.creator_id === playerId) {
    throw new Error("Cannot accept your own invite code");
  }

  // 4. Check for existing active relationship
  const { data: existing } = await db
    .from("relationships")
    .select("id")
    .eq("guardian_id", invite.creator_id)
    .eq("player_id", playerId)
    .eq("status", "accepted")
    .limit(1);

  if (existing && existing.length > 0) {
    throw new Error("Relationship already exists with this guardian");
  }

  // 5. Create the relationship
  const { data: rel, error: relError } = await db
    .from("relationships")
    .insert({
      guardian_id: invite.creator_id,
      player_id: playerId,
      relationship_type: invite.target_role,
      status: "accepted",
      invite_code: invite.code,
      accepted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (relError || !rel) {
    throw new Error(`Failed to create relationship: ${relError?.message}`);
  }

  // 6. Mark invite code as used
  await db
    .from("invite_codes")
    .update({ used_by: playerId })
    .eq("code", invite.code);

  return {
    relationshipId: rel.id,
    guardianId: invite.creator_id,
    relationshipType: invite.target_role as RelationshipType,
  };
}

/**
 * List all relationships for a user (as guardian or player), joined with user names.
 */
export async function listRelationships(userId: string) {
  const db = supabaseAdmin();

  // Fetch relationships where user is guardian OR player
  const { data: asGuardian, error: gErr } = await db
    .from("relationships")
    .select("id, guardian_id, player_id, relationship_type, status, created_at, accepted_at")
    .eq("guardian_id", userId)
    .neq("status", "revoked");

  const { data: asPlayer, error: pErr } = await db
    .from("relationships")
    .select("id, guardian_id, player_id, relationship_type, status, created_at, accepted_at")
    .eq("player_id", userId)
    .neq("status", "revoked");

  if (gErr) throw new Error(`Failed to fetch guardian relationships: ${gErr.message}`);
  if (pErr) throw new Error(`Failed to fetch player relationships: ${pErr.message}`);

  const allRels = [...(asGuardian || []), ...(asPlayer || [])];
  if (allRels.length === 0) return [];

  // Collect all unique user IDs we need names for
  const userIds = new Set<string>();
  for (const r of allRels) {
    userIds.add(r.guardian_id);
    userIds.add(r.player_id);
  }

  const { data: users } = await db
    .from("users")
    .select("id, name, email, role")
    .in("id", Array.from(userIds));

  const userMap = new Map(
    (users || []).map((u) => [u.id, u])
  );

  return allRels.map((r) => {
    const guardian = userMap.get(r.guardian_id);
    const player = userMap.get(r.player_id);
    return {
      id: r.id,
      relationshipType: r.relationship_type,
      status: r.status,
      createdAt: r.created_at,
      acceptedAt: r.accepted_at,
      guardian: {
        id: r.guardian_id,
        name: guardian?.name || "",
        email: guardian?.email || "",
        role: guardian?.role || "",
      },
      player: {
        id: r.player_id,
        name: player?.name || "",
        email: player?.email || "",
        role: player?.role || "",
      },
    };
  });
}

/**
 * Revoke a relationship. Only a participant (guardian or player) can revoke.
 */
export async function revokeRelationship(
  userId: string,
  relationshipId: string
): Promise<void> {
  const db = supabaseAdmin();

  // Verify user is a participant
  const { data: rel, error } = await db
    .from("relationships")
    .select("id, guardian_id, player_id, status")
    .eq("id", relationshipId)
    .single();

  if (error || !rel) {
    throw new Error("Relationship not found");
  }

  if (rel.guardian_id !== userId && rel.player_id !== userId) {
    throw new Error("Not authorized to revoke this relationship");
  }

  if (rel.status === "revoked") {
    throw new Error("Relationship is already revoked");
  }

  const { error: updateError } = await db
    .from("relationships")
    .update({ status: "revoked" })
    .eq("id", relationshipId);

  if (updateError) {
    throw new Error(`Failed to revoke relationship: ${updateError.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Link by Email (Parent or Coach → Player)
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a pending relationship by looking up a player's email.
 * Works for both parent and coach roles.
 * Sends a notification to the player for confirmation.
 */
export async function createRelationshipByEmail(
  guardianId: string,
  playerEmail: string,
  callerRole: "parent" | "coach" = "parent"
): Promise<{ relationshipId: string; playerId: string; playerName: string }> {
  const db = supabaseAdmin();

  // 1. Look up guardian name for the notification
  const { data: guardian } = await db
    .from("users")
    .select("name")
    .eq("id", guardianId)
    .single();

  const guardianName = guardian?.name || (callerRole === "coach" ? "A coach" : "A parent");

  // 2. Look up player by email
  const { data: player, error: playerError } = await db
    .from("users")
    .select("id, name, role")
    .eq("email", playerEmail.toLowerCase().trim())
    .single();

  if (playerError || !player) {
    throw new Error("No player account found with that email");
  }

  if (player.role !== "player") {
    throw new Error("That account is not a player account");
  }

  // 3. Prevent self-linking
  if (player.id === guardianId) {
    throw new Error("Cannot link to yourself");
  }

  // 4. Check for existing active or pending relationship
  const { data: existing } = await db
    .from("relationships")
    .select("id, status")
    .eq("guardian_id", guardianId)
    .eq("player_id", player.id)
    .in("status", ["accepted", "pending"])
    .limit(1);

  if (existing && existing.length > 0) {
    const status = existing[0].status;
    if (status === "accepted") {
      throw new Error("You are already linked with this player");
    }
    throw new Error("A link request is already pending with this player");
  }

  // 5. Create pending relationship
  const { data: rel, error: relError } = await db
    .from("relationships")
    .insert({
      guardian_id: guardianId,
      player_id: player.id,
      relationship_type: callerRole,
      status: "pending",
    })
    .select("id")
    .single();

  if (relError || !rel) {
    throw new Error(`Failed to create relationship: ${relError?.message}`);
  }

  // 6. Send notification to the player
  const notifType = callerRole === "coach" ? "coach_link_request" : "parent_link_request";
  const roleLabel = callerRole === "coach" ? "Coach" : "Parent";

  await createNotification({
    userId: player.id,
    type: notifType,
    title: `${roleLabel} link request`,
    body: `${guardianName} wants to link as your ${callerRole}`,
    data: {
      relationshipId: rel.id,
      guardianId,
      guardianName,
    },
  });

  return {
    relationshipId: rel.id,
    playerId: player.id,
    playerName: player.name || "",
  };
}

/**
 * Player accepts a pending link request (parent or coach).
 */
export async function acceptLinkRequest(
  playerId: string,
  relationshipId: string
): Promise<void> {
  const db = supabaseAdmin();

  // Verify the relationship
  const { data: rel, error } = await db
    .from("relationships")
    .select("id, guardian_id, player_id, status, relationship_type")
    .eq("id", relationshipId)
    .single();

  if (error || !rel) {
    throw new Error("Relationship not found");
  }

  if (rel.player_id !== playerId) {
    throw new Error("Not authorized to respond to this request");
  }

  if (rel.status !== "pending") {
    throw new Error("This request has already been resolved");
  }

  // Update to accepted
  const { error: updateError } = await db
    .from("relationships")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", relationshipId);

  if (updateError) {
    throw new Error(`Failed to accept link: ${updateError.message}`);
  }

  // Get player name for notification
  const { data: player } = await db
    .from("users")
    .select("name")
    .eq("id", playerId)
    .single();

  const roleLabel = rel.relationship_type === "coach" ? "coach" : "parent";

  // Notify the guardian
  await createNotification({
    userId: rel.guardian_id,
    type: "relationship_accepted",
    title: "Link confirmed",
    body: `${player?.name || "The player"} confirmed your ${roleLabel} link`,
    data: { relationshipId },
  });
}

// Backward-compatible alias
export const acceptParentLink = acceptLinkRequest;

/**
 * Player declines a pending link request (parent or coach).
 */
export async function declineLinkRequest(
  playerId: string,
  relationshipId: string
): Promise<void> {
  const db = supabaseAdmin();

  // Verify the relationship
  const { data: rel, error } = await db
    .from("relationships")
    .select("id, guardian_id, player_id, status, relationship_type")
    .eq("id", relationshipId)
    .single();

  if (error || !rel) {
    throw new Error("Relationship not found");
  }

  if (rel.player_id !== playerId) {
    throw new Error("Not authorized to respond to this request");
  }

  if (rel.status !== "pending") {
    throw new Error("This request has already been resolved");
  }

  // Update to revoked
  const { error: updateError } = await db
    .from("relationships")
    .update({ status: "revoked" })
    .eq("id", relationshipId);

  if (updateError) {
    throw new Error(`Failed to decline link: ${updateError.message}`);
  }

  // Get player name for notification
  const { data: player } = await db
    .from("users")
    .select("name")
    .eq("id", playerId)
    .single();

  const roleLabel = rel.relationship_type === "coach" ? "coach" : "parent";

  // Notify the guardian
  await createNotification({
    userId: rel.guardian_id,
    type: "relationship_declined",
    title: "Link declined",
    body: `${player?.name || "The player"} declined your ${roleLabel} link`,
    data: { relationshipId },
  });
}

// Backward-compatible alias
export const declineParentLink = declineLinkRequest;

// ═══════════════════════════════════════════════════════════════════
//  Phase 3: Child-initiated parent consent flow
// ═══════════════════════════════════════════════════════════════════

/**
 * Accept a child-initiated invite code as the guardian (parent).
 *
 * Phase 3 flow (mirror of acceptInviteCode):
 *   - The CHILD generated the code via /relationships/invite-parent and
 *     shared it out-of-band (SMS, in-person).
 *   - The PARENT enters it here. The relationship is created with
 *     guardian_id = parent (accepter), player_id = child (creator).
 *   - If the child has consent_status = 'awaiting_parent', we also
 *     write a parental consent row via grantConsent(), which flips the
 *     child's consent_status to 'active' so the trigger in migration
 *     062 stops blocking their writes.
 *
 * Returns the relationship id + the child's user id so the parent
 * app can navigate to the child's dashboard.
 */
export async function acceptAsGuardian(
  guardianId: string,
  code: string,
  opts?: { ipInet?: string | null; userAgent?: string | null }
): Promise<{ relationshipId: string; childId: string; consentGranted: boolean }> {
  const db = supabaseAdmin();

  const { data: invite, error: inviteError } = await db
    .from("invite_codes")
    .select("*")
    .eq("code", code.toUpperCase())
    .is("used_by", null)
    .single();

  if (inviteError || !invite) {
    throw new Error("Invalid or already-used invite code");
  }
  if (new Date(invite.expires_at) < new Date()) {
    throw new Error("Invite code has expired");
  }
  if (invite.creator_id === guardianId) {
    throw new Error("Cannot accept your own invite code");
  }
  // This route is exclusively for child-initiated codes. The child
  // creates with target_role='parent', so any other value here means
  // the parent is on the wrong path (they should use /accept).
  if (invite.target_role !== "parent") {
    throw new Error("This code is not a parent-consent invite");
  }

  // Look up the creator (expected role: player, possibly in
  // awaiting_parent state).
  const { data: child, error: childError } = await db
    .from("users")
    .select("id, role, consent_status, date_of_birth, region_code, privacy_version")
    .eq("id", invite.creator_id)
    .single();

  if (childError || !child) {
    throw new Error("Child account not found");
  }
  if (child.role !== "player") {
    throw new Error("This invite is not from a player account");
  }

  // Duplicate-relationship guard (same pair, both directions).
  const { data: existing } = await db
    .from("relationships")
    .select("id")
    .eq("guardian_id", guardianId)
    .eq("player_id", child.id)
    .eq("status", "accepted")
    .limit(1);
  if (existing && existing.length > 0) {
    throw new Error("You are already linked to this athlete");
  }

  const { data: rel, error: relError } = await db
    .from("relationships")
    .insert({
      guardian_id: guardianId,
      player_id: child.id,
      relationship_type: "parent",
      status: "accepted",
      invite_code: invite.code,
      accepted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (relError || !rel) {
    throw new Error(`Failed to create relationship: ${relError?.message}`);
  }

  await db.from("invite_codes").update({ used_by: guardianId }).eq("code", invite.code);

  // Wire parental consent if the child was blocked on it. We pick the
  // consent_type by age: < 13 = COPPA, otherwise GDPR-K (server-side
  // floor at 16 is what the signup path already enforces for EU/UK).
  let consentGranted = false;
  if (child.consent_status === "awaiting_parent" && child.date_of_birth) {
    try {
      const age = ageFromDob(parseDobOrThrow(child.date_of_birth));
      const consentType = age < 13 ? "coppa_parental" : "gdpr_k_parental";
      // Version string mirrors whatever the child accepted at signup;
      // if missing, fall back to "1.0.0" so the audit row is still
      // written rather than silently skipped.
      const version = child.privacy_version ?? "1.0.0";
      await grantConsent({
        userId: child.id,
        consentType,
        version,
        jurisdiction: child.region_code ?? "GLOBAL",
        grantedBy: guardianId,
        verificationMethod: "email_plus",
        ipInet: opts?.ipInet ?? null,
        userAgent: opts?.userAgent ?? null,
      });
      consentGranted = true;
    } catch (err) {
      // Don't fail the relationship creation on consent-wiring hiccup —
      // relationship is real; consent can be retried from the parent
      // portal. Log for observability.
      console.error("[acceptAsGuardian] grantConsent failed:", err);
    }
  }

  // Notify the child so they know the parent is linked + consented.
  try {
    await createNotification({
      userId: child.id,
      type: "parent_consent_granted",
      title: "Your parent is set up",
      body: consentGranted
        ? "Consent granted — you can now use all of Tomo."
        : "Your parent is linked to your account.",
      data: { relationshipId: rel.id, guardianId },
    });
  } catch {
    // Notification best-effort.
  }

  return { relationshipId: rel.id, childId: child.id, consentGranted };
}

