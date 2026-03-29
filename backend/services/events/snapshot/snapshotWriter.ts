/**
 * Snapshot Writer — writes the updated athlete snapshot after every event.
 *
 * Called at the end of every event processing cycle. Ensures the snapshot
 * is always up-to-date with the latest event and derived computations.
 *
 * The handlers have already written specific fields (ACWR, wellness trend, etc.).
 * This function handles the meta fields and any cross-cutting concerns.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';
import { readinessToRag } from '../constants';
import type { AthleteEvent, WellnessCheckinPayload } from '../types';

type SnapshotUpsert = Database['public']['Tables']['athlete_snapshots']['Insert'];

/**
 * Update the athlete snapshot with meta fields from the latest event.
 * Individual handlers have already written their specific computed fields.
 */
export async function writeSnapshot(athleteId: string, event: AthleteEvent): Promise<void> {
  const db = supabaseAdmin();

  // Build the base update — always set last_event_id and snapshot_at
  const update: Partial<SnapshotUpsert> & { athlete_id: string } = {
    athlete_id: athleteId,
    last_event_id: event.event_id,
    snapshot_at: new Date().toISOString(),
  };

  // Update type-specific meta fields
  switch (event.event_type) {
    case 'WELLNESS_CHECKIN': {
      const payload = event.payload as WellnessCheckinPayload;
      update.last_checkin_at = event.occurred_at;

      // If readiness was computed by the handler, set readiness fields
      if (payload.computed_readiness_level) {
        update.readiness_rag = readinessToRag(payload.computed_readiness_level);
        update.readiness_score = payload.computed_readiness_score ?? null;
      }
      break;
    }

    case 'SESSION_LOG': {
      // Scheduled events (from calendar bridge) should NOT update last_session_at
      // — that should only reflect actual completed sessions
      const sessionPayload = event.payload as any;
      if (!sessionPayload?.scheduled) {
        update.last_session_at = event.occurred_at;
      }
      break;
    }

    case 'COMPETITION_RESULT':
      update.last_session_at = event.occurred_at;
      break;

    case 'JOURNAL_PRE_SESSION':
    case 'JOURNAL_POST_SESSION': {
      const journalPayload = event.payload as Record<string, unknown>;
      if (journalPayload.computed_journal_completeness_7d !== undefined) {
        (update as any).journal_completeness_7d = journalPayload.computed_journal_completeness_7d;
      }
      if (journalPayload.computed_journal_streak_days !== undefined) {
        (update as any).journal_streak_days = journalPayload.computed_journal_streak_days;
      }
      if (journalPayload.computed_target_achievement_rate_30d !== undefined) {
        (update as any).target_achievement_rate_30d = journalPayload.computed_target_achievement_rate_30d;
      }
      if (journalPayload.computed_pending_pre_count !== undefined) {
        (update as any).pending_pre_journal_count = journalPayload.computed_pending_pre_count;
      }
      if (journalPayload.computed_pending_post_count !== undefined) {
        (update as any).pending_post_journal_count = journalPayload.computed_pending_post_count;
      }
      if (journalPayload.computed_last_journal_at) {
        (update as any).last_journal_at = journalPayload.computed_last_journal_at;
      }
      break;
    }
  }

  // Ensure the snapshot row exists (first event for a new athlete)
  // Load profile data if this is the first snapshot
  const { data: existing } = await db
    .from('athlete_snapshots')
    .select('athlete_id')
    .eq('athlete_id', athleteId)
    .single();

  if (!existing) {
    // First-time snapshot — seed with profile data
    // Note: users table only has sport; position/height/weight live in athlete_snapshots
    const { data: profile } = await db
      .from('users')
      .select('sport')
      .eq('id', athleteId)
      .single();

    if (profile) {
      update.sport = profile.sport ?? null;
    }
  }

  // UPSERT — creates on first event, updates thereafter
  const { error } = await db
    .from('athlete_snapshots')
    .upsert(update as SnapshotUpsert, { onConflict: 'athlete_id' });

  if (error) {
    console.error('[SnapshotWriter] Upsert failed:', error.message, { athleteId });
  }
}
