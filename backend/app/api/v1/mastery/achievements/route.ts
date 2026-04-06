/**
 * Mastery Achievements API
 *
 * GET /api/v1/mastery/achievements?limit=20&targetPlayerId=xxx
 *
 * Returns milestones, personal bests, next milestone progress, and summary stats.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

interface Milestone {
  id: string;
  type: string;
  title: string;
  description: string | null;
  achieved_at: string;
}

interface PersonalBest {
  score: number;
  date: string;
}

interface NextMilestone {
  name: string;
  target: number;
  progress: number;
  type: "streak" | "tests" | "points";
}

interface AchievementsResponse {
  milestones: Milestone[];
  personalBests: Record<string, PersonalBest>;
  nextMilestone: NextMilestone | null;
  stats: {
    currentStreak: number;
    longestStreak: number;
    totalPoints: number;
    totalMilestones: number;
    totalTests: number;
  };
}

// Milestone definitions for progression
const STREAK_MILESTONES = [
  { id: "week_streak", name: "Week Warrior", target: 7 },
  { id: "two_week_streak", name: "Consistent", target: 14 },
  { id: "month_streak", name: "Unstoppable", target: 30 },
  { id: "two_month_streak", name: "Dedicated", target: 60 },
  { id: "legend_streak", name: "Legend", target: 90 },
];

function getNextMilestone(
  currentStreak: number,
  totalTests: number,
  totalPoints: number,
  unlockedIds: string[]
): NextMilestone | null {
  // Check streak milestones first
  for (const m of STREAK_MILESTONES) {
    if (!unlockedIds.includes(m.id)) {
      return {
        name: m.name,
        target: m.target,
        progress: Math.min(1, currentStreak / m.target),
        type: "streak",
      };
    }
  }

  // Test count milestones
  const testMilestones = [
    { id: "first_10_tests", name: "Test Starter", target: 10 },
    { id: "first_50_tests", name: "Data Driven", target: 50 },
    { id: "first_100_tests", name: "Test Machine", target: 100 },
  ];
  for (const m of testMilestones) {
    if (!unlockedIds.includes(m.id) && totalTests < m.target) {
      return {
        name: m.name,
        target: m.target,
        progress: Math.min(1, totalTests / m.target),
        type: "tests",
      };
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const requestingUserId = auth.user.id;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));

    let targetId = requestingUserId;
    const targetPlayerId = searchParams.get("targetPlayerId");
    if (targetPlayerId && targetPlayerId !== requestingUserId) {
      const rel = await requireRelationship(requestingUserId, targetPlayerId);
      if ("error" in rel) return rel.error;
      targetId = targetPlayerId;
    }

    const db = supabaseAdmin();

    // Parallel queries
    const [milestonesRes, testsRes, userRes] = await Promise.all([
      db
        .from("milestones")
        .select("id, type, title, description, achieved_at")
        .eq("user_id", targetId)
        .order("achieved_at", { ascending: false })
        .limit(limit),
      Promise.all([
        db.from("phone_test_sessions").select("test_type, score, date").eq("user_id", targetId).order("date", { ascending: false }).limit(200),
        db.from("football_test_results").select("test_type, primary_value, date").eq("user_id", targetId).order("date", { ascending: false }).limit(200),
      ]).then(([phone, football]) => ({
        data: [
          ...(phone.data ?? []).map((t: any) => ({ test_type: t.test_type, score: t.score, date: t.date })),
          ...(football.data ?? []).map((t: any) => ({ test_type: t.test_type, score: t.primary_value, date: t.date })),
        ],
        error: phone.error,
      })),
      db
        .from("users")
        .select("current_streak, longest_streak, total_points")
        .eq("id", targetId)
        .single(),
    ]);

    const milestones = (milestonesRes.data ?? []) as Milestone[];
    const tests = testsRes.data ?? [];
    const user = userRes.data;

    // Best scores per test type
    const personalBests: Record<string, PersonalBest> = {};
    for (const t of tests) {
      const score = t.score ?? 0;
      if (!personalBests[t.test_type] || score > personalBests[t.test_type].score) {
        personalBests[t.test_type] = { score, date: t.date };
      }
    }

    const currentStreak = user?.current_streak ?? 0;
    const longestStreak = user?.longest_streak ?? 0;
    const totalPoints = user?.total_points ?? 0;
    const totalTests = tests.length;
    const unlockedIds = milestones.map((m) => m.id);

    const nextMilestone = getNextMilestone(
      currentStreak,
      totalTests,
      totalPoints,
      unlockedIds
    );

    const response: AchievementsResponse = {
      milestones,
      personalBests,
      nextMilestone,
      stats: {
        currentStreak,
        longestStreak,
        totalPoints,
        totalMilestones: milestones.length,
        totalTests,
      },
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
