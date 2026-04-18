import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readMultipleSnapshots } from "@/services/events/snapshot/snapshotReader";
import type { TriangleRole } from "@/services/events/types";
import type { UserRole, RelationshipType, PlayerSummary, AgeTier } from "@/types";
import { ageTierFromDob } from "@/services/compliance/ageTier";

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
 * Enriches profile data with pre-computed snapshot fields (Layer 2),
 * filtered by the requesting role's visibility matrix.
 */
export async function getLinkedPlayers(
  guardianId: string,
  role: TriangleRole = "COACH",
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

  // Fetch player profiles + snapshots in parallel.
  // Select date_of_birth so we can derive age_tier for downstream
  // authority checks (parent supersedes coach at T1/T2, etc.).
  const [profilesRes, snapshots] = await Promise.all([
    db
      .from("users")
      .select("id, name, email, sport, age, date_of_birth, current_streak, total_points")
      .in("id", playerIds),
    readMultipleSnapshots(playerIds, role),
  ]);

  const players = profilesRes.data;
  if (!players) return [];

  // Build snapshot lookup by athlete_id
  const snapshotMap = new Map(
    snapshots.map((s) => [s.athlete_id, s])
  );

  return players.map((p) => {
    const snap = snapshotMap.get(p.id);
    const dob = p.date_of_birth ? new Date(p.date_of_birth) : null;
    const ageTier: AgeTier = ageTierFromDob(dob);
    return {
      id: p.id,
      name: p.name || "",
      email: p.email || "",
      sport: (p.sport || "football") as PlayerSummary["sport"],
      age: p.age ?? undefined,
      ageTier,
      currentStreak: p.current_streak || 0,
      totalPoints: p.total_points || 0,
      // Snapshot-powered fields (role-filtered)
      readinessRag: (snap?.readiness_rag as string) ?? null,
      acwr: (snap?.acwr as number) ?? null,
      dualLoadIndex: (snap?.dual_load_index as number) ?? null,
      wellnessTrend: (snap?.wellness_trend as string) ?? null,
      lastSessionAt: (snap?.last_session_at as string) ?? null,
      sessionsTotal: (snap?.sessions_total as number) ?? null,
      // Legacy compat
      readiness: (snap?.readiness_rag as any) ?? null,
      lastCheckinDate: (snap?.last_checkin_at as string) ?? null,
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
