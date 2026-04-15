/**
 * Event-scoped linked programs API
 * ────────────────────────────────
 * Replaces the previous anti-pattern where linked programs lived inside
 * `schedule_rules.preferences.training_categories[].linkedPrograms` —
 * they now live in the `event_linked_programs` join table (migration 049).
 *
 * Routes:
 *   GET    /api/v1/calendar/events/:id/linked-programs
 *     → returns [{ id, programId, name, category, type, linkedAt, linkedBy }, ...]
 *
 *   POST   /api/v1/calendar/events/:id/linked-programs
 *     body: { programId: uuid, linkedBy?: "user"|"tomo"|"admin" }
 *     → idempotent insert (unique on event_id+program_id). Returns the link row.
 *
 *   DELETE /api/v1/calendar/events/:id/linked-programs?programId=<uuid>
 *     → unlinks a single program from the event.
 *
 * Auth: the caller must own the event (events.user_id = auth user id).
 * Writes use the admin client (service role) after the ownership check.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

// ── Helpers ──────────────────────────────────────────────────────────────

async function assertEventOwned(
  eventId: string,
  userId: string
): Promise<NextResponse | null> {
  const db = supabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("calendar_events")
    .select("id, user_id")
    .eq("id", eventId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (data.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

// ── GET ──────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const guard = await assertEventOwned(id, auth.user.id);
  if (guard) return guard;

  const db = supabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("event_linked_programs")
    .select(
      "id, program_id, linked_at, linked_by, " +
      "training_programs(id, name, category, type, description, duration_minutes, duration_weeks, difficulty, tags)"
    )
    .eq("event_id", id)
    .order("linked_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load linked programs", detail: error.message },
      { status: 500 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkedPrograms = (data || []).map((row: any) => ({
    id: row.id,
    programId: row.program_id,
    linkedAt: row.linked_at,
    linkedBy: row.linked_by,
    // Flatten the joined program for mobile consumption
    name: row.training_programs?.name || "",
    category: row.training_programs?.category || "",
    type: row.training_programs?.type || "",
    description: row.training_programs?.description || "",
    durationMinutes: row.training_programs?.duration_minutes || 0,
    durationWeeks: row.training_programs?.duration_weeks || 0,
    difficulty: row.training_programs?.difficulty || "",
    tags: row.training_programs?.tags || [],
  }));

  return NextResponse.json({ linkedPrograms });
}

// ── POST ─────────────────────────────────────────────────────────────────

const postSchema = z.object({
  programId: z.string().uuid(),
  linkedBy: z.enum(["user", "tomo", "admin"]).default("user"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const guard = await assertEventOwned(id, auth.user.id);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  // Verify the program exists and is active
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prog, error: progErr } = await (db as any)
    .from("training_programs")
    .select("id, name, category, active")
    .eq("id", parsed.data.programId)
    .maybeSingle();

  if (progErr || !prog || !prog.active) {
    return NextResponse.json(
      { error: "Program not found or inactive" },
      { status: 404 }
    );
  }

  // Idempotent upsert on (event_id, program_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("event_linked_programs")
    .upsert(
      {
        event_id: id,
        program_id: parsed.data.programId,
        user_id: auth.user.id,
        linked_by: parsed.data.linkedBy,
      },
      { onConflict: "event_id,program_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to link program", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    link: {
      id: data.id,
      programId: data.program_id,
      linkedAt: data.linked_at,
      linkedBy: data.linked_by,
      name: prog.name,
      category: prog.category,
    },
  });
}

// ── DELETE ───────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const guard = await assertEventOwned(id, auth.user.id);
  if (guard) return guard;

  const url = new URL(req.url);
  const programId = url.searchParams.get("programId");
  if (!programId) {
    return NextResponse.json(
      { error: "Missing programId query parameter" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from("event_linked_programs")
    .delete()
    .eq("event_id", id)
    .eq("program_id", programId)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to unlink program", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
