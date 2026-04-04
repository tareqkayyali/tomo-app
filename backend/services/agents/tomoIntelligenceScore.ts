/**
 * Tomo Intelligence Score (TIS) — composite gamification metric.
 *
 * Combines 4 pillars (25% each):
 *   1. Engagement — chat frequency, check-in consistency, streak
 *   2. Performance — test score improvements over time
 *   3. Wellbeing — readiness trends, sleep consistency
 *   4. Academic Balance — DLI balance, study block adherence
 *
 * Score: 0-100. Visible to athlete in Mastery tab.
 * Used by AI to adjust coaching intensity.
 * Designed for weekly pg_cron recomputation.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface TomoIntelligenceScoreResult {
  score: number;         // 0-100
  engagement: number;    // 0-100
  performance: number;   // 0-100
  wellbeing: number;     // 0-100
  academicBalance: number; // 0-100
  computedAt: string;
}

/**
 * Compute the Tomo Intelligence Score for an athlete.
 * Reads from: checkins (28d), phone_test_sessions (28d), athlete_snapshots, chat_sessions.
 */
export async function computeTomoIntelligenceScore(
  athleteId: string
): Promise<TomoIntelligenceScoreResult> {
  const db = supabaseAdmin();
  const twentyEightDaysAgo = new Date(Date.now() - 28 * 86400000).toISOString();

  const [checkinsRes, testsRes, snapshotRes, sessionsRes] = await Promise.allSettled([
    db.from("checkins")
      .select("created_at, readiness_score, sleep_hours")
      .eq("user_id", athleteId)
      .gte("created_at", twentyEightDaysAgo)
      .order("created_at", { ascending: true }),
    db.from("phone_test_sessions")
      .select("test_date, score")
      .eq("athlete_id", athleteId)
      .gte("test_date", twentyEightDaysAgo.slice(0, 10))
      .order("test_date", { ascending: true }),
    db.from("athlete_snapshots")
      .select("streak_days, dual_load_index, academic_load_7day, athletic_load_7day, wellness_7day_avg, wellness_trend")
      .eq("athlete_id", athleteId)
      .single(),
    (db as any).from("chat_sessions")
      .select("id")
      .eq("user_id", athleteId)
      .gte("created_at", twentyEightDaysAgo),
  ]);

  const checkins = checkinsRes.status === "fulfilled" ? (checkinsRes.value.data ?? []) : [];
  const tests = testsRes.status === "fulfilled" ? (testsRes.value.data ?? []) : [];
  const snapshot = snapshotRes.status === "fulfilled" ? snapshotRes.value.data : null;
  const sessions = sessionsRes.status === "fulfilled" ? (sessionsRes.value.data ?? []) : [];

  // ── 1. Engagement (0-100) ────────────────────────────
  const checkinRate = Math.min(1, checkins.length / 28); // daily check-in target
  const chatFrequency = Math.min(1, sessions.length / 20); // ~5 sessions/week target
  const streakDays = (snapshot?.streak_days as number) ?? 0;
  const streakScore = Math.min(1, streakDays / 30); // 30-day streak = max
  const engagement = Math.round((checkinRate * 40 + chatFrequency * 30 + streakScore * 30));

  // ── 2. Performance (0-100) ───────────────────────────
  let performance = 50; // default
  if (tests.length >= 3) {
    // Measure improvement trend
    const scores = tests.map((t: any) => t.score ?? 0).filter((s: number) => s > 0);
    if (scores.length >= 3) {
      const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
      const secondHalf = scores.slice(Math.floor(scores.length / 2));
      const firstAvg = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length;
      if (firstAvg > 0) {
        const improvement = (secondAvg - firstAvg) / firstAvg;
        performance = Math.min(100, Math.max(20, 50 + Math.round(improvement * 200)));
      }
    }
  }

  // ── 3. Wellbeing (0-100) ─────────────────────────────
  const wellnessAvg = (snapshot?.wellness_7day_avg as number) ?? 50;
  const wellnessTrend = (snapshot?.wellness_trend as string) ?? "STABLE";
  const trendBonus = wellnessTrend === "IMPROVING" ? 10 : wellnessTrend === "DECLINING" ? -10 : 0;

  let sleepScore = 50;
  if (checkins.length > 0) {
    const sleepHours = checkins.map((c: any) => c.sleep_hours ?? 7).filter((h: number) => h > 0);
    if (sleepHours.length > 0) {
      const avgSleep = sleepHours.reduce((a: number, b: number) => a + b, 0) / sleepHours.length;
      sleepScore = avgSleep >= 8 ? 90 : avgSleep >= 7 ? 70 : avgSleep >= 6 ? 50 : 30;
    }
  }

  const wellbeing = Math.min(100, Math.max(0, Math.round(wellnessAvg * 0.4 + sleepScore * 0.4 + trendBonus + 10)));

  // ── 4. Academic Balance (0-100) ──────────────────────
  const dli = (snapshot?.dual_load_index as number) ?? 50;
  const academicLoad = (snapshot?.academic_load_7day as number) ?? 0;
  const athleticLoad = (snapshot?.athletic_load_7day as number) ?? 0;

  let academicBalance: number;
  if (academicLoad === 0 && athleticLoad === 0) {
    academicBalance = 50; // no data
  } else {
    // Best balance = DLI between 30-60 (neither extreme)
    if (dli >= 30 && dli <= 60) {
      academicBalance = 80 + Math.round((60 - Math.abs(dli - 45)) / 15 * 20);
    } else if (dli < 30) {
      academicBalance = 40 + dli; // low DLI = under-engaged
    } else {
      academicBalance = Math.max(20, 100 - dli); // high DLI = overloaded
    }
  }
  academicBalance = Math.min(100, Math.max(0, academicBalance));

  // ── Composite score ──────────────────────────────────
  const score = Math.round(engagement * 0.25 + performance * 0.25 + wellbeing * 0.25 + academicBalance * 0.25);

  return {
    score,
    engagement,
    performance,
    wellbeing,
    academicBalance,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Compute and persist the TIS to athlete_snapshots.
 */
export async function persistTomoIntelligenceScore(athleteId: string): Promise<TomoIntelligenceScoreResult> {
  const result = await computeTomoIntelligenceScore(athleteId);
  const db = supabaseAdmin();
  await (db as any)
    .from("athlete_snapshots")
    .update({ tomo_intelligence_score: result.score })
    .eq("athlete_id", athleteId);
  return result;
}
