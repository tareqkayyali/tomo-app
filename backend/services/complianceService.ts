/**
 * Compliance Service
 * Awards points at check-in time based on readiness/intensity decisions.
 * Streak increments only on compliant days.
 * Freeze tokens awarded every 7-day compliant streak.
 *
 * Pure functions for evaluation + Supabase persistence.
 * Deterministic ledger ID: uid_YYYY-MM-DD
 */

import { supabaseAdmin } from "../lib/supabase/admin";
import type { ComplianceEvaluation, StreakResult } from "../types";

// Point values
export const POINTS_V1 = {
  CHECKIN_BASE: 5,
  REST_ON_RED: 15,
  REST_ON_FORCED: 10,
  LIGHT_ON_YELLOW: 5,
  GREEN_WORKOUT: 5,
  STREAK_FREEZE_COST: 0,
};

export const COMPLIANT_STREAK_FOR_FREEZE = 7;

/**
 * Determine compliance and compute points for a check-in.
 * Pure function — no side effects.
 */
export function evaluateCheckin({
  readiness,
  intensity,
  daysSinceRest,
}: {
  readiness: string;
  intensity: string;
  painFlag?: boolean;
  daysSinceRest: number;
}): ComplianceEvaluation {
  let points = POINTS_V1.CHECKIN_BASE;
  const reasons: string[] = ["Daily check-in"];
  let compliant = true;

  // Safety-critical: RED -> intensity must be 'rest'
  if (readiness === "Red") {
    if (intensity === "rest") {
      points += POINTS_V1.REST_ON_RED;
      reasons.push("Rested on RED day");
    } else {
      compliant = false;
    }
  }

  // Forced rest after 6+ days
  if (daysSinceRest >= 6 && intensity === "rest") {
    points += POINTS_V1.REST_ON_FORCED;
    reasons.push("Scheduled recovery after 6+ training days");
  }

  // YELLOW guidance followed
  if (readiness === "Yellow" && (intensity === "light" || intensity === "rest")) {
    points += POINTS_V1.LIGHT_ON_YELLOW;
    reasons.push("Followed YELLOW guidance");
  }

  // GREEN workout completed as prescribed
  if (readiness === "Green" && intensity !== "rest") {
    points += POINTS_V1.GREEN_WORKOUT;
    reasons.push("GREEN workout prescribed");
  }

  return { compliant, points, reasons };
}

/**
 * Update streak based on compliance.
 * Pure function — returns new streak state; caller persists.
 */
export function computeStreak({
  compliant,
  currentStreak,
  lastCompliantDate,
  freezeTokens,
  today,
}: {
  compliant: boolean;
  currentStreak: number;
  lastCompliantDate: string | null;
  freezeTokens: number;
  today: string;
}): StreakResult {
  if (!compliant) {
    return {
      streak: 0,
      freezeTokens,
      usedFreeze: false,
      earnedFreeze: false,
      lastCompliantDate: lastCompliantDate || today,
    };
  }

  // Calculate gap in days
  let gap = 0;
  if (lastCompliantDate) {
    const last = new Date(lastCompliantDate + "T00:00:00Z");
    const now = new Date(today + "T00:00:00Z");
    gap = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  }

  let streak: number;
  let usedFreeze = false;
  let tokenCount = freezeTokens;

  if (!lastCompliantDate) {
    streak = 1;
  } else if (gap === 0) {
    streak = currentStreak;
  } else if (gap === 1) {
    streak = currentStreak + 1;
  } else if (gap === 2 && tokenCount > 0 && currentStreak > 0) {
    streak = currentStreak + 1;
    tokenCount -= 1;
    usedFreeze = true;
  } else {
    streak = 1;
  }

  // Award freeze every COMPLIANT_STREAK_FOR_FREEZE days
  let earnedFreeze = false;
  if (streak > 0 && streak % COMPLIANT_STREAK_FOR_FREEZE === 0) {
    tokenCount += 1;
    earnedFreeze = true;
  }

  return {
    streak,
    freezeTokens: tokenCount,
    usedFreeze,
    earnedFreeze,
    lastCompliantDate: today,
  };
}

/**
 * Persist compliance result to Supabase.
 * Writes points_ledger entry + updates user totals.
 */
export async function persistCompliance(
  uid: string,
  evaluation: ComplianceEvaluation,
  streakResult: StreakResult,
  meta: { readiness: string; intensity: string; date: string }
) {
  const db = supabaseAdmin();
  const ledgerId = `${uid}_${meta.date}`;

  const ledgerEntry = {
    id: ledgerId,
    user_id: uid,
    date: meta.date,
    points: evaluation.points,
    reasons: evaluation.reasons,
    readiness: meta.readiness,
    intensity: meta.intensity,
    compliant: evaluation.compliant,
  };

  // Upsert ledger entry
  const { error: ledgerError } = await db
    .from("points_ledger")
    .upsert(ledgerEntry, { onConflict: "id" });

  if (ledgerError) throw new Error(`Ledger write failed: ${ledgerError.message}`);

  // Get current user totals
  const { data: user, error: userError } = await db
    .from("users")
    .select("total_points, longest_streak")
    .eq("id", uid)
    .single();

  if (userError || !user) throw new Error("User not found");

  const newTotalPoints = (user.total_points || 0) + evaluation.points;

  // Update user totals
  const { error: updateError } = await db
    .from("users")
    .update({
      total_points: newTotalPoints,
      current_streak: streakResult.streak,
      longest_streak: Math.max(user.longest_streak || 0, streakResult.streak),
      freeze_tokens: streakResult.freezeTokens,
      last_compliant_date: streakResult.lastCompliantDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", uid);

  if (updateError) throw new Error(`User update failed: ${updateError.message}`);

  return { ...ledgerEntry, newTotalPoints };
}

/**
 * Full check-in compliance flow.
 */
export async function processCheckinCompliance(
  uid: string,
  planData: { readiness: string; intensity: string; alerts?: { type: string }[] },
  daysSinceRest: number,
  today: string
) {
  const db = supabaseAdmin();

  // 1. Evaluate compliance (pure)
  const evaluation = evaluateCheckin({
    readiness: planData.readiness,
    intensity: planData.intensity,
    painFlag: planData.alerts?.some((a) => a.type === "pain") || false,
    daysSinceRest,
  });

  // 2. Load user for streak state
  const { data: user, error } = await db
    .from("users")
    .select("current_streak, last_compliant_date, freeze_tokens")
    .eq("id", uid)
    .single();

  if (error || !user) throw new Error("User not found");

  // 3. Compute new streak (pure)
  const streakResult = computeStreak({
    compliant: evaluation.compliant,
    currentStreak: user.current_streak || 0,
    lastCompliantDate: user.last_compliant_date || null,
    freezeTokens: user.freeze_tokens ?? 0,
    today,
  });

  // 4. Persist
  const ledger = await persistCompliance(uid, evaluation, streakResult, {
    readiness: planData.readiness,
    intensity: planData.intensity,
    date: today,
  });

  return {
    ledger,
    streak: {
      current: streakResult.streak,
      freezeTokens: streakResult.freezeTokens,
      usedFreeze: streakResult.usedFreeze,
      earnedFreeze: streakResult.earnedFreeze,
      lastCompliantDate: streakResult.lastCompliantDate,
    },
  };
}

/**
 * Get points totals and last N ledger entries for a user.
 */
export async function getPointsSummary(uid: string, limit = 14) {
  const db = supabaseAdmin();

  const { data: user, error: userError } = await db
    .from("users")
    .select("total_points")
    .eq("id", uid)
    .single();

  if (userError || !user) throw new Error("User not found");

  const { data: entries, error: entriesError } = await db
    .from("points_ledger")
    .select("*")
    .eq("user_id", uid)
    .order("date", { ascending: false })
    .limit(limit);

  if (entriesError) throw new Error(`Points query failed: ${entriesError.message}`);

  return {
    totalPoints: user.total_points || 0,
    entries: entries || [],
  };
}

/**
 * Get streak info for a user.
 */
export async function getStreakInfo(uid: string) {
  const db = supabaseAdmin();

  const { data: user, error } = await db
    .from("users")
    .select("current_streak, freeze_tokens, last_compliant_date, longest_streak")
    .eq("id", uid)
    .single();

  if (error || !user) throw new Error("User not found");

  return {
    streak: user.current_streak || 0,
    freezeTokens: user.freeze_tokens ?? 0,
    lastCompliantDate: user.last_compliant_date || null,
    longestStreak: user.longest_streak || 0,
  };
}
