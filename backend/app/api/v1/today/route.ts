import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  // Load user
  const { data: user } = await db
    .from("users")
    .select("total_points, current_streak, freeze_tokens, longest_streak, archetype, sport")
    .eq("id", auth.user.id)
    .single();

  // Load today's checkin
  const { data: checkin } = await db
    .from("checkins")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("date", today)
    .single();

  // Load today's plan
  const { data: plan } = await db
    .from("plans")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("date", today)
    .single();

  // Load today's points
  const { data: points } = await db
    .from("points_ledger")
    .select("*")
    .eq("id", `${auth.user.id}_${today}`)
    .single();

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
    { headers: { "api-version": "v1" } }
  );
}
