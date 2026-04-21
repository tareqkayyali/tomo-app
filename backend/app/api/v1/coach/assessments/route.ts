/**
 * POST /api/v1/coach/assessments
 * Coach logs a structured assessment of an athlete's performance.
 * Emits COACH_ASSESSMENT event — updates coachability_index on snapshot.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { emitEventSafe } from "@/services/events/eventEmitter";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { playerId, ratings, notes } = body;

    if (!playerId || !ratings) {
      return NextResponse.json({ error: "playerId and ratings are required" }, { status: 400 });
    }

    // Verify coach-player relationship
    const db = supabaseAdmin();
    const { data: rel } = await db
      .from("relationships")
      .select("id")
      .eq("guardian_id", auth.user.id)
      .eq("player_id", playerId)
      .eq("relationship_type", "coach")
      .eq("status", "accepted")
      .single();

    if (!rel) {
      return NextResponse.json({ error: "Not authorized for this player" }, { status: 403 });
    }

    // Validate ratings (expect object with keys like attitude, effort, coachability, etc.)
    const validKeys = ["attitude", "effort", "coachability", "communication", "teamwork", "punctuality", "focus"];
    const validatedRatings: Record<string, number> = {};
    for (const [key, val] of Object.entries(ratings)) {
      if (validKeys.includes(key) && typeof val === "number" && val >= 1 && val <= 10) {
        validatedRatings[key] = val;
      }
    }

    if (Object.keys(validatedRatings).length === 0) {
      return NextResponse.json({ error: "At least one valid rating is required (1-10)" }, { status: 400 });
    }

    // Look up coach display name so the athlete notification is personalized
    // (handleCoachAssessmentNotif reads payload.coach_name — fallback "Coach" is bland).
    const { data: coachUser } = await db
      .from("users")
      .select("display_name")
      .eq("id", auth.user.id)
      .maybeSingle();
    const coachName = (coachUser as any)?.display_name || "Coach";

    // Emit COACH_ASSESSMENT event
    await emitEventSafe({
      athleteId: playerId,
      eventType: "COACH_ASSESSMENT",
      occurredAt: new Date().toISOString(),
      source: "COACH",
      payload: {
        ratings: validatedRatings,
        overall_score: Object.values(validatedRatings).reduce((a, b) => a + b, 0) / Object.values(validatedRatings).length,
        notes: notes || "",
        coach_id: auth.user.id,
        coach_name: coachName,
        category: "General",
      },
      createdBy: auth.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /coach/assessments] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
