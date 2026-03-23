import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const VALID_ARCHETYPES = ["phoenix", "titan", "blade", "surge"];

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = req.nextUrl;
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 100);

    // Get the user's archetype if not specified
    const db = supabaseAdmin();
    let archetype = searchParams.get("archetype");

    if (!archetype) {
      const { data: user } = await db
        .from("users")
        .select("archetype")
        .eq("id", auth.user.id)
        .single();

      archetype = user?.archetype || null;
    }

    if (!archetype || !VALID_ARCHETYPES.includes(archetype)) {
      return NextResponse.json(
        {
          error: "Archetype required. Assigned after 14+ check-ins.",
          leaderboard: [],
          userRank: null,
          type: "archetype",
        },
        { status: 200 }
      );
    }

    const { data: leaders, error } = await db
      .from("users")
      .select("id, name, sport, archetype, total_points, current_streak")
      .eq("archetype", archetype)
      .order("total_points", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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
      { leaderboard: ranked, userRank, type: "archetype", archetype },
      { headers: { "api-version": "v1" } }
    );
  } catch (err) {
    console.error('[GET /api/v1/leaderboards/archetype] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
