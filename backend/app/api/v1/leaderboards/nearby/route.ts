import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();

  // Get all users sorted by points to find current user's position
  const { data: allUsers, error } = await db
    .from("users")
    .select("id, name, sport, archetype, total_points, current_streak")
    .order("total_points", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = allUsers || [];
  const userIndex = users.findIndex((u) => u.id === auth.user.id);

  if (userIndex === -1) {
    return NextResponse.json(
      { error: "User not found in leaderboard" },
      { status: 404 }
    );
  }

  // Get 2 users above and 2 below the current user
  const start = Math.max(0, userIndex - 2);
  const end = Math.min(users.length, userIndex + 3);
  const nearby = users.slice(start, end);

  const ranked = nearby.map((u, i) => ({
    rank: start + i + 1,
    userId: u.id,
    name: u.name,
    sport: u.sport,
    archetype: u.archetype,
    totalPoints: u.total_points,
    currentStreak: u.current_streak,
    isCurrentUser: u.id === auth.user.id,
  }));

  return NextResponse.json(
    { nearby: ranked, userRank: userIndex + 1, totalUsers: users.length },
    { headers: { "api-version": "v1" } }
  );
}
