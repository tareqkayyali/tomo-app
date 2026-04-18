// Calendar — attach conflict flags to a list of events.
//
// Companion to attachJournalState + attachLinkedPrograms. Runs
// detectConflict() against the live annotations of each event and
// stamps hasConflict + conflictAxis on the mapped object so the
// mobile client can render the Ask Tomo pill inline.
//
// Batch-optimised: one query for all annotations across the event set,
// then the pure classifier runs per-event in memory. No per-event DB
// round-trip.
//
// Detection logging: we DO NOT log to conflict_detection_log from this
// hot-path surface. Logging happens at the seed endpoint (one row per
// Ask-Tomo-pill-tap), which is the actionable signal we want for
// offline training. Listing events calls detectConflict potentially
// dozens of times per minute — logging there would drown the corpus
// in noise.

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  detectConflict,
  type AnnotationForConflict,
} from "@/services/triangle/conflict";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

export interface EventWithId {
  // Permissive — upstream mapping returns `unknown` since raw JSON
  // rows land here. We coerce via String() at runtime; the contract
  // is "anything that stringifies to an event UUID".
  id: unknown;
}

export async function attachConflictFlags<T extends EventWithId>(
  events: T[]
): Promise<(T & { hasConflict: boolean; conflictAxis?: string })[]> {
  if (!events || events.length === 0) {
    return events as (T & { hasConflict: boolean; conflictAxis?: string })[];
  }

  const ids = events.map((e) => String(e.id));
  const db = supabaseAdmin() as unknown as UntypedDb;

  let rows: AnnotationForConflict[] = [];
  try {
    const { data } = await db
      .from("event_annotations")
      .select("id, event_id, author_id, author_role, domain, annotation_type, body, created_at")
      .in("event_id", ids)
      .is("deleted_at", null)
      .in("moderation_state", ["cleared", "pending"]);

    const annotationsByEvent = new Map<string, AnnotationForConflict[]>();
    for (const r of (data ?? []) as Array<AnnotationForConflict & { event_id: string }>) {
      const key = String(r.event_id);
      const existing = annotationsByEvent.get(key);
      if (existing) {
        existing.push(r);
      } else {
        annotationsByEvent.set(key, [r]);
      }
    }

    return events.map((e) => {
      const evId = String(e.id);
      const anns = annotationsByEvent.get(evId) ?? [];
      if (anns.length === 0) {
        return { ...e, hasConflict: false } as T & { hasConflict: boolean };
      }
      const result = detectConflict(anns);
      return {
        ...e,
        hasConflict: result.hasConflict,
        ...(result.hasConflict && result.axis !== "unknown"
          ? { conflictAxis: result.axis }
          : {}),
      } as T & { hasConflict: boolean; conflictAxis?: string };
    });
  } catch (err) {
    // Fail-closed: on any error return events with hasConflict=false.
    // Worst case the Ask Tomo pill doesn't show — the athlete can open
    // an event and see the annotations directly.
    console.error("[attachConflictFlags] failed:", err);
    rows; // placate linter about unused rows declaration
    return events.map((e) => ({
      ...e,
      hasConflict: false,
    })) as (T & { hasConflict: boolean })[];
  }
}
