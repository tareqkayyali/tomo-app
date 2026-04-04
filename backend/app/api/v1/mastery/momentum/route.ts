/**
 * Mastery Momentum API
 *
 * GET /api/v1/mastery/momentum?days=30&targetPlayerId=xxx
 *
 * Returns momentum/velocity indicators:
 * - Consistency score (checkin rate + completion rate)
 * - Streak + tier
 * - Overall rating delta vs N days ago
 * - Velocity label
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

interface StreakTier {
  label: string;
  emoji: string;
}

function getStreakTier(streak: number): StreakTier {
  if (streak >= 90) return { label: "Legend", emoji: "\uD83D\uDC51" };
  if (streak >= 60) return { label: "Veteran", emoji: "\u2B50" };
  if (streak >= 30) return { label: "Dedicated", emoji: "\uD83C\uDFC6" };
  if (streak >= 14) return { label: "Consistent", emoji: "\uD83D\uDCAA" };
  if (streak >= 7) return { label: "Building", emoji: "\uD83D\uDD25" };
  if (streak >= 1) return { label: "Started", emoji: "\uD83C\uDF31" };
  return { label: "New", emoji: "\uD83D\uDC4B" };
}

function getVelocityLabel(ratingDelta: number): string {
  if (ratingDelta >= 10) return "Accelerating";
  if (ratingDelta >= 3) return "Gaining";
  if (ratingDelta >= -2) return "Steady";
  if (ratingDelta >= -8) return "Cooling off";
  return "Needs work";
}

interface MomentumResponse {
  consistencyScore: number;
  checkinRate: number;
  completionRate: number;
  streakDays: number;
  streakTier: StreakTier;
  ratingDelta: number;
  velocityLabel: string;
  tisScore: number | null;
  tisDelta: number | null;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const requestingUserId = auth.user.id;

    const { searchParams } = new URL(req.url);
    const days = Math.min(90, Math.max(7, Number(searchParams.get("days")) || 30));

    let targetId = requestingUserId;
    const targetPlayerId = searchParams.get("targetPlayerId");
    if (targetPlayerId && targetPlayerId !== requestingUserId) {
      const rel = await requireRelationship(requestingUserId, targetPlayerId);
      if ("error" in rel) return rel.error;
      targetId = targetPlayerId;
    }

    const db = supabaseAdmin();
    const since = new Date(Date.now() - days * 86400000)
      .toISOString()
      .split("T")[0];

    // Parallel queries
    const [checkinsRes, plansRes, userRes, snapshotRes] = await Promise.all([
      db
        .from("checkins")
        .select("date")
        .eq("user_id", targetId)
        .gte("date", since),
      db
        .from("plans")
        .select("date, status")
        .eq("user_id", targetId)
        .gte("date", since)
        .eq("status", "completed"),
      db
        .from("users")
        .select("current_streak, longest_streak")
        .eq("id", targetId)
        .single(),
      (db as any)
        .from("athlete_snapshots")
        .select("tomo_intelligence_score, mastery_scores, updated_at")
        .eq("user_id", targetId)
        .single(),
    ]);

    // Consistency calculation (same as masteryAgent get_consistency_score)
    const checkinDays = new Set((checkinsRes.data ?? []).map((c) => c.date)).size;
    const completedDays = new Set((plansRes.data ?? []).map((p) => p.date)).size;
    const checkinRate = Math.min(1, checkinDays / days);
    const completionRate =
      checkinDays > 0 ? Math.min(1, completedDays / checkinDays) : 0;
    const consistencyScore = Math.round(
      (checkinRate * 0.5 + completionRate * 0.5) * 100
    );

    // Streak
    const streakDays = userRes.data?.current_streak ?? 0;
    const streakTier = getStreakTier(streakDays);

    // Rating delta: compare current mastery_scores avg to estimate change
    // For now, use TIS delta if available, otherwise approximate from snapshot
    const snapshot = snapshotRes.data;
    const tisScore = snapshot?.tomo_intelligence_score ?? null;

    // Rating delta approximation: we don't store historical ratings,
    // so use the consistency trend as a proxy. In future, store periodic snapshots.
    // For now: positive consistency + active streak = positive delta estimate
    const ratingDelta = Math.round(
      (consistencyScore > 60 ? consistencyScore / 20 : -2) +
        (streakDays > 7 ? 2 : streakDays > 0 ? 1 : -1)
    );

    const velocityLabel = getVelocityLabel(ratingDelta);

    const response: MomentumResponse = {
      consistencyScore,
      checkinRate: Math.round(checkinRate * 100),
      completionRate: Math.round(completionRate * 100),
      streakDays,
      streakTier,
      ratingDelta,
      velocityLabel,
      tisScore,
      tisDelta: null, // Will be populated when TIS history is tracked
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-cache" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
