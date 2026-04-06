/**
 * Mastery Trajectory API
 *
 * GET /api/v1/mastery/trajectory?months=6&targetPlayerId=xxx
 *
 * Returns test score trajectories for ALL test types the athlete has recorded.
 * Each trajectory includes data points, improvement delta, percentage change,
 * best score, and total test count.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

interface TrajectoryPoint {
  date: string;
  score: number;
}

interface TestTrajectory {
  testType: string;
  data: TrajectoryPoint[];
  improvement: number | null;
  improvementPct: number | null;
  totalTests: number;
  bestScore: number;
  bestDate: string;
  latestScore: number;
  latestDate: string;
}

interface TrajectoryResponse {
  trajectories: Record<string, TestTrajectory>;
  months: number;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const requestingUserId = auth.user.id;

    const { searchParams } = new URL(req.url);
    const months = Math.min(24, Math.max(1, Number(searchParams.get("months")) || 6));

    // Coach/parent read-only support
    let targetId = requestingUserId;
    const targetPlayerId = searchParams.get("targetPlayerId");
    if (targetPlayerId && targetPlayerId !== requestingUserId) {
      const rel = await requireRelationship(requestingUserId, targetPlayerId);
      if ("error" in rel) return rel.error;
      targetId = targetPlayerId;
    }

    const since = new Date(Date.now() - months * 30 * 86400000)
      .toISOString()
      .split("T")[0];

    const db = supabaseAdmin();

    const [phoneRes, footballRes] = await Promise.all([
      db.from("phone_test_sessions").select("test_type, score, date").eq("user_id", targetId).gte("date", since).order("date", { ascending: true }),
      db.from("football_test_results").select("test_type, primary_value, date").eq("user_id", targetId).gte("date", since).order("date", { ascending: true }),
    ]);

    if (phoneRes.error) {
      return NextResponse.json({ error: phoneRes.error.message }, { status: 500 });
    }

    const sessions = [
      ...(phoneRes.data ?? []).map((s: any) => ({ test_type: s.test_type, score: s.score, date: s.date })),
      ...(footballRes.data ?? []).map((s: any) => ({ test_type: s.test_type, score: s.primary_value, date: s.date })),
    ];

    // Group by test_type
    const grouped: Record<string, TrajectoryPoint[]> = {};
    for (const s of sessions) {
      if (s.score == null) continue;
      if (!grouped[s.test_type]) grouped[s.test_type] = [];
      grouped[s.test_type].push({ date: s.date, score: s.score });
    }

    // Build trajectory per test type
    const trajectories: Record<string, TestTrajectory> = {};

    for (const [testType, points] of Object.entries(grouped)) {
      if (points.length === 0) continue;

      const firstScore = points[0].score;
      const lastScore = points[points.length - 1].score;
      const improvement = points.length >= 2 ? lastScore - firstScore : null;
      const improvementPct =
        improvement !== null && firstScore !== 0
          ? Math.round((improvement / Math.abs(firstScore)) * 1000) / 10
          : null;

      // Find best score
      let bestScore = points[0].score;
      let bestDate = points[0].date;
      for (const p of points) {
        if (p.score > bestScore) {
          bestScore = p.score;
          bestDate = p.date;
        }
      }

      trajectories[testType] = {
        testType,
        data: points,
        improvement,
        improvementPct,
        totalTests: points.length,
        bestScore,
        bestDate,
        latestScore: lastScore,
        latestDate: points[points.length - 1].date,
      };
    }

    return NextResponse.json({ trajectories, months } satisfies TrajectoryResponse, {
      headers: { "Cache-Control": "private, no-cache" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
