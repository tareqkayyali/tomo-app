/**
 * GET /api/v1/admin/intelligence
 *
 * Returns intelligence scores (TIS, adaptation, behavioral fingerprint) for all athletes.
 * Used by the CMS Intelligence Scores admin page.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const db = supabaseAdmin();

    // Join snapshots with users for name/sport, and behavioral fingerprint
    const { data: snapshots } = await db
      .from("athlete_snapshots")
      .select("athlete_id, tomo_intelligence_score, adaptation_coefficient")
      .order("snapshot_at", { ascending: false });

    if (!snapshots || snapshots.length === 0) {
      return NextResponse.json({ athletes: [] });
    }

    // Get user profiles for names
    const athleteIds = snapshots.map((s: any) => s.athlete_id);
    const { data: profiles } = await db
      .from("users")
      .select("id, name, sport")
      .in("id", athleteIds);

    // Get behavioral fingerprints
    const { data: fingerprints } = await (db as any)
      .from("athlete_behavioral_fingerprint")
      .select("*")
      .in("athlete_id", athleteIds);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const fpMap = new Map((fingerprints ?? []).map((f: any) => [f.athlete_id, f]));

    const athletes = snapshots.map((s: any) => {
      const profile = profileMap.get(s.athlete_id);
      const fp: any = fpMap.get(s.athlete_id);
      return {
        athlete_id: s.athlete_id,
        name: profile?.name ?? null,
        sport: profile?.sport ?? null,
        tomo_intelligence_score: s.tomo_intelligence_score,
        adaptation_coefficient: s.adaptation_coefficient,
        compliance_rate: fp?.compliance_rate ?? null,
        session_consistency: fp?.session_consistency ?? null,
        recovery_response: fp?.recovery_response ?? null,
        academic_athletic_balance: fp?.academic_athletic_balance ?? null,
        coaching_approach: fp?.coaching_approach ?? null,
      };
    });

    return NextResponse.json({ athletes });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch intelligence data", detail: String(err) },
      { status: 500 }
    );
  }
}
