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

    // Fetch accepted suggestions of calendar-related types
    const { data: suggestions, error: sugErr } = await db
      .from("suggestions")
      .select("*")
      .eq("player_id", playerId)
      .eq("status", "accepted")
      .in("suggestion_type", ["study_block", "exam_date", "calendar_event"])
      .order("created_at", { ascending: false });

    if (sugErr) {
      return NextResponse.json({ error: sugErr.message }, { status: 500 });
    }

    // Fetch plans for next 7 days
    const today = new Date().toISOString().split("T")[0];
    const sevenDaysOut = new Date();
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
    const endDate = sevenDaysOut.toISOString().split("T")[0];

    const { data: plans, error: planErr } = await db
      .from("plans")
      .select("*")
      .eq("user_id", playerId)
      .gte("date", today)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (planErr) {
      return NextResponse.json({ error: planErr.message }, { status: 500 });
    }

    const events = [
      ...(suggestions || []).map((s) => ({
        id: s.id,
        source: "suggestion" as const,
        type: s.suggestion_type,
        title: s.title,
        payload: s.payload,
        createdAt: s.created_at,
      })),
      ...(plans || []).map((p) => ({
        id: p.id,
        source: "plan" as const,
        type: "plan",
        title: `${p.workout_type || "workout"} – ${p.date}`,
        payload: p,
        createdAt: p.created_at,
      })),
    ];

    return NextResponse.json(
      { events },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
