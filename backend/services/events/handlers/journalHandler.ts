/**
 * Journal Handler — processes JOURNAL_PRE_SESSION and JOURNAL_POST_SESSION events.
 *
 * Computes journal-related snapshot fields and enriches the event payload
 * so snapshotWriter can persist them.
 */

import { computeJournalSnapshotFields } from '@/services/journal/journalService';
import type { AthleteEvent, JournalPreSessionPayload, JournalPostSessionPayload } from '../types';

/**
 * Handle JOURNAL_PRE_SESSION:
 * - Recompute pending counts (target set → pending_pre decreases)
 * - Update last_journal_at if applicable
 */
export async function handleJournalPreSession(event: AthleteEvent): Promise<void> {
  const fields = await computeJournalSnapshotFields(event.athlete_id);

  // Enrich the event payload so snapshotWriter can read computed values
  const payload = event.payload as JournalPreSessionPayload;
  (event as any).payload = {
    ...payload,
    computed_pending_pre_count: fields.pending_pre_journal_count,
    computed_pending_post_count: fields.pending_post_journal_count,
    computed_journal_completeness_7d: fields.journal_completeness_7d,
    computed_journal_streak_days: fields.journal_streak_days,
  };
}

/**
 * Handle JOURNAL_POST_SESSION:
 * - Recompute all journal snapshot fields (completeness, streak, achievement rate)
 * - Mark last_journal_at
 */
export async function handleJournalPostSession(event: AthleteEvent): Promise<void> {
  const fields = await computeJournalSnapshotFields(event.athlete_id);

  // Enrich the event payload with all computed journal fields
  const payload = event.payload as JournalPostSessionPayload;
  (event as any).payload = {
    ...payload,
    computed_journal_completeness_7d: fields.journal_completeness_7d,
    computed_journal_streak_days: fields.journal_streak_days,
    computed_target_achievement_rate_30d: fields.target_achievement_rate_30d,
    computed_pending_pre_count: fields.pending_pre_journal_count,
    computed_pending_post_count: fields.pending_post_journal_count,
    computed_last_journal_at: fields.last_journal_at,
  };
}
