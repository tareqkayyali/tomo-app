import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSession } from "@/services/agents/sessionService";
import { detectConflictForEvent } from "@/services/triangle/conflictDetectionService";

// POST /api/v1/chat/sessions/seed
// Body: { kind: "conflict_mediation", event_id: uuid, annotation_ids?: uuid[] }
//
// Creates a pinned chat session for a contextual entry surface — today
// the Ask Tomo Conflict Mediation pill on calendar event blocks. The
// Python supervisor hydrates seed_context on every turn so the
// conversation stays grounded in the exact event, annotations, safety
// signals, and triangle inputs captured at session-open time.
//
// Pinned snapshot — the seed JSON embeds `snapshot_snapshot_at` so the
// transcript is reproducible even if athlete_snapshots changes after
// the session opens. P3.3 adds a "Data from <time>" banner to the UI
// for session reopens; for now the Python prompt builder uses the
// pinned snapshot values.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

const VALID_KINDS = new Set(["conflict_mediation"]); // others land later

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body", code: "INVALID_BODY" }, { status: 400 });
    }

    const { kind, event_id: eventId, annotation_ids: annotationIds } = body as Record<string, unknown>;

    if (typeof kind !== "string" || !VALID_KINDS.has(kind)) {
      return NextResponse.json(
        { error: "kind must be one of: conflict_mediation", code: "INVALID_KIND" },
        { status: 400 }
      );
    }
    if (typeof eventId !== "string" || eventId.length === 0) {
      return NextResponse.json({ error: "event_id required", code: "EVENT_ID_REQUIRED" }, { status: 400 });
    }

    const db = supabaseAdmin() as unknown as UntypedDb;

    // Load the event + verify caller can access it (athlete owner, or
    // linked guardian via fn_guardian_can_read).
    const { data: event } = await db
      .from("calendar_events")
      .select("id, user_id, title, event_type, start_time, end_time")
      .eq("id", eventId)
      .maybeSingle();

    const eventRow = (event ?? null) as {
      id: string;
      user_id: string;
      title: string | null;
      event_type: string | null;
      start_time: string | null;
      end_time: string | null;
    } | null;

    if (!eventRow) {
      return NextResponse.json({ error: "Event not found", code: "EVENT_NOT_FOUND" }, { status: 404 });
    }

    const athleteId = eventRow.user_id;
    if (auth.user.id !== athleteId) {
      // Not the athlete — check guardian visibility for logistics
      // domain (events are logistics by default).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rpc = db as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: boolean | null }> };
      const { data: canRead } = await rpc.rpc("fn_guardian_can_read", {
        p_player_id: athleteId,
        p_guardian_id: auth.user.id,
        p_domain: "logistics",
      });
      if (!canRead) {
        return NextResponse.json({ error: "Not authorised", code: "UNAUTHORIZED" }, { status: 403 });
      }
    }

    // Run conflict detection (logs the invocation). For
    // conflict_mediation sessions we require an active conflict;
    // otherwise there's nothing to mediate.
    const detection = await detectConflictForEvent(eventId);
    if (kind === "conflict_mediation" && !detection.hasConflict) {
      return NextResponse.json(
        {
          error: "No detectable conflict on this event",
          code: "NO_CONFLICT",
          rationale: detection.rationale,
        },
        { status: 409 }
      );
    }

    // Load the latest snapshot values we want to pin. Tolerate missing
    // rows — Python side degrades gracefully.
    const [{ data: snap }, { data: annotations }] = await Promise.all([
      db
        .from("athlete_snapshots")
        .select("phv_stage, acwr, readiness_rag, last_checkin_at, snapshot_at")
        .eq("athlete_id", athleteId)
        .maybeSingle(),
      db
        .from("event_annotations")
        .select("id, author_id, author_role, domain, annotation_type, body, created_at")
        .eq("event_id", eventId)
        .is("deleted_at", null)
        .in("moderation_state", ["cleared", "pending"])
        .order("created_at", { ascending: true }),
    ]);

    // If caller passed explicit annotation_ids, filter to those;
    // otherwise include every live annotation on the event.
    const allAnnotations = (annotations ?? []) as Array<{
      id: string;
      author_id: string;
      author_role: string;
      domain: string;
      annotation_type: string | null;
      body: string;
      created_at: string;
    }>;

    const filteredAnnotations = Array.isArray(annotationIds) && annotationIds.length > 0
      ? allAnnotations.filter((a) => (annotationIds as string[]).includes(a.id))
      : allAnnotations;

    const snapshotRow = (snap ?? null) as {
      phv_stage: string | null;
      acwr: number | null;
      readiness_rag: string | null;
      last_checkin_at: string | null;
      snapshot_at: string | null;
    } | null;

    const now = new Date().toISOString();
    const seedContext = {
      kind,
      event: {
        id: eventRow.id,
        athlete_id: athleteId,
        title: eventRow.title,
        event_type: eventRow.event_type,
        start_time: eventRow.start_time,
        end_time: eventRow.end_time,
      },
      annotations: filteredAnnotations,
      conflict: {
        has_conflict: detection.hasConflict,
        axis: detection.axis,
        authors: detection.authors,
        roles: detection.roles,
        domains: detection.domains,
        rationale: detection.rationale,
      },
      safety_snapshot: snapshotRow
        ? {
            phv_stage: snapshotRow.phv_stage,
            acwr: snapshotRow.acwr,
            readiness_rag: snapshotRow.readiness_rag,
            last_checkin_at: snapshotRow.last_checkin_at,
          }
        : null,
      snapshot_snapshot_at: snapshotRow?.snapshot_at ?? now,
      pinned_at: now,
      created_from: "ask_tomo_pill",
    };

    const session = await createSession(athleteId, {
      kind: "conflict_mediation",
      seedContext: seedContext as unknown as Record<string, unknown>,
    });

    // Initial assistant message is generated by the Python supervisor
    // on the first user turn using seed_context. We return a short
    // placeholder so the mobile client can render something while the
    // first turn resolves.
    const initialAssistantMessage =
      "Confused? I've pulled the facts for this session — ask me anything about Thursday's plan.";

    return NextResponse.json(
      {
        session_id: session.id,
        seed_kind: "conflict_mediation",
        initial_assistant_message: initialAssistantMessage,
        conflict: seedContext.conflict,
        ok: true,
      },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /chat/sessions/seed]", msg);
    return NextResponse.json({ error: msg, code: "SEED_FAILED" }, { status: 500 });
  }
}
