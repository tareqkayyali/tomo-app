/**
 * Relationship Service
 * Handles invite code generation, acceptance, listing, and revocation
 * for the multi-role (player/coach/parent) relationship system.
 */

import { supabaseAdmin } from "../lib/supabase/admin";
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
