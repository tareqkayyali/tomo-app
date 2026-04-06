/**
 * Athlete Adaptation Intelligence (AAI) — computes how quickly an athlete
 * responds to training stimulus over 4-8 weeks.
 *
 * adaptation_coefficient: 0-1 (0 = non-responder, 1 = hyper-responder)
 * Based on: training load trends vs performance outcome trends.
 *
 * Zero AI cost — fully deterministic.
 * Requires 4+ weeks of data. Returns null for cold-start athletes.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export type AdaptationType = "fast" | "normal" | "slow";

export interface AdaptationProfile {
  coefficient: number;        // 0-1
  type: AdaptationType;
  periodizationAdvice: string;
  dataWeeks: number;          // how many weeks of data were used
}

/**
 * Compute the adaptation coefficient for an athlete.
 * Returns null if insufficient data (<4 weeks).
 */
export async function computeAdaptationProfile(
  athleteId: string
): Promise<AdaptationProfile | null> {
  const db = supabaseAdmin();
  const eightWeeksAgo = new Date(Date.now() - 56 * 86400000).toISOString().slice(0, 10);

  // Get weekly training loads and test scores (both test tables)
  const [loadsRes, phoneTestsRes, footballTestsRes, checkinsRes] = await Promise.allSettled([
    db.from("athlete_daily_load")
      .select("load_date, training_load_au")
      .eq("athlete_id", athleteId)
      .gte("load_date", eightWeeksAgo)
      .order("load_date", { ascending: true }),
    db.from("phone_test_sessions")
      .select("date, score")
      .eq("user_id", athleteId)
      .gte("date", eightWeeksAgo)
      .order("date", { ascending: true }),
    db.from("football_test_results")
      .select("date, primary_value")
      .eq("user_id", athleteId)
      .gte("date", eightWeeksAgo)
      .order("date", { ascending: true }),
    db.from("checkins")
      .select("created_at, readiness_score")
      .eq("user_id", athleteId)
      .gte("created_at", new Date(Date.now() - 56 * 86400000).toISOString())
      .order("created_at", { ascending: true }),
  ]);

  const loads = loadsRes.status === "fulfilled" ? (loadsRes.value.data ?? []) : [];
  const phoneTests = phoneTestsRes.status === "fulfilled" ? (phoneTestsRes.value.data ?? []) : [];
  const footballTests = footballTestsRes.status === "fulfilled" ? ((footballTestsRes.value as any).data ?? []).map((t: any) => ({ date: t.date, score: t.primary_value })) : [];
  const tests = [...phoneTests, ...footballTests];
  const checkins = checkinsRes.status === "fulfilled" ? (checkinsRes.value.data ?? []) : [];

  // Need at least 4 weeks of load data
  if (loads.length < 20) return null; // ~3 entries/day * 7 days * 4 weeks ≈ 84, but some athletes train less

  // Bucket into weeks
  const weeklyLoads: number[] = [];
  const weeklyReadiness: number[] = [];

  for (let w = 0; w < 8; w++) {
    const weekStart = new Date(Date.now() - (w + 1) * 7 * 86400000).toISOString().slice(0, 10);
    const weekEnd = new Date(Date.now() - w * 7 * 86400000).toISOString().slice(0, 10);

    const weekLoad = loads
      .filter((l: any) => l.load_date >= weekStart && l.load_date < weekEnd)
      .reduce((s: number, l: any) => s + (l.training_load_au || 0), 0);

    const weekCheckins = checkins.filter((c: any) => {
      const d = c.created_at?.slice(0, 10);
      return d >= weekStart && d < weekEnd;
    });

    if (weekLoad > 0) {
      weeklyLoads.push(weekLoad);
      const avgReadiness = weekCheckins.length > 0
        ? weekCheckins.reduce((s: number, c: any) => s + (c.readiness_score ?? 50), 0) / weekCheckins.length
        : 50;
      weeklyReadiness.push(avgReadiness);
    }
  }

  const dataWeeks = weeklyLoads.length;
  if (dataWeeks < 4) return null;

  // Adaptation coefficient: correlation between load increase and readiness recovery
  // High coefficient = athlete handles load increases well (readiness stays stable or improves)
  // Low coefficient = athlete struggles with load increases (readiness drops)

  // Simple approach: compare load trend direction vs readiness trend direction
  const loadTrend = linearTrend(weeklyLoads);
  const readinessTrend = linearTrend(weeklyReadiness);

  // If load is increasing and readiness is stable/improving → fast adapter
  // If load is increasing and readiness is declining → slow adapter
  // If load is stable → check readiness stability
  let coefficient: number;

  if (Math.abs(loadTrend) < 0.1) {
    // Stable load — measure readiness consistency
    const readinessVar = variance(weeklyReadiness);
    coefficient = Math.max(0, Math.min(1, 1 - readinessVar / 500));
  } else if (loadTrend > 0) {
    // Increasing load — how well does readiness hold up?
    if (readinessTrend >= 0) {
      coefficient = Math.min(1, 0.7 + readinessTrend * 0.3); // improving despite load increase
    } else {
      coefficient = Math.max(0, 0.5 + readinessTrend * 0.5); // declining under load
    }
  } else {
    // Decreasing load — readiness should improve
    coefficient = readinessTrend > 0 ? 0.6 : 0.4; // neutral if not recovering on deload
  }

  // Factor in test improvements if available
  if (tests.length >= 3) {
    const testTrend = linearTrend(tests.map((t: any) => t.score ?? 0));
    if (testTrend > 0) coefficient = Math.min(1, coefficient + 0.1);
  }

  coefficient = Math.round(coefficient * 100) / 100;

  const type: AdaptationType = coefficient >= 0.65 ? "fast" : coefficient >= 0.4 ? "normal" : "slow";

  const periodizationAdvice = type === "fast"
    ? "Fast adapter — can handle shorter mesocycles (3 weeks) and faster load progression."
    : type === "normal"
    ? "Normal adaptation — standard 4-week mesocycles with gradual load increases."
    : "Slow adapter — needs longer adaptation windows (5-6 weeks). Increase load conservatively.";

  return { coefficient, type, periodizationAdvice, dataWeeks };
}

/** Simple linear trend (slope of least-squares fit, normalized) */
function linearTrend(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return 0;

  let sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const slope = (sumXY - (n * (n - 1) / 2) * mean) / (sumX2 - (n * (n - 1) / 2) * ((n - 1) / 2));
  return slope / mean; // normalized slope
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}
