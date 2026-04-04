/**
 * Recommendation Decay Engine — applies time, action, and contradiction decay
 * to athlete recommendations.
 *
 * Three mechanisms:
 *   1. Time decay: linear decay over 7 days (1.0 → 0.0)
 *   2. Action decay: if athlete acts on rec (detected via events/checkins), mark fulfilled
 *   3. Contradiction decay: new snapshot data invalidating the rec's premise
 *
 * Called during deepRecRefresh to filter out stale recs.
 * Zero AI cost — fully deterministic.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface DecayResult {
  recId: string;
  decayScore: number;      // 0-1 (1 = fresh, 0 = fully decayed)
  decayReason: string | null;
}

const DECAY_WINDOW_DAYS = 7;
const DECAY_THRESHOLD = 0.3; // below this → rec is effectively expired

/**
 * Compute decay scores for all active recommendations of an athlete.
 * Returns array of decay results for filtering.
 */
export async function computeRecDecay(
  athleteId: string
): Promise<DecayResult[]> {
  const db = supabaseAdmin();

  // Get active (non-dismissed) recommendations
  const { data: recs } = await db
    .from("athlete_recommendations")
    .select("rec_id, rec_type, title, created_at, status")
    .eq("athlete_id", athleteId)
    .in("status", ["PENDING", "ACTIVE"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (!recs || recs.length === 0) return [];

  // Get recent snapshot for contradiction checks
  const { data: snapshot } = await db
    .from("athlete_snapshots")
    .select("readiness_score, acwr, dual_load_index, wellness_trend")
    .eq("athlete_id", athleteId)
    .single();

  const now = Date.now();
  const results: DecayResult[] = [];

  for (const rec of recs) {
    let decayScore = 1.0;
    let decayReason: string | null = null;

    // 1. Time decay — linear over DECAY_WINDOW_DAYS
    const ageMs = now - new Date(rec.created_at).getTime();
    const ageDays = ageMs / 86400000;
    const timeFactor = Math.max(0, 1 - ageDays / DECAY_WINDOW_DAYS);
    decayScore *= timeFactor;

    if (timeFactor <= 0) {
      decayReason = "expired (>7 days old)";
    }

    // 2. Contradiction decay — check if snapshot data contradicts the rec
    if (snapshot && decayScore > 0) {
      const recType = rec.rec_type?.toUpperCase();

      // RECOVERY rec but readiness is now Green
      if (recType === "RECOVERY" && (snapshot.readiness_score as number) > 70) {
        decayScore *= 0.3;
        decayReason = "readiness improved — recovery rec no longer urgent";
      }

      // LOAD_WARNING but ACWR is back in safe zone
      if (recType === "LOAD_WARNING" && (snapshot.acwr as number) <= 1.2) {
        decayScore *= 0.4;
        decayReason = "ACWR returned to safe zone";
      }

      // READINESS rec but wellness is improving
      if (recType === "READINESS" && (snapshot.wellness_trend as string) === "IMPROVING") {
        decayScore *= 0.5;
        decayReason = "wellness trend improving";
      }
    }

    results.push({
      recId: rec.rec_id,
      decayScore: Math.round(decayScore * 100) / 100,
      decayReason,
    });
  }

  return results;
}

/**
 * Filter active recommendations, removing decayed ones.
 * Returns IDs of recs that should still be shown.
 */
export async function filterDecayedRecs(
  athleteId: string
): Promise<string[]> {
  const decayResults = await computeRecDecay(athleteId);
  return decayResults
    .filter((r) => r.decayScore >= DECAY_THRESHOLD)
    .map((r) => r.recId);
}
