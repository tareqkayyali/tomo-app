import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { captureError } from "@/lib/errorTracker";
import { ErrorCode } from "@/lib/observability/error-codes";
import { ObservabilityHeaders } from "@/lib/observability/ids";

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

    // Calculate checkin freshness
    const hasCheckedInToday = !!checkin;
    let checkinAgeHours: number | null = null;
    if (checkin?.created_at) {
      checkinAgeHours = (Date.now() - new Date(checkin.created_at).getTime()) / 3600000;
    }

    return NextResponse.json(
      {
        needsCheckin: !hasCheckedInToday,
        hasCheckedIn: hasCheckedInToday, // kept for backwards compat
        checkin: checkin || null,
        checkinAgeHours: checkinAgeHours != null ? Math.round(checkinAgeHours * 10) / 10 : null,
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
    await captureError(err, {
      layer: "backend",
      endpoint: "/api/v1/today",
      traceId: req.headers.get(ObservabilityHeaders.traceId),
      requestId: req.headers.get(ObservabilityHeaders.requestId),
      errorCode: ErrorCode.BE.API.UNHANDLED,
      metadata: {
        route: "today",
      },
    });
    console.error('[today] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
