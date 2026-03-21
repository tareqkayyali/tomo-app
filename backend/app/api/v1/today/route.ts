import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ("error" in auth) return auth.error;

    const db = supabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    // Load all 4 independent queries in parallel
    const [userRes, checkinRes, planRes, pointsRes] = await Promise.all([
      db
        .from("users")
        .select("total_points, current_streak, freeze_tokens, longest_streak, archetype, sport")
        .eq("id", auth.user.id)
        .single(),
      db
        .from("checkins")
        .select("*")
        .eq("user_id", auth.user.id)
        .eq("date", today)
        .single(),
      db
        .from("plans")
        .select("*")
        .eq("user_id", auth.user.id)
        .eq("date", today)
        .single(),
      db
        .from("points_ledger")
        .select("*")
        .eq("id", `${auth.user.id}_${today}`)
        .single(),
    ]);

    const user = userRes.data;
    const checkin = checkinRes.data;
    const plan = planRes.data;
    const points = pointsRes.data;

    return NextResponse.json(
      {
        hasCheckedIn: !!checkin,
        checkin: checkin || null,
        plan: plan || null,
        gamification: {
          pointsToday: points?.points || 0,
          totalPoints: user?.total_points || 0,
          currentStreak: user?.current_streak || 0,
          longestStreak: user?.longest_streak || 0,
          freezeTokens: user?.freeze_tokens || 0,
        },
      },
      { headers: { "api-version": "v1", "Cache-Control": "private, max-age=30" } }
    );
  } catch (err: any) {
    console.error('[today] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
