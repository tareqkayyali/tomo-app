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
import { computeDataConfidence } from '@/services/snapshot/dataConfidenceScore';
import { triggerAIBRegeneration } from '@/services/agents/aiServiceProxy';
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

  // ── Snapshot 360: Cross-cutting enrichment ──
  await enrichCrossCuttingFields(db, athleteId, update);

  // UPSERT — creates on first event, updates thereafter
  const { error } = await db
    .from('athlete_snapshots')
    .upsert(update as SnapshotUpsert, { onConflict: 'athlete_id' });

  if (error) {
    console.error('[SnapshotWriter] Upsert failed:', error.message, { athleteId });
  } else {
    // Fire-and-forget: trigger AIB regeneration on the Python AI service.
    // Non-blocking — event pipeline performance unaffected.
    triggerAIBRegeneration(athleteId);
  }
}

/**
 * Enrich the snapshot update with cross-cutting fields computed from multiple sources.
 * Called on every event to keep schedule context, data confidence, and wearable status fresh.
 */
async function enrichCrossCuttingFields(
  db: any,
  athleteId: string,
  update: Record<string, unknown>
): Promise<void> {
  const now = new Date();

  try {
    // Run lightweight queries in parallel
    const [calendarRes, wearableRes, checkinRes, sessionRes, subjectsRes] = await Promise.all([
      // Schedule context: matches + exams in upcoming window
      db
        .from('calendar_events')
        .select('event_type, start_time')
        .eq('athlete_id', athleteId)
        .gte('start_time', now.toISOString())
        .lte('start_time', new Date(now.getTime() + 14 * 86400000).toISOString())
        .in('event_type', ['match', 'exam']),

      // Wearable freshness: last vital reading timestamp
      db
        .from('athlete_daily_vitals')
        .select('date')
        .eq('athlete_id', athleteId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Last checkin timestamp
      db
        .from('athlete_events')
        .select('occurred_at')
        .eq('athlete_id', athleteId)
        .eq('event_type', 'WELLNESS_CHECKIN')
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Last session logged timestamp
      db
        .from('athlete_events')
        .select('occurred_at')
        .eq('athlete_id', athleteId)
        .eq('event_type', 'SESSION_LOG')
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Subject count for data confidence
      db
        .from('athlete_subjects')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId),
    ]);

    // Schedule context
    if (calendarRes.data) {
      const events = calendarRes.data as Array<{ event_type: string; start_time: string }>;
      const sevenDayLimit = new Date(now.getTime() + 7 * 86400000);
      update.matches_next_7d = events.filter(
        e => e.event_type === 'match' && new Date(e.start_time) <= sevenDayLimit
      ).length;
      update.exams_next_14d = events.filter(e => e.event_type === 'exam').length;

      // Check if any exam is within 14 days
      const hasExamSoon = events.some(e => e.event_type === 'exam');
      update.in_exam_period = hasExamSoon;
    }

    // Sessions scheduled next 7 days
    const { count: scheduledCount } = await db
      .from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .gte('start_time', now.toISOString())
      .lte('start_time', new Date(now.getTime() + 7 * 86400000).toISOString())
      .in('event_type', ['club', 'gym', 'match', 'recovery']);

    if (scheduledCount != null) {
      update.sessions_scheduled_next_7d = scheduledCount;
    }

    // Wearable status
    if (wearableRes.data?.date) {
      const lastSyncDate = new Date(wearableRes.data.date);
      const hoursSinceSync = (now.getTime() - lastSyncDate.getTime()) / (60 * 60 * 1000);
      update.wearable_connected = hoursSinceSync <= 48;
      update.wearable_last_sync_at = lastSyncDate.toISOString();
    } else {
      update.wearable_connected = false;
    }

    // Data confidence score
    const confidence = computeDataConfidence({
      wearable_last_sync_at: wearableRes.data?.date ? new Date(wearableRes.data.date) : null,
      last_checkin_at: checkinRes.data?.occurred_at ? new Date(checkinRes.data.occurred_at) : null,
      last_session_logged_at: sessionRes.data?.occurred_at ? new Date(sessionRes.data.occurred_at) : null,
      last_scheduled_session_at: null, // Would need separate query — skip for now
      athlete_subjects_count: subjectsRes.count ?? 0,
      asOf: now,
    });

    update.data_confidence_score = confidence.data_confidence_score;
    update.data_confidence_breakdown = confidence.data_confidence_breakdown;
  } catch (err) {
    // Cross-cutting enrichment is best-effort — don't fail the snapshot write
    console.warn('[SnapshotWriter] Cross-cutting enrichment failed:', err);
  }
}
