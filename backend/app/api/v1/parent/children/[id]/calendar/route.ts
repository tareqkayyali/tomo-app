import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["parent"]);
  if ("error" in roleCheck) return roleCheck.error;

  const { id: childId } = await params;

  const relResult = await requireRelationship(auth.user.id, childId);
  if ("error" in relResult) return relResult.error;

  const db = supabaseAdmin();
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAhead = new Date(now);
  sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);

  const rangeStart = sevenDaysAgo.toISOString().slice(0, 10);
  const rangeEnd = sevenDaysAhead.toISOString().slice(0, 10);

  // Fetch accepted suggestions for this child (study_block, exam_date, calendar_event)
  const { data: suggestions } = await db
    .from("suggestions")
    .select("*")
    .eq("player_id", childId)
    .eq("status", "accepted")
    .in("suggestion_type", ["study_block", "exam_date", "calendar_event"]);

  // Fetch plans for the child within the date range
  const { data: plans } = await db
    .from("plans")
    .select("*")
    .eq("user_id", childId)
    .gte("date", rangeStart)
    .lte("date", rangeEnd);

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
      type: "training",
      title: `${p.workout_type} - ${p.intensity}`,
      payload: {
        date: p.date,
        readiness: p.readiness,
        intensity: p.intensity,
        workoutType: p.workout_type,
        duration: p.duration,
        sport: p.sport,
      },
      createdAt: p.created_at,
    })),
  ];

  return NextResponse.json(
    { events },
    { headers: { "api-version": "v1" } }
  );
}
