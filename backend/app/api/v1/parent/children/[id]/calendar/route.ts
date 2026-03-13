import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mapDbRowToCalendarEvent } from "@/lib/calendarHelpers";

/**
 * GET /api/v1/parent/children/[id]/calendar
 *
 * Returns the linked child's actual calendar_events (same shape as
 * the player's own /api/v1/calendar/events endpoint).
 *
 * Query params: ?date=YYYY-MM-DD or ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
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

  const { searchParams } = req.nextUrl;
  const date = searchParams.get("date");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const db = supabaseAdmin();

  try {
    if (date) {
      const dayStart = `${date}T00:00:00`;
      const dayEnd = `${date}T23:59:59`;

      const { data: rows, error } = await db
        .from("calendar_events")
        .select("*")
        .eq("user_id", childId)
        .gte("start_at", dayStart)
        .lte("start_at", dayEnd)
        .order("start_at", { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const events = (rows || []).map((r) =>
        mapDbRowToCalendarEvent(r as Record<string, unknown>)
      );

      return NextResponse.json(
        { events },
        { headers: { "api-version": "v1" } }
      );
    }

    if (startDate && endDate) {
      const rangeStart = `${startDate}T00:00:00`;
      const rangeEnd = `${endDate}T23:59:59`;

      const { data: rows, error } = await db
        .from("calendar_events")
        .select("*")
        .eq("user_id", childId)
        .gte("start_at", rangeStart)
        .lte("start_at", rangeEnd)
        .order("start_at", { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const events = (rows || []).map((r) =>
        mapDbRowToCalendarEvent(r as Record<string, unknown>)
      );

      return NextResponse.json(
        { events },
        { headers: { "api-version": "v1" } }
      );
    }

    return NextResponse.json(
      { error: "Provide 'date' or 'startDate' + 'endDate' query params" },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
