import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, requireRelationship } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createNotification, sendPushNotification } from "@/services/notificationService";

/**
 * GET /api/v1/calendar/events/:id/comments
 *
 * Returns comments for an event. Access:
 *   - event owner (athlete)
 *   - comment author
 *   - any guardian (coach/parent) with an accepted relationship to the owner
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id: eventId } = await params;
  const db = supabaseAdmin() as any;

  // Load event → owner
  const { data: event, error: evErr } = await db
    .from("calendar_events")
    .select("id, user_id")
    .eq("id", eventId)
    .single();

  if (evErr || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Access check: owner OR linked guardian
  if (event.user_id !== auth.user.id) {
    const rel = await requireRelationship(auth.user.id, event.user_id);
    if ("error" in rel) return rel.error;
  }

  const { data: comments, error } = await db
    .from("event_comments")
    .select("id, event_id, author_id, author_role, body, created_at, updated_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[events/:id/comments GET] query error:", error.message);
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }

  // Enrich with author name for display
  const authorIds = Array.from(new Set((comments || []).map((c: any) => c.author_id)));
  const { data: authors } = authorIds.length
    ? await db.from("users").select("id, name").in("id", authorIds)
    : { data: [] as Array<{ id: string; name: string | null }> };
  const nameById = new Map((authors || []).map((u: any) => [u.id, u.name || ""]));

  const enriched = (comments || []).map((c: any) => ({
    id: c.id,
    eventId: c.event_id,
    authorId: c.author_id,
    authorRole: c.author_role,
    authorName: nameById.get(c.author_id) || "",
    body: c.body,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }));

  return NextResponse.json({ comments: enriched });
}

/**
 * POST /api/v1/calendar/events/:id/comments
 * Body: { body: string }
 *
 * Only coaches and parents (with accepted relationship to the event owner)
 * and the event owner themself can post. On coach/parent post we notify the
 * event owner (in-app + push, fire-and-forget).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id: eventId } = await params;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "Comment too long" }, { status: 400 });

  const db = supabaseAdmin() as any;

  const { data: event, error: evErr } = await db
    .from("calendar_events")
    .select("id, user_id, title")
    .eq("id", eventId)
    .single();
  if (evErr || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const role = await requireRole(auth.user.id, ["coach", "parent", "player"]);
  if ("error" in role) return role.error;

  if (event.user_id !== auth.user.id) {
    const rel = await requireRelationship(auth.user.id, event.user_id);
    if ("error" in rel) return rel.error;
  }

  const { data: inserted, error } = await db
    .from("event_comments")
    .insert({
      event_id: eventId,
      author_id: auth.user.id,
      author_role: role.role,
      body: text,
    })
    .select("id, event_id, author_id, author_role, body, created_at, updated_at")
    .single();

  if (error || !inserted) {
    console.error("[events/:id/comments POST] insert error:", error?.message);
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }

  // Notify event owner when a guardian comments (fire-and-forget)
  if (role.role !== "player" && event.user_id !== auth.user.id) {
    const { data: author } = await db
      .from("users")
      .select("name")
      .eq("id", auth.user.id)
      .maybeSingle();
    const authorName = author?.name || (role.role === "coach" ? "Your coach" : "Your parent");
    const title = `${authorName} commented`;
    const eventTitle = event.title || "your session";
    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    const notifBody = `On "${eventTitle}": ${preview}`;

    createNotification({
      userId: event.user_id,
      type: "event_comment",
      title,
      body: notifBody,
      data: { eventId, commentId: inserted.id, authorRole: role.role },
      sourceId: eventId,
      sourceType: "calendar_event",
    }).catch(() => { /* best-effort */ });

    sendPushNotification(event.user_id, title, notifBody, {
      eventId,
      commentId: inserted.id,
      type: "event_comment",
    });
  }

  return NextResponse.json({
    comment: {
      id: inserted.id,
      eventId: inserted.event_id,
      authorId: inserted.author_id,
      authorRole: inserted.author_role,
      body: inserted.body,
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at,
    },
  }, { status: 201 });
}
