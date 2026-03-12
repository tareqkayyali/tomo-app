import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { UserRole, RelationshipType, PlayerSummary } from "@/types";

export interface RequestUser {
  id: string;
  email: string;
}

/**
 * Extract authenticated user from request headers set by middleware/proxy.
 */
export function getRequestUser(req: NextRequest): RequestUser | null {
  const id = req.headers.get("x-user-id");
  const email = req.headers.get("x-user-email") || "";

  if (!id) return null;
  return { id, email };
}

/**
 * Require authentication. Returns the user or an error response.
 */
export function requireAuth(
  req: NextRequest
): { user: RequestUser } | { error: NextResponse } {
  const user = getRequestUser(req);
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user };
}

// ═══════════════════════════════════════════════════════════════════
//  Role-based authorization helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Check that the authenticated user has one of the allowed roles.
 * Returns the user's role or an error response.
 */
export async function requireRole(
  userId: string,
  allowedRoles: UserRole[]
): Promise<{ role: UserRole } | { error: NextResponse }> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return {
      error: NextResponse.json({ error: "User not found" }, { status: 404 }),
    };
  }

  const role = data.role as UserRole;
  if (!allowedRoles.includes(role)) {
    return {
      error: NextResponse.json(
        { error: `Role '${role}' is not authorized for this action` },
        { status: 403 }
      ),
    };
  }

  return { role };
}

/**
 * Verify that a guardian (coach/parent) has an active relationship with a player.
 * Optionally filter by relationship type.
 */
export async function requireRelationship(
  guardianId: string,
  playerId: string,
  allowedTypes?: RelationshipType[]
): Promise<{ relationshipId: string } | { error: NextResponse }> {
  const db = supabaseAdmin();
  let query = db
    .from("relationships")
    .select("id, relationship_type")
    .eq("guardian_id", guardianId)
    .eq("player_id", playerId)
    .eq("status", "accepted");

  if (allowedTypes && allowedTypes.length > 0) {
    query = query.in("relationship_type", allowedTypes);
  }

  const { data, error } = await query.limit(1).single();

  if (error || !data) {
    return {
      error: NextResponse.json(
        { error: "No active relationship with this player" },
        { status: 403 }
      ),
    };
  }

  return { relationshipId: data.id };
}

/**
 * Get all players linked to a guardian (coach or parent) with summary data.
 */
export async function getLinkedPlayers(
  guardianId: string
): Promise<PlayerSummary[]> {
  const db = supabaseAdmin();

  // Get all accepted relationships for this guardian
  const { data: rels } = await db
    .from("relationships")
    .select("player_id")
    .eq("guardian_id", guardianId)
    .eq("status", "accepted");

  if (!rels || rels.length === 0) return [];

  const playerIds = rels.map((r) => r.player_id);

  // Fetch player profiles
  const { data: players } = await db
    .from("users")
    .select(
      "id, name, email, sport, age, current_streak, total_points"
    )
    .in("id", playerIds);

  if (!players) return [];

  // Fetch latest checkins for readiness
  const today = new Date().toISOString().split("T")[0];
  const { data: checkins } = await db
    .from("checkins")
    .select("user_id, readiness, date")
    .in("user_id", playerIds)
    .eq("date", today);

  const checkinMap = new Map(
    (checkins || []).map((c) => [c.user_id, c])
  );

  return players.map((p) => {
    const checkin = checkinMap.get(p.id);
    return {
      id: p.id,
      name: p.name || "",
      email: p.email || "",
      sport: (p.sport || "football") as any,
      age: p.age ?? undefined,
      readiness: checkin?.readiness as any ?? null,
      currentStreak: p.current_streak || 0,
      totalPoints: p.total_points || 0,
      lastCheckinDate: checkin?.date ?? null,
    };
  });
}

/**
 * Get all guardians (coaches/parents) linked to a player.
 */
export async function getLinkedGuardians(playerId: string) {
  const db = supabaseAdmin();

  const { data: rels } = await db
    .from("relationships")
    .select("guardian_id, relationship_type")
    .eq("player_id", playerId)
    .eq("status", "accepted");

  if (!rels || rels.length === 0) return [];

  const guardianIds = rels.map((r) => r.guardian_id);

  const { data: guardians } = await db
    .from("users")
    .select("id, name, email, role, display_role")
    .in("id", guardianIds);

  if (!guardians) return [];

  const relMap = new Map(
    rels.map((r) => [r.guardian_id, r.relationship_type])
  );

  return guardians.map((g) => ({
    id: g.id,
    name: g.name || "",
    email: g.email || "",
    role: g.role as UserRole,
    displayRole: g.display_role,
    relationshipType: relMap.get(g.id) as RelationshipType,
  }));
}
