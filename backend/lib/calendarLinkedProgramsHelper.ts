/**
 * Attach linked training programs to mapped calendar events.
 *
 * Post-migration 049, linked programs live in `public.event_linked_programs`
 * joined with `public.training_programs`. Mobile EventEditScreen expects each
 * event to already carry a `linkedPrograms` array so it never has to poll
 * a second endpoint on initial render.
 *
 * This helper:
 *   1. Collects event IDs from the mapped event list
 *   2. Runs ONE bulk query for all links
 *   3. Buckets links by event_id and attaches them in-place
 *
 * O(n) join in the app layer — cheaper than adding a Supabase nested
 * `select` on every calendar read.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { FOOTBALL_PROGRAMS } from "@/services/programs/footballPrograms";

export interface LinkedProgramForEvent {
  id: string;
  programId: string;
  name: string;
  category: string;
  type: string;
  description: string;
  durationMinutes: number;
  durationWeeks: number;
  difficulty: string;
  tags: string[];
  linkedAt: string;
  linkedBy: "user" | "tomo" | "admin";
}

export interface EventWithPossibleLinks {
  // `id` is `unknown` rather than `string` because `mapDbRowToCalendarEvent`
  // returns a shape whose id originates from a Supabase row with loose
  // typing. We coerce via String() in the helper body so we never treat it
  // as `any` downstream.
  id: unknown;
  linkedPrograms?: LinkedProgramForEvent[];
  [k: string]: unknown;
}

export async function attachLinkedPrograms<T extends EventWithPossibleLinks>(
  events: T[]
): Promise<T[]> {
  if (!events || events.length === 0) return events;

  const eventIds = events
    .map((e) => (e.id != null ? String(e.id) : ""))
    .filter((id) => id.length > 0);
  if (eventIds.length === 0) return events;

  const db = supabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("event_linked_programs")
    .select(
      "id, event_id, program_id, linked_at, linked_by, " +
      "training_programs(id, name, category, type, description, duration_minutes, duration_weeks, difficulty, tags)"
    )
    .in("event_id", eventIds);

  if (error) {
    // Fail open — missing linked programs should never break the calendar.
    console.warn("[linked-programs] bulk fetch failed:", error.message);
    for (const e of events) {
      if (!e.linkedPrograms) e.linkedPrograms = [];
    }
    return events;
  }

  const byEvent = new Map<string, LinkedProgramForEvent[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data as any[]) || []) {
    const list = byEvent.get(row.event_id) ?? [];
    list.push({
      id: row.id,
      programId: row.program_id,
      linkedAt: row.linked_at,
      linkedBy: row.linked_by,
      name: row.training_programs?.name || "",
      category: row.training_programs?.category || "",
      type: row.training_programs?.type || "",
      description: row.training_programs?.description || "",
      durationMinutes: row.training_programs?.duration_minutes || 0,
      durationWeeks: row.training_programs?.duration_weeks || 0,
      difficulty: row.training_programs?.difficulty || "",
      tags: row.training_programs?.tags || [],
    });
    byEvent.set(row.event_id, list);
  }

  for (const e of events) {
    const key = e.id != null ? String(e.id) : "";
    e.linkedPrograms = byEvent.get(key) ?? [];
  }
  return events;
}

// ─── Phase 5: Tomo auto-link writer ─────────────────────────────────────
//
// Called from POST /api/v1/calendar/events when the ai-service
// build_session flow forwards a list of program slugs. Resolves:
//
//    slug -> FOOTBALL_PROGRAMS[].name -> training_programs.id
//
// then upserts event_linked_programs rows with linked_by='tomo'.
// Idempotent via the (event_id, program_id) unique constraint on the
// join table (migration 049). Fail-open: any error logs a warning and
// returns 0 so the caller's try/catch can simply swallow the result.
//
// Why slug indirection: the ai-service is UUID-agnostic — it only
// knows the slug IDs from POSITION_MATRIX. The backend holds the
// FOOTBALL_PROGRAMS import (until Phase 6) and the Supabase admin
// client, so resolution lives here.

export async function autoLinkPrescribedPrograms(args: {
  eventId: string;
  userId: string;
  slugs: string[];
  sport: string;
}): Promise<number> {
  const { eventId, userId, slugs, sport } = args;
  if (!slugs || slugs.length === 0) return 0;

  // 1. slug -> ProgramDef.name (in-memory map, no DB)
  const slugToName = new Map<string, string>(
    FOOTBALL_PROGRAMS.map((p) => [p.id, p.name])
  );
  const names: string[] = [];
  for (const s of slugs) {
    const n = slugToName.get(s);
    if (n) names.push(n);
  }
  if (names.length === 0) {
    console.warn("[auto-link] no known slugs in payload:", slugs);
    return 0;
  }

  // 2. name -> training_programs.id (one query)
  const db = supabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: programs, error: progErr } = await (db as any)
    .from("training_programs")
    .select("id, name")
    .eq("sport_id", sport)
    .eq("active", true)
    .in("name", names);

  if (progErr) {
    console.warn("[auto-link] training_programs lookup failed:", progErr.message);
    return 0;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programIds = ((programs as any[]) || []).map((r) => r.id as string);
  if (programIds.length === 0) {
    console.warn("[auto-link] no active training_programs matched names for sport:", sport);
    return 0;
  }

  // 3. Idempotent batch upsert. The (event_id, program_id) unique
  //    constraint from migration 049 makes retries safe.
  const rows = programIds.map((programId) => ({
    event_id: eventId,
    program_id: programId,
    user_id: userId,
    linked_by: "tomo" as const,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("event_linked_programs")
    .upsert(rows, { onConflict: "event_id,program_id", ignoreDuplicates: false })
    .select("id");

  if (error) {
    console.warn("[auto-link] upsert failed:", error.message);
    return 0;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) || []).length;
}
