/**
 * Calendar Journal Helper — attaches journal state to calendar events.
 *
 * Batch-fetches journal_state for a set of calendar event IDs and merges
 * the result into the mapped events. Avoids N+1 queries.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { JOURNAL_ELIGIBLE_TYPES } from '@/services/journal/journalService';

interface MappedEvent {
  id: unknown;
  type: string;
  [key: string]: unknown;
}

/**
 * Attach journalState, preTarget, and postOutcome to an array of mapped calendar events.
 * Only fetches journals for eligible event types (training, match, recovery).
 */
export async function attachJournalState<T extends MappedEvent>(
  events: T[],
  userId: string
): Promise<(T & { journalState: string | null; preTarget: string | null; postOutcome: string | null })[]> {
  if (events.length === 0) return events as any;

  // Filter to journal-eligible events only
  const eligibleIds = events
    .filter(e => JOURNAL_ELIGIBLE_TYPES.includes(String(e.type)))
    .map(e => String(e.id));

  if (eligibleIds.length === 0) {
    return events.map(e => ({ ...e, journalState: null, preTarget: null, postOutcome: null }));
  }

  // Batch fetch journals for all eligible event IDs
  const db = supabaseAdmin();
  const { data: journals } = await (db as any)
    .from('training_journals')
    .select('calendar_event_id, journal_state, pre_target, post_outcome')
    .eq('user_id', userId)
    .in('calendar_event_id', eligibleIds);

  // Build lookup
  const journalMap = new Map<string, { journal_state: string; pre_target: string | null; post_outcome: string | null }>();
  if (journals) {
    for (const j of journals) {
      journalMap.set(j.calendar_event_id, {
        journal_state: j.journal_state,
        pre_target: j.pre_target,
        post_outcome: j.post_outcome,
      });
    }
  }

  // Merge into events
  return events.map(e => {
    const eventId = String(e.id);
    const isEligible = JOURNAL_ELIGIBLE_TYPES.includes(String(e.type));
    const journal = isEligible ? journalMap.get(eventId) : undefined;

    return {
      ...e,
      journalState: journal?.journal_state ?? (isEligible ? 'empty' : null),
      preTarget: journal?.pre_target ?? null,
      postOutcome: journal?.post_outcome ?? null,
    };
  });
}
