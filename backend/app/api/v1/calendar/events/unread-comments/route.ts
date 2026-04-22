import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/calendar/events/unread-comments
 *   ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD[&targetPlayerId=<uuid>]
 *
 * Returns the event IDs (within the requested window) that currently have
 * unread comments for the caller. Drives the timeline red-dot.
 *
 * Unread = exists an event_comments row with created_at greater than the
 * caller's last_viewed_at for that event (or no last_viewed_at at all).
 *
 * When `targetPlayerId` is set, the caller must be a linked guardian; we
 * scope to events owned by that player.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const targetPlayerId = url.searchParams.get("targetPlayerId");

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: "dateFrom and dateTo are required (YYYY-MM-DD)" }, { status: 400 });
  }

  let ownerId = auth.user.id;
  if (targetPlayerId && targetPlayerId !== auth.user.id) {
    const rel = await requireRelationship(auth.user.id, targetPlayerId);
    if ("error" in rel) return rel.error;
    ownerId = targetPlayerId;
  }

  const db = supabaseAdmin() as any;

  // 1) All events in window for the owner
  const { data: events, error: evErr } = await db
    .from("calendar_events")
    .select("id, start_at")
    .eq("user_id", ownerId)
    .gte("start_at", `${dateFrom}T00:00:00.000Z`)
    .lte("start_at", `${dateTo}T23:59:59.999Z`);

  if (evErr) {
    console.error("[unread-comments] events query error:", evErr.message);
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }

  const eventIds = (events || []).map((e: any) => e.id);
  if (eventIds.length === 0) return NextResponse.json({ eventIds: [] });

  // 2) Latest comment created_at per event in window
  const { data: comments, error: cErr } = await db
    .from("event_comments")
    .select("event_id, created_at")
    .in("event_id", eventIds)
    .order("created_at", { ascending: false });

  if (cErr) {
    console.error("[unread-comments] comments query error:", cErr.message);
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }

  const latestCommentByEvent = new Map<string, string>();
  for (const row of (comments || []) as any[]) {
    if (!latestCommentByEvent.has(row.event_id)) {
      latestCommentByEvent.set(row.event_id, row.created_at);
    }
  }
  if (latestCommentByEvent.size === 0) return NextResponse.json({ eventIds: [] });

  // 3) Caller's last-viewed timestamps
  const commentedEventIds = Array.from(latestCommentByEvent.keys());
  const { data: views, error: vErr } = await db
    .from("event_comment_views")
    .select("event_id, last_viewed_at")
    .eq("user_id", auth.user.id)
    .in("event_id", commentedEventIds);

  if (vErr) {
    console.error("[unread-comments] views query error:", vErr.message);
    return NextResponse.json({ error: "Failed to load view state" }, { status: 500 });
  }

  const viewedAtByEvent = new Map<string, string>();
  for (const row of (views || []) as any[]) {
    viewedAtByEvent.set(row.event_id, row.last_viewed_at);
  }

  // 4) Unread = latest comment newer than caller's last view (or never viewed)
  const unread: string[] = [];
  for (const [eventId, latestCreatedAt] of latestCommentByEvent) {
    const viewedAt = viewedAtByEvent.get(eventId);
    if (!viewedAt || new Date(latestCreatedAt).getTime() > new Date(viewedAt).getTime()) {
      unread.push(eventId);
    }
  }

  return NextResponse.json({ eventIds: unread });
}
