import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { moderate } from "@/services/moderation/moderate";
import {
  routeAnnotation,
  type AuthorRole,
  type RelationshipRef,
} from "@/services/triangle/annotationRouter";
import { createNotification } from "@/services/notifications/notificationEngine";
import { ageTierFromDob } from "@/services/compliance/ageTier";

// POST /api/v1/event-annotations — add an annotation to a calendar event.
// GET  /api/v1/event-annotations?event_id=<uuid> — list visible annotations.
//
// Write path:
//   1. Validate the caller has access to the event (athlete owns it, or
//      guardian with fn_guardian_can_read visibility).
//   2. Run moderate() on body. severity='critical' → auto_hide before
//      author-echo (no row returned to caller).
//   3. Insert event_annotations row with moderation_state set.
//   4. Fan out via annotationRouter + createNotification. Urgent flag
//      sets bypassFatigue + EVENT_ANNOTATION_URGENT template (priority 5).
//   5. Daily rate cap: 3 urgent annotations / athlete / author / day.
//      Protects against iOS high-priority push throttling.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown }> };

const VALID_TYPES = new Set([
  "context", "concern", "instruction", "celebration", "conflict_flag", "medical_note",
]);
const VALID_DOMAINS = new Set([
  "training", "academic", "wellbeing", "safety", "logistics",
]);

const URGENT_DAILY_CAP = 3;

async function loadEvent(db: UntypedDb, eventId: string): Promise<{ user_id: string; title: string | null } | null> {
  const { data } = await db
    .from("calendar_events")
    .select("user_id, title")
    .eq("id", eventId)
    .maybeSingle();
  return (data ?? null) as { user_id: string; title: string | null } | null;
}

async function authorRoleFor(db: UntypedDb, authorId: string, athleteId: string): Promise<AuthorRole | null> {
  if (authorId === athleteId) return "athlete";
  const { data } = await db
    .from("relationships")
    .select("relationship_type, status")
    .eq("guardian_id", authorId)
    .eq("player_id", athleteId)
    .eq("status", "accepted")
    .maybeSingle();
  const row = (data ?? null) as { relationship_type: string } | null;
  if (!row) return null;
  if (row.relationship_type === "coach" || row.relationship_type === "parent") {
    return row.relationship_type;
  }
  return null;
}

async function loadAthleteRelationships(db: UntypedDb, athleteId: string): Promise<RelationshipRef[]> {
  const { data } = await db
    .from("relationships")
    .select("guardian_id, relationship_type, status")
    .eq("player_id", athleteId)
    .eq("status", "accepted");
  return (data ?? []) as RelationshipRef[];
}

async function loadAthleteProfile(db: UntypedDb, userId: string): Promise<{ date_of_birth: string | null; name: string | null }> {
  const { data } = await db
    .from("users")
    .select("date_of_birth, name")
    .eq("id", userId)
    .maybeSingle();
  return (data ?? { date_of_birth: null, name: null }) as { date_of_birth: string | null; name: string | null };
}

async function loadAuthorName(db: UntypedDb, userId: string): Promise<string> {
  const { data } = await db
    .from("users")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  return ((data as { name: string | null } | null)?.name) ?? "Someone";
}

async function countUrgentToday(db: UntypedDb, athleteId: string, authorId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from("event_annotations")
    .select("id")
    .eq("athlete_id", athleteId)
    .eq("author_id", authorId)
    .eq("urgent", true)
    .gte("created_at", since);
  return ((data ?? []) as Array<{ id: string }>).length;
}

// ── POST ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body", code: "INVALID_BODY" }, { status: 400 });
    }

    const {
      eventId,
      body: text,
      urgent,
      annotationType,
      domain,
      visibility,
    } = body as Record<string, unknown>;

    if (typeof eventId !== "string" || eventId.length === 0) {
      return NextResponse.json({ error: "eventId required", code: "EVENT_ID_REQUIRED" }, { status: 400 });
    }
    if (typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "body required", code: "BODY_REQUIRED" }, { status: 400 });
    }
    if (annotationType !== undefined && (typeof annotationType !== "string" || !VALID_TYPES.has(annotationType))) {
      return NextResponse.json({ error: "Invalid annotationType", code: "INVALID_TYPE" }, { status: 400 });
    }
    if (domain !== undefined && (typeof domain !== "string" || !VALID_DOMAINS.has(domain))) {
      return NextResponse.json({ error: "Invalid domain", code: "INVALID_DOMAIN" }, { status: 400 });
    }

    const db = supabaseAdmin() as unknown as UntypedDb;

    // 1. Load event + verify caller can write to it.
    const event = await loadEvent(db, eventId);
    if (!event) {
      return NextResponse.json({ error: "Event not found", code: "EVENT_NOT_FOUND" }, { status: 404 });
    }
    const athleteId = event.user_id;
    const role = await authorRoleFor(db, auth.user.id, athleteId);
    if (!role) {
      return NextResponse.json(
        { error: "Not authorised for this event", code: "UNAUTHORIZED_AUTHOR" },
        { status: 403 }
      );
    }

    const wantsUrgent = urgent === true;

    // 2. Urgent daily rate cap (Apple push throttle defence).
    if (wantsUrgent) {
      const today = await countUrgentToday(db, athleteId, auth.user.id);
      if (today >= URGENT_DAILY_CAP) {
        return NextResponse.json(
          {
            error: "Daily urgent-annotation cap reached",
            code: "URGENT_CAP_REACHED",
            cap: URGENT_DAILY_CAP,
          },
          { status: 429 }
        );
      }
    }

    // 3. Determine athlete tier for stricter moderation thresholds.
    const athlete = await loadAthleteProfile(db, athleteId);
    const dob = athlete.date_of_birth ? new Date(athlete.date_of_birth) : null;
    const tier = ageTierFromDob(dob);
    const recipientIsMinor = tier === "T1" || tier === "T2" || tier === "UNKNOWN";

    // 4. Moderate. severity='critical' → auto-hide; row is still written
    //    (so moderation queue + audit have it) but no notification fires.
    let modResult: Awaited<ReturnType<typeof moderate>>;
    try {
      modResult = await moderate(
        {
          body: text,
          targetType: "event_annotation",
          authorId: auth.user.id,
          recipientIsMinor,
        }
      );
    } catch (err) {
      // Classifier outage — fail closed. Do not persist, do not notify.
      console.error("[event-annotations] moderate() failed:", err);
      return NextResponse.json(
        { error: "Moderation service unavailable", code: "MODERATION_OUTAGE" },
        { status: 503 }
      );
    }

    const visibilityJson =
      visibility && typeof visibility === "object"
        ? visibility
        : { athlete: true, coach: true, parent: true };

    // 5. Insert annotation row.
    const insertRes = await db
      .from("event_annotations")
      .insert({
        event_id: eventId,
        athlete_id: athleteId,
        author_id: auth.user.id,
        author_role: role,
        annotation_type: typeof annotationType === "string" ? annotationType : "context",
        domain: typeof domain === "string" ? domain : "logistics",
        body: text,
        urgent: wantsUrgent,
        visibility: visibilityJson,
        moderation_state: modResult.moderationState,
      })
      .select("id, created_at")
      .single();

    const inserted = insertRes.data as { id: string; created_at: string } | null;
    if (insertRes.error || !inserted) {
      console.error("[event-annotations] insert error:", insertRes.error);
      return NextResponse.json(
        { error: "Insert failed", code: "INSERT_FAILED" },
        { status: 500 }
      );
    }

    // 6. If auto-hidden, enqueue for review and stop here (no notification).
    if (modResult.autoHide) {
      await db.from("ugc_moderation_queue").insert({
        target_type: "event_annotation",
        target_id: inserted.id,
        trigger: "classifier",
        classifier_score: modResult.classifierScore ?? null,
        severity: modResult.severity,
        state: "auto_hidden",
      });
      return NextResponse.json(
        { id: inserted.id, moderationState: "hidden", notificationsSent: 0, ok: true },
        { status: 201 }
      );
    }

    // 7. Fan out notifications via annotationRouter.
    const relationships = await loadAthleteRelationships(db, athleteId);
    const recipients = routeAnnotation(
      {
        athlete_id: athleteId,
        author_id: auth.user.id,
        author_role: role,
        visibility: visibilityJson as { athlete?: boolean; coach?: boolean; parent?: boolean },
      },
      relationships
    );

    const authorName = await loadAuthorName(db, auth.user.id);
    const excerpt = text.length > 160 ? text.slice(0, 157) + "…" : text;
    const vars: Record<string, string | number> = {
      author_name: authorName,
      author_role: role,
      event_title: event.title ?? "your session",
      event_id: eventId,
      body_excerpt: excerpt,
    };

    const notifType = wantsUrgent ? "EVENT_ANNOTATION_URGENT" : "EVENT_ANNOTATION";
    let delivered = 0;
    for (const r of recipients) {
      // Guardians receive the annotation differently to the athlete —
      // currently we notify only the athlete about coach/parent notes.
      // Fanning out to other triangle members is P2.4 scope (conflict
      // mediation + Triangle Input Registry). For P2.1 we keep the
      // notification surface athlete-only to avoid noise.
      if (r.recipient_role !== "athlete") continue;
      const id = await createNotification({
        athleteId: r.user_id,
        type: notifType,
        vars,
        sourceRef: { type: "event_annotation", id: inserted.id },
        bypassFatigue: wantsUrgent,
      });
      if (id) delivered++;
    }

    // 8. Stamp notification_sent_at so the author can tell the note landed.
    if (delivered > 0) {
      await db
        .from("event_annotations")
        .update({ notification_sent_at: new Date().toISOString() })
        .eq("id", inserted.id);
    }

    return NextResponse.json(
      {
        id: inserted.id,
        moderationState: modResult.moderationState,
        notificationsSent: delivered,
        urgent: wantsUrgent,
        ok: true,
      },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /event-annotations]", msg);
    return NextResponse.json({ error: msg, code: "ANNOTATION_FAILED" }, { status: 500 });
  }
}

// ── GET ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const url = new URL(req.url);
    const eventId = url.searchParams.get("event_id");
    if (!eventId) {
      return NextResponse.json({ error: "event_id required", code: "EVENT_ID_REQUIRED" }, { status: 400 });
    }

    const db = supabaseAdmin() as unknown as UntypedDb;
    // RLS on event_annotations enforces visibility. The admin client
    // bypasses RLS, so we still apply the visibility check at the API
    // layer to prevent leaking coach-only notes to parents etc. when
    // callers use service-role paths.
    const event = await loadEvent(db, eventId);
    if (!event) {
      return NextResponse.json({ annotations: [] });
    }

    const { data } = await db
      .from("event_annotations")
      .select("id, event_id, athlete_id, author_id, author_role, annotation_type, domain, body, urgent, visibility, moderation_state, read_by_athlete_at, notification_sent_at, created_at, edited_at")
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .in("moderation_state", ["cleared", "pending"])
      .order("created_at", { ascending: false })
      .limit(100);

    // Caller-scoped visibility filter.
    const viewerId = auth.user.id;
    const isAthlete = viewerId === event.user_id;
    const viewerRel = isAthlete ? "athlete" : await authorRoleFor(db, viewerId, event.user_id);
    const rows = ((data ?? []) as Array<Record<string, unknown>>).filter((row) => {
      if (row.author_id === viewerId) return true; // author always sees own
      const vis = (row.visibility ?? {}) as Record<string, boolean | undefined>;
      if (viewerRel === "athlete") return vis.athlete !== false;
      if (viewerRel === "coach") return vis.coach !== false;
      if (viewerRel === "parent") return vis.parent !== false;
      return false;
    });

    return NextResponse.json({ annotations: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /event-annotations]", msg);
    return NextResponse.json({ error: msg, code: "LIST_FAILED" }, { status: 500 });
  }
}
