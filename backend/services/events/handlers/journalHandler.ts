/**
 * Journal Handler — processes JOURNAL_PRE_SESSION and JOURNAL_POST_SESSION events.
 *
 * Computes journal-related snapshot fields and enriches the event payload
 * so snapshotWriter can persist them.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
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

  // ── Snapshot 360: Journal quality metrics ──
  await enrichJournalSnapshot(event.athlete_id);
}

/**
 * Enrich snapshot with Snapshot 360 journal quality fields:
 * pre_journal_completion_rate, post_journal_completion_rate, avg_post_body_feel_7d
 */
async function enrichJournalSnapshot(athleteId: string): Promise<void> {
  const db = supabaseAdmin();
  const enrichment: Record<string, unknown> = {
    athlete_id: athleteId,
    snapshot_at: new Date().toISOString(),
  };

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Count sessions and journal completions in last 30 days
  const [sessionsRes, preJournalsRes, postJournalsRes, recentPostJournals] = await Promise.all([
    db
      .from('athlete_events')
      .select('event_id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .eq('event_type', 'SESSION_LOG')
      .gte('occurred_at', thirtyDaysAgo),
    (db as any)
      .from('training_journals')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .eq('journal_type', 'pre')
      .gte('created_at', thirtyDaysAgo),
    (db as any)
      .from('training_journals')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .eq('journal_type', 'post')
      .gte('created_at', thirtyDaysAgo),
    (db as any)
      .from('training_journals')
      .select('body_feel')
      .eq('athlete_id', athleteId)
      .eq('journal_type', 'post')
      .gte('created_at', sevenDaysAgo)
      .not('body_feel', 'is', null),
  ]);

  const sessionCount = sessionsRes.count ?? 0;
  if (sessionCount > 0) {
    const preCount = preJournalsRes.count ?? 0;
    const postCount = postJournalsRes.count ?? 0;
    enrichment.pre_journal_completion_rate = Math.round((preCount / sessionCount) * 100) / 100;
    enrichment.post_journal_completion_rate = Math.round((postCount / sessionCount) * 100) / 100;
  }

  // Avg post body feel (7 days)
  if (recentPostJournals.data && recentPostJournals.data.length > 0) {
    const bodyFeels = recentPostJournals.data
      .map((j: any) => j.body_feel as number)
      .filter((v: number) => v != null);
    if (bodyFeels.length > 0) {
      enrichment.avg_post_body_feel_7d = Math.round(
        (bodyFeels.reduce((a: number, b: number) => a + b, 0) / bodyFeels.length) * 10
      ) / 10;
    }
  }

  if (Object.keys(enrichment).length > 2) {
    await (db as any)
      .from('athlete_snapshots')
      .upsert(enrichment, { onConflict: 'athlete_id' });
  }
}
