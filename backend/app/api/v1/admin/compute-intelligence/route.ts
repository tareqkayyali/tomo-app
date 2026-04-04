/**
 * POST /api/v1/admin/compute-intelligence
 *
 * Recomputes TIS, behavioral fingerprint, and adaptation coefficient
 * for all athletes (or a specific one). Persists results to DB.
 *
 * Body: { athlete_id?: string } — if omitted, recomputes ALL athletes.
 *
 * Designed to be called:
 *   - Manually from CMS admin panel
 *   - Via external cron (EasyCron, GitHub Actions) for weekly recomputation
 *   - Via Railway cron if configured
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { persistTomoIntelligenceScore } from "@/services/agents/tomoIntelligenceScore";
import { persistBehavioralFingerprint } from "@/services/agents/behavioralFingerprint";
import { computeAdaptationProfile } from "@/services/agents/adaptationIntelligence";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const db = supabaseAdmin();

    if (body.athlete_id) {
      const result = await computeForAthlete(body.athlete_id, db);
      return NextResponse.json({ ok: true, athlete_id: body.athlete_id, ...result });
    }

    // All athletes with recent activity (checkins in last 28 days)
    const { data: athletes } = await db
      .from("checkins")
      .select("user_id")
      .gte("created_at", new Date(Date.now() - 28 * 86400000).toISOString());

    if (!athletes || athletes.length === 0) {
      return NextResponse.json({ ok: true, message: "No active athletes", count: 0 });
    }

    const uniqueIds = [...new Set(athletes.map((a: any) => a.user_id))];

    const results: any[] = [];
    for (const id of uniqueIds) {
      try {
        const result = await computeForAthlete(id as string, db);
        results.push({ id, ...result });
      } catch (err) {
        results.push({ id, error: String(err) });
      }
    }

    return NextResponse.json({
      ok: true,
      count: results.length,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to compute intelligence scores", detail: String(err) },
      { status: 500 }
    );
  }
}

async function computeForAthlete(athleteId: string, db: any) {
  // Run all three computations in parallel
  const [tisResult, fpResult, adaptResult] = await Promise.allSettled([
    persistTomoIntelligenceScore(athleteId),
    persistBehavioralFingerprint(athleteId),
    computeAdaptationProfile(athleteId),
  ]);

  // Persist adaptation coefficient if computed
  const adaptation = adaptResult.status === "fulfilled" ? adaptResult.value : null;
  if (adaptation) {
    await db
      .from("athlete_snapshots")
      .update({ adaptation_coefficient: adaptation.coefficient })
      .eq("athlete_id", athleteId);
  }

  return {
    tis: tisResult.status === "fulfilled" ? tisResult.value.score : null,
    fingerprint: fpResult.status === "fulfilled" ? fpResult.value.coachingApproach : null,
    adaptation: adaptation ? { coefficient: adaptation.coefficient, type: adaptation.type } : null,
  };
}
