import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const since = fourteenDaysAgo.toISOString().split("T")[0];

    const { data: checkins, error } = await db
      .from("checkins")
      .select("date, readiness, energy, soreness, sleep_hours, mood")
      .eq("user_id", playerId)
      .gte("date", since)
      .order("date", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { readiness: checkins || [] },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
