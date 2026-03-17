import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readSnapshot } from "@/services/events/snapshot/snapshotReader";
import { getRecommendations } from "@/services/recommendations/getRecommendations";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["coach"]);
  if ("error" in roleCheck) return roleCheck.error;

  const { id: playerId } = await params;

  const relResult = await requireRelationship(auth.user.id, playerId);
  if ("error" in relResult) return relResult.error;

  try {
    const db = supabaseAdmin();

    // Fetch snapshot (current state) + 14-day checkin history in parallel
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const since = fourteenDaysAgo.toISOString().split("T")[0];

    const [snapshot, checkinsRes, coachRecs] = await Promise.all([
      readSnapshot(playerId, "COACH"),
      db
        .from("checkins")
        .select("date, readiness, energy, soreness, sleep_hours, mood")
        .eq("user_id", playerId)
        .gte("date", since)
        .order("date", { ascending: true }),
      // Layer 4 — coach-visible recs (includes coach-only TRIANGLE_ALERTs)
      getRecommendations(playerId, { role: "COACH", limit: 5 }).catch(() => []),
    ]);

    if (checkinsRes.error) {
      return NextResponse.json({ error: checkinsRes.error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        snapshot: snapshot
          ? {
              readinessRag: snapshot.readiness_rag ?? null,
              acwr: snapshot.acwr ?? null,
              dualLoadIndex: snapshot.dual_load_index ?? null,
              wellnessTrend: snapshot.wellness_trend ?? null,
              athleticLoad7day: snapshot.athletic_load_7day ?? null,
              academicLoad7day: snapshot.academic_load_7day ?? null,
            }
          : null,
        history: checkinsRes.data || [],
        // Layer 4 — coach-visible recommendations (includes coach-only alerts)
        recommendations: (coachRecs as any[]).map((r: any) => ({
          recType: r.rec_type,
          priority: r.priority,
          title: r.title,
          bodyShort: r.body_short,
          confidence: r.confidence_score,
        })),
      },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
