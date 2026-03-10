import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();

  const { data: user, error } = await db
    .from("users")
    .select("total_points, current_streak, longest_streak, freeze_tokens, archetype, days_since_rest")
    .eq("id", auth.user.id)
    .single();

  if (error || !user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Count total check-ins
  const { count: checkinCount } = await db
    .from("checkins")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id);

  // Count milestones
  const { count: milestoneCount } = await db
    .from("milestones")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id);

  return NextResponse.json(
    {
      totalPoints: user.total_points,
      currentStreak: user.current_streak,
      longestStreak: user.longest_streak,
      freezeTokens: user.freeze_tokens,
      archetype: user.archetype,
      daysSinceRest: user.days_since_rest,
      totalCheckins: checkinCount || 0,
      totalMilestones: milestoneCount || 0,
    },
    { headers: { "api-version": "v1" } }
  );
}
