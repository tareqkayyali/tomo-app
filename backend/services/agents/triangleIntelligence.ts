/**
 * Triangle Intelligence Layer (TIL) — computes the Athletic-Academic-Wellbeing
 * triangle state for system prompt injection.
 *
 * Each vertex is scored 0-100. Balance measures how equilateral the triangle is.
 * Imbalance direction identifies which vertex needs attention.
 *
 * Data sources: athlete_snapshots, athlete_daily_load, checkins.
 * Zero AI cost — fully deterministic.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface TriangleState {
  athletic: number;      // 0-100
  academic: number;      // 0-100
  wellbeing: number;     // 0-100
  balance: number;       // 0-100 (100 = perfect equilateral)
  imbalanceDirection: "athletic" | "academic" | "wellbeing" | "balanced";
  recommendation: string;
}

/**
 * Compute the triangle state for an athlete.
 */
export async function computeTriangleState(athleteId: string): Promise<TriangleState | null> {
  const db = supabaseAdmin();

  const [snapshotRes, checkinsRes] = await Promise.allSettled([
    db.from("athlete_snapshots")
      .select("acwr, athletic_load_7day, academic_load_7day, dual_load_index, wellness_7day_avg, wellness_trend, readiness_score, streak_days")
      .eq("athlete_id", athleteId)
      .single(),
    db.from("checkins")
      .select("readiness_score, energy_level, mood_score, sleep_hours")
      .eq("user_id", athleteId)
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(7),
  ]);

  const snapshot = snapshotRes.status === "fulfilled" ? snapshotRes.value.data : null;
  if (!snapshot) return null;

  const checkins = checkinsRes.status === "fulfilled" ? (checkinsRes.value.data ?? []) : [];

  // ── Athletic vertex (0-100) ──────────────────────────
  // Based on: ACWR in sweet spot, training consistency, load compliance
  const acwr = (snapshot.acwr as number) ?? 1.0;
  const acwrScore = acwr >= 0.8 && acwr <= 1.3 ? 80 : acwr > 1.5 ? 30 : acwr < 0.5 ? 40 : 60;
  const athleticLoad = (snapshot.athletic_load_7day as number) ?? 0;
  const loadScore = athleticLoad > 50 ? Math.min(100, 50 + athleticLoad / 10) : athleticLoad; // some load = good
  const streakBonus = Math.min(20, ((snapshot.streak_days as number) ?? 0) * 2);
  const athletic = Math.min(100, Math.round((acwrScore * 0.5 + loadScore * 0.3 + streakBonus) * 1.0));

  // ── Academic vertex (0-100) ──────────────────────────
  // Based on: academic load presence (some is good), DLI balance
  const academicLoad = (snapshot.academic_load_7day as number) ?? 0;
  const dli = (snapshot.dual_load_index as number) ?? 0;
  // Academic score: higher when academic load is moderate (not 0, not crushing)
  let academicScore: number;
  if (academicLoad === 0) {
    academicScore = 30; // no academic data = low academic vertex
  } else if (academicLoad <= 150) {
    academicScore = 70 + Math.round(academicLoad / 5); // moderate = good
  } else {
    academicScore = Math.max(40, 100 - Math.round((academicLoad - 150) / 3)); // heavy = declining
  }
  const academic = Math.min(100, academicScore);

  // ── Wellbeing vertex (0-100) ──────────────────────────
  // Based on: readiness score, sleep, mood, wellness trend
  const readinessRaw = (snapshot.readiness_score as number) ?? 50;
  const wellnessAvg = (snapshot.wellness_7day_avg as number) ?? 50;
  const wellnessTrend = (snapshot.wellness_trend as string) ?? "STABLE";
  const trendBonus = wellnessTrend === "IMPROVING" ? 10 : wellnessTrend === "DECLINING" ? -10 : 0;

  // Average recent checkin scores if available
  let checkinAvg = 50;
  if (checkins.length > 0) {
    const scores = checkins.map((c: any) => c.readiness_score ?? c.energy_level ?? 50);
    checkinAvg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
  }

  const wellbeing = Math.min(100, Math.max(0, Math.round(
    readinessRaw * 0.3 + wellnessAvg * 0.3 + checkinAvg * 0.3 + trendBonus
  )));

  // ── Balance score (0-100) ────────────────────────────
  // Perfect equilateral = all three equal. Measured as inverse of max deviation.
  const mean = (athletic + academic + wellbeing) / 3;
  const maxDev = Math.max(
    Math.abs(athletic - mean),
    Math.abs(academic - mean),
    Math.abs(wellbeing - mean)
  );
  const balance = Math.round(Math.max(0, 100 - maxDev * 2));

  // ── Imbalance direction ──────────────────────────────
  let imbalanceDirection: TriangleState["imbalanceDirection"] = "balanced";
  if (balance < 60) {
    const min = Math.min(athletic, academic, wellbeing);
    if (min === athletic) imbalanceDirection = "athletic";
    else if (min === academic) imbalanceDirection = "academic";
    else imbalanceDirection = "wellbeing";
  }

  // ── Recommendation ────────────────────────────────────
  let recommendation = "Triangle is balanced — maintain current approach.";
  if (imbalanceDirection === "athletic") {
    recommendation = "Athletic vertex lagging — consider increasing training frequency or intensity.";
  } else if (imbalanceDirection === "academic") {
    recommendation = "Academic vertex lagging — schedule study blocks and protect cognitive energy.";
  } else if (imbalanceDirection === "wellbeing") {
    recommendation = "Wellbeing vertex lagging — prioritize sleep, recovery, and check-in consistency.";
  }

  return { athletic, academic, wellbeing, balance, imbalanceDirection, recommendation };
}

/**
 * Build system prompt block from triangle state.
 */
export function buildTrianglePromptBlock(state: TriangleState | null): string {
  if (!state) return "";

  const balanceLabel = state.balance >= 80 ? "BALANCED" : state.balance >= 60 ? "MODERATE" : "IMBALANCED";

  return `\n\nTRIANGLE STATE:
Athletic: ${state.athletic} | Academic: ${state.academic} | Wellbeing: ${state.wellbeing}
Balance: ${state.balance}% (${balanceLabel}${state.imbalanceDirection !== "balanced" ? ` — ${state.imbalanceDirection} vertex lagging` : ""})
${state.recommendation}`;
}
