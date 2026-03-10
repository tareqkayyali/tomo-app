import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 100);

  const db = supabaseAdmin();
  const { data: leaders, error } = await db
    .from("users")
    .select("id, name, sport, archetype, total_points, current_streak")
    .order("total_points", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Find current user's rank
  const ranked = (leaders || []).map((u, i) => ({
    rank: i + 1,
    userId: u.id,
    name: u.name,
    sport: u.sport,
    archetype: u.archetype,
    totalPoints: u.total_points,
    currentStreak: u.current_streak,
    isCurrentUser: u.id === auth.user.id,
  }));

  const userRank = ranked.find((r) => r.isCurrentUser)?.rank || null;

  return NextResponse.json(
    { leaderboard: ranked, userRank, type: "global" },
    { headers: { "api-version": "v1" } }
  );
}
