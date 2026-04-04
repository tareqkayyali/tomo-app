/**
 * Behavioral Fingerprint — computes athlete behavioral dimensions
 * from longitudinal memory, check-ins, and snapshots.
 *
 * Dimensions:
 *   - complianceRate: check-in frequency / expected frequency (0-1)
 *   - sessionConsistency: low variance = consistent training pattern (0-1)
 *   - recoveryResponse: how quickly readiness bounces back after rest (0-1)
 *   - academicAthleticBalance: correlation between academic load and training (0-1)
 *
 * Zero AI cost — fully deterministic computation.
 * Designed for weekly pg_cron recomputation + system prompt injection.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface BehavioralFingerprint {
  complianceRate: number;       // 0-1
  sessionConsistency: number;   // 0-1 (1 = very consistent)
  recoveryResponse: number;     // 0-1 (1 = fast recovery)
  academicAthleticBalance: number; // 0-1 (1 = well balanced)
  coachingApproach: string;     // Human-readable coaching recommendation
  computedAt: string;
}

/**
 * Compute the behavioral fingerprint for an athlete.
 * Reads from checkins (28 days), athlete_daily_load (28 days), athlete_snapshots.
 */
export async function computeBehavioralFingerprint(
  athleteId: string
): Promise<BehavioralFingerprint> {
  const db = supabaseAdmin();
  const twentyEightDaysAgo = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);

  // Parallel queries
  const [checkinsRes, loadsRes, memoryRes] = await Promise.allSettled([
    db.from("checkins")
      .select("created_at, readiness_score")
      .eq("user_id", athleteId)
      .gte("created_at", twentyEightDaysAgo)
      .order("created_at", { ascending: true }),
    db.from("athlete_daily_load")
      .select("load_date, training_load_au, academic_load_au")
      .eq("athlete_id", athleteId)
      .gte("load_date", twentyEightDaysAgo)
      .order("load_date", { ascending: true }),
    (db as any).from("athlete_longitudinal_memory")
      .select("memory")
      .eq("athlete_id", athleteId)
      .single(),
  ]);

  const checkins = checkinsRes.status === "fulfilled" ? (checkinsRes.value.data ?? []) : [];
  const loads = loadsRes.status === "fulfilled" ? (loadsRes.value.data ?? []) : [];

  // 1. Compliance rate: checkins / 28 expected days
  const complianceRate = Math.min(1, checkins.length / 28);

  // 2. Session consistency: inverse of coefficient of variation of weekly training load
  const weeklyLoads: number[] = [];
  for (let w = 0; w < 4; w++) {
    const weekStart = new Date(Date.now() - (w + 1) * 7 * 86400000).toISOString().slice(0, 10);
    const weekEnd = new Date(Date.now() - w * 7 * 86400000).toISOString().slice(0, 10);
    const weekSum = loads
      .filter((l: any) => l.load_date >= weekStart && l.load_date < weekEnd)
      .reduce((s: number, l: any) => s + (l.training_load_au || 0), 0);
    weeklyLoads.push(weekSum);
  }

  let sessionConsistency = 0.5; // default
  if (weeklyLoads.length >= 2) {
    const mean = weeklyLoads.reduce((a, b) => a + b, 0) / weeklyLoads.length;
    if (mean > 0) {
      const variance = weeklyLoads.reduce((s, v) => s + (v - mean) ** 2, 0) / weeklyLoads.length;
      const cv = Math.sqrt(variance) / mean; // coefficient of variation
      sessionConsistency = Math.max(0, Math.min(1, 1 - cv)); // lower cv = more consistent
    }
  }

  // 3. Recovery response: measure readiness bounce-back after low days
  let recoveryResponse = 0.5; // default
  if (checkins.length >= 5) {
    const scores = checkins.map((c: any) => c.readiness_score ?? 50);
    let rebounds = 0;
    let lowDays = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i - 1] < 40) { // low readiness day
        lowDays++;
        if (scores[i] > scores[i - 1] + 10) rebounds++; // bounce back next day
      }
    }
    recoveryResponse = lowDays > 0 ? Math.min(1, rebounds / lowDays) : 0.7; // no low days = decent default
  }

  // 4. Academic-athletic balance: 1 - abs(normalized academic - normalized athletic)
  let academicAthleticBalance = 0.5;
  if (loads.length >= 7) {
    const totalAthletic = loads.reduce((s: number, l: any) => s + (l.training_load_au || 0), 0);
    const totalAcademic = loads.reduce((s: number, l: any) => s + (l.academic_load_au || 0), 0);
    const maxLoad = Math.max(totalAthletic, totalAcademic, 1);
    const normAthletic = totalAthletic / maxLoad;
    const normAcademic = totalAcademic / maxLoad;
    academicAthleticBalance = Math.max(0, 1 - Math.abs(normAthletic - normAcademic));
  }

  // Build coaching approach
  const traits: string[] = [];
  if (complianceRate >= 0.8) traits.push("highly compliant");
  else if (complianceRate < 0.5) traits.push("needs check-in encouragement");
  if (sessionConsistency >= 0.7) traits.push("consistent trainer");
  else if (sessionConsistency < 0.4) traits.push("irregular training pattern");
  if (recoveryResponse >= 0.6) traits.push("fast recovery responder");
  else traits.push("slow recovery — needs extra rest days");
  if (academicAthleticBalance < 0.4) traits.push("academic-first tendency during exam periods");

  const coachingApproach = traits.length > 0
    ? `This athlete is ${traits.join(", ")}. Adjust coaching accordingly.`
    : "Insufficient data for behavioral profiling.";

  return {
    complianceRate: Math.round(complianceRate * 100) / 100,
    sessionConsistency: Math.round(sessionConsistency * 100) / 100,
    recoveryResponse: Math.round(recoveryResponse * 100) / 100,
    academicAthleticBalance: Math.round(academicAthleticBalance * 100) / 100,
    coachingApproach,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Compute and persist the behavioral fingerprint to the DB.
 */
export async function persistBehavioralFingerprint(athleteId: string): Promise<BehavioralFingerprint> {
  const fp = await computeBehavioralFingerprint(athleteId);
  const db = supabaseAdmin();
  await (db as any)
    .from("athlete_behavioral_fingerprint")
    .upsert({
      athlete_id: athleteId,
      compliance_rate: fp.complianceRate,
      session_consistency: fp.sessionConsistency,
      recovery_response: fp.recoveryResponse,
      academic_athletic_balance: fp.academicAthleticBalance,
      coaching_approach: fp.coachingApproach,
      computed_at: fp.computedAt,
    }, { onConflict: "athlete_id" });
  return fp;
}

/**
 * Build a system prompt block from the behavioral fingerprint.
 * Returns empty string if fingerprint is unavailable.
 */
export function buildBehavioralPromptBlock(fp: BehavioralFingerprint | null): string {
  if (!fp) return "";

  return `\n\nBEHAVIORAL PROFILE:
Compliance: ${Math.round(fp.complianceRate * 100)}% | Consistency: ${Math.round(fp.sessionConsistency * 100)}% | Recovery: ${Math.round(fp.recoveryResponse * 100)}% | Balance: ${Math.round(fp.academicAthleticBalance * 100)}%
${fp.coachingApproach}`;
}
