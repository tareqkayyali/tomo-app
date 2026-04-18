// Triangle — conflict detection service.
//
// Thin I/O wrapper around the pure detectConflict() classifier. Loads
// the event's live annotations, calls the pure function, writes a row
// to conflict_detection_log (every invocation, not just positives),
// and returns the result. No side-effects beyond the log write.
//
// Used by:
//   - GET /api/v1/calendar/events (enriching events with {hasConflict,
//     pill?}).
//   - POST /api/v1/chat/sessions/seed (validating that a caller-
//     claimed mediation actually has a detectable conflict).

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  detectConflict,
  type AnnotationForConflict,
  type ConflictResult,
} from "./conflict";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

const DETECTOR_VERSION = "keyword_v1";

export interface DetectionOptions {
  // Skip logging — useful for high-volume paths where we only care
  // about the verdict. Default false (always log — the offline
  // training corpus depends on it).
  skipLog?: boolean;
}

export async function detectConflictForEvent(
  eventId: string,
  opts: DetectionOptions = {}
): Promise<ConflictResult & { annotationIds: string[]; athleteId: string | null }> {
  const db = supabaseAdmin() as unknown as UntypedDb;

  // Load event + live annotations in parallel.
  const [{ data: event }, { data: rows }] = await Promise.all([
    db
      .from("calendar_events")
      .select("id, user_id")
      .eq("id", eventId)
      .maybeSingle(),
    db
      .from("event_annotations")
      .select("id, author_id, author_role, domain, body, annotation_type, created_at")
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .in("moderation_state", ["cleared", "pending"]),
  ]);

  const athleteId = (event as { user_id: string } | null)?.user_id ?? null;
  const annotations: AnnotationForConflict[] = Array.isArray(rows) ? rows : [];
  const result = detectConflict(annotations);
  const annotationIds = annotations.map((a) => a.id);

  if (!opts.skipLog) {
    try {
      await db.from("conflict_detection_log").insert({
        event_id: eventId,
        athlete_id: athleteId,
        annotation_ids: annotationIds,
        has_conflict: result.hasConflict,
        axis: result.axis,
        author_roles: result.roles,
        authors: result.authors,
        domains: result.domains,
        rationale: result.rationale,
        detector_version: DETECTOR_VERSION,
      });
    } catch (err) {
      // Logging failure must not break the caller — we want the
      // verdict regardless. Console-log so it shows in observability.
      console.error("[conflict] log insert failed:", err);
    }
  }

  return { ...result, annotationIds, athleteId };
}
