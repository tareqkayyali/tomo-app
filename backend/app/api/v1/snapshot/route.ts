/**
 * GET /api/v1/snapshot
 *
 * Returns the authenticated athlete's pre-computed snapshot (Layer 2).
 * For coaches/parents: pass ?athleteId=xxx to read a linked athlete's snapshot.
 *
 * Query params:
 *   athleteId (optional) — target athlete ID (required for coach/parent)
 *
 * Response:
 *   200: { snapshot: Partial<AthleteSnapshot> }
 *   404: { error: "No snapshot found" }
 *   403: { error: "Not authorized..." }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readSnapshot } from "@/services/events/snapshot/snapshotReader";
import type { TriangleRole } from "@/services/events/types";

export async function GET(request: NextRequest) {
  try {
    // Auth is handled by proxy.ts — userId comes from the verified token
    const userId = request.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetAthleteId = searchParams.get("athleteId") || userId;

    // Determine role
    let role: TriangleRole = "ATHLETE";

    if (targetAthleteId !== userId) {
      // Requesting another user's snapshot — check relationship
      const db = supabaseAdmin();
      const { data: rel } = await db
        .from("relationships")
        .select("relationship_type")
        .eq("guardian_id", userId)
        .eq("player_id", targetAthleteId)
        .eq("status", "accepted")
        .single();

      if (!rel) {
        return NextResponse.json(
          { error: "Not authorized to view this athlete's snapshot" },
          { status: 403 }
        );
      }

      role = rel.relationship_type === "coach" ? "COACH" : "PARENT";
    }

    const snapshot = await readSnapshot(targetAthleteId, role);

    if (!snapshot) {
      return NextResponse.json(
        { error: "No snapshot found — it will be created after the first event" },
        { status: 404 }
      );
    }

    return NextResponse.json({ snapshot }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (err: any) {
    console.error('[snapshot] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
