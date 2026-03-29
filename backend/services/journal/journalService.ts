/**
 * Journal Service — CRUD, state transitions, and locking for training journals.
 *
 * Manages the lifecycle: empty → pre_set → complete → locked.
 * All write operations emit events to the Athlete Data Fabric.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JournalVariant = 'standard' | 'recovery' | 'match';
export type JournalState = 'empty' | 'pre_set' | 'complete';
export type PostOutcome = 'fell_short' | 'hit_it' | 'exceeded';

export interface TrainingJournal {
  id: string;
  user_id: string;
  calendar_event_id: string;
  event_date: string;
  training_category: string;
  training_name: string;
  pre_target: string | null;
  pre_mental_cue: string | null;
  pre_focus_tag: string | null;
  pre_set_at: string | null;
  post_outcome: PostOutcome | null;
  post_reflection: string | null;
  post_next_focus: string | null;
  post_body_feel: number | null;
  post_set_at: string | null;
  journal_variant: JournalVariant;
  ai_insight: string | null;
  ai_insight_generated: boolean;
  journal_state: JournalState;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PreSessionInput {
  calendar_event_id: string;
  pre_target: string;
  pre_mental_cue?: string;
  pre_focus_tag?: string;
}

export interface PostSessionInput {
  journal_id: string;
  post_outcome: PostOutcome;
  post_reflection: string;
  post_next_focus?: string;
  post_body_feel?: number;
}

// ---------------------------------------------------------------------------
// Variant Resolution
// ---------------------------------------------------------------------------

const EVENT_TYPE_TO_VARIANT: Record<string, JournalVariant> = {
  training: 'standard',
  match: 'match',
  recovery: 'recovery',
};

/** Eligible event types for journaling */
export const JOURNAL_ELIGIBLE_TYPES = ['training', 'match', 'recovery'];

/**
 * Resolve the journal variant from the calendar event type.
 * Returns null if the event type is not journal-eligible.
 */
export function resolveJournalVariant(eventType: string): JournalVariant | null {
  return EVENT_TYPE_TO_VARIANT[eventType] ?? null;
}

// ---------------------------------------------------------------------------
// Edit Lock
// ---------------------------------------------------------------------------

const LOCK_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if a journal is editable (within 24h of post_set_at, or pre-only).
 */
export function isEditAllowed(journal: TrainingJournal): boolean {
  if (journal.locked_at) return false;
  if (!journal.post_set_at) return true; // pre editing only
  return Date.now() - new Date(journal.post_set_at).getTime() < LOCK_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// Pre-Session
// ---------------------------------------------------------------------------

/**
 * Set a pre-session target for a calendar event.
 * Creates the journal row if it doesn't exist (UPSERT).
 */
export async function setPreSessionTarget(
  userId: string,
  input: PreSessionInput
): Promise<TrainingJournal> {
  const db = supabaseAdmin();

  // 1. Validate the calendar event belongs to this user and is eligible
  const { data: calEvent, error: eventErr } = await db
    .from('calendar_events')
    .select('id, title, event_type, start_at, user_id')
    .eq('id', input.calendar_event_id)
    .single();

  if (eventErr || !calEvent) {
    throw new Error('Calendar event not found');
  }
  if (calEvent.user_id !== userId) {
    throw new Error('Not authorized to journal this event');
  }

  const variant = resolveJournalVariant(calEvent.event_type);
  if (!variant) {
    throw new Error(`Event type "${calEvent.event_type}" is not eligible for journaling`);
  }

  // 2. Check for existing journal — if complete and locked, reject edit
  const { data: existing } = await (db as any)
    .from('training_journals')
    .select('*')
    .eq('user_id', userId)
    .eq('calendar_event_id', input.calendar_event_id)
    .single();

  if (existing && !isEditAllowed(existing as TrainingJournal)) {
    throw new Error('Journal is locked — edits not allowed after 24 hours');
  }

  // 3. UPSERT the journal
  const now = new Date().toISOString();
  const eventDate = new Date(calEvent.start_at).toISOString().split('T')[0];

  const { data: journal, error: upsertErr } = await (db as any)
    .from('training_journals')
    .upsert(
      {
        user_id: userId,
        calendar_event_id: input.calendar_event_id,
        event_date: eventDate,
        training_category: calEvent.event_type,
        training_name: calEvent.title,
        pre_target: input.pre_target,
        pre_mental_cue: input.pre_mental_cue ?? null,
        pre_focus_tag: input.pre_focus_tag ?? null,
        pre_set_at: now,
        journal_variant: variant,
        journal_state: 'pre_set',
        updated_at: now,
      },
      { onConflict: 'user_id,calendar_event_id' }
    )
    .select()
    .single();

  if (upsertErr || !journal) {
    throw new Error(`Failed to save pre-session target: ${upsertErr?.message}`);
  }

  return journal as TrainingJournal;
}

// ---------------------------------------------------------------------------
// Post-Session
// ---------------------------------------------------------------------------

/**
 * Submit a post-session reflection. Journal must exist in 'pre_set' state
 * (or 'empty' — allow reflection without a pre-target per decisions doc Q6).
 */
export async function setPostSessionReflection(
  userId: string,
  input: PostSessionInput
): Promise<TrainingJournal> {
  const db = supabaseAdmin();

  // 1. Load existing journal
  const { data: existing, error: loadErr } = await (db as any)
    .from('training_journals')
    .select('*')
    .eq('id', input.journal_id)
    .single();

  if (loadErr || !existing) {
    throw new Error('Journal not found');
  }
  if (existing.user_id !== userId) {
    throw new Error('Not authorized');
  }
  if (existing.journal_state === 'complete' && !isEditAllowed(existing as TrainingJournal)) {
    throw new Error('Journal is locked — edits not allowed after 24 hours');
  }

  // 2. Update with post-session fields
  const now = new Date().toISOString();

  const { data: journal, error: updateErr } = await (db as any)
    .from('training_journals')
    .update({
      post_outcome: input.post_outcome,
      post_reflection: input.post_reflection,
      post_next_focus: input.post_next_focus ?? null,
      post_body_feel: input.post_body_feel ?? null,
      post_set_at: now,
      journal_state: 'complete',
      updated_at: now,
    })
    .eq('id', input.journal_id)
    .select()
    .single();

  if (updateErr || !journal) {
    throw new Error(`Failed to save post-session reflection: ${updateErr?.message}`);
  }

  return journal as TrainingJournal;
}

// ---------------------------------------------------------------------------
// Read Operations
// ---------------------------------------------------------------------------

/**
 * Get journal for a specific calendar event.
 */
export async function getJournalForEvent(
  userId: string,
  calendarEventId: string
): Promise<TrainingJournal | null> {
  const db = supabaseAdmin();

  const { data, error } = await (db as any)
    .from('training_journals')
    .select('*')
    .eq('user_id', userId)
    .eq('calendar_event_id', calendarEventId)
    .single();

  if (error || !data) return null;
  return data as TrainingJournal;
}

/**
 * Get paginated journal history for an athlete.
 */
export async function getJournalHistory(
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ journals: TrainingJournal[]; total: number }> {
  const db = supabaseAdmin();

  const { data, error, count } = await (db as any)
    .from('training_journals')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .neq('journal_state', 'empty')
    .order('event_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch journal history: ${error.message}`);
  }

  return {
    journals: (data ?? []) as TrainingJournal[],
    total: count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Snapshot Computation
// ---------------------------------------------------------------------------

/**
 * Compute journal-related snapshot fields.
 * Called by the journal event handler after pre/post submission.
 */
export async function computeJournalSnapshotFields(
  userId: string
): Promise<{
  journal_completeness_7d: number | null;
  journal_streak_days: number;
  target_achievement_rate_30d: number | null;
  last_journal_at: string | null;
  pending_pre_journal_count: number;
  pending_post_journal_count: number;
}> {
  const db = supabaseAdmin();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 48 * 3600 * 1000);
  const todayStr = now.toISOString().split('T')[0];
  const tomorrowStr = new Date(now.getTime() + 24 * 3600 * 1000).toISOString().split('T')[0];

  // Run all queries in parallel
  const [
    sessions7dResult,
    completedJournals7dResult,
    completedJournals30dResult,
    pendingPreResult,
    pendingPostResult,
    lastJournalResult,
  ] = await Promise.all([
    // Eligible sessions in last 7 days
    db
      .from('calendar_events')
      .select('id')
      .eq('user_id', userId)
      .gte('start_at', sevenDaysAgo.toISOString())
      .lte('start_at', now.toISOString())
      .in('event_type', JOURNAL_ELIGIBLE_TYPES),

    // Complete journals in last 7 days
    (db as any)
      .from('training_journals')
      .select('id')
      .eq('user_id', userId)
      .eq('journal_state', 'complete')
      .gte('event_date', sevenDaysAgo.toISOString().split('T')[0]),

    // All completed journals in last 30 days (for achievement rate)
    (db as any)
      .from('training_journals')
      .select('post_outcome')
      .eq('user_id', userId)
      .eq('journal_state', 'complete')
      .gte('event_date', thirtyDaysAgo.toISOString().split('T')[0]),

    // Pending pre: today+tomorrow events with no target
    (db as any)
      .from('training_journals')
      .select('id')
      .eq('user_id', userId)
      .eq('journal_state', 'empty')
      .gte('event_date', todayStr)
      .lte('event_date', tomorrowStr),

    // Pending post: past sessions <48h with no reflection
    (db as any)
      .from('training_journals')
      .select('id')
      .eq('user_id', userId)
      .eq('journal_state', 'pre_set')
      .gte('event_date', twoDaysAgo.toISOString().split('T')[0])
      .lte('event_date', todayStr),

    // Last journal timestamp
    (db as any)
      .from('training_journals')
      .select('post_set_at')
      .eq('user_id', userId)
      .eq('journal_state', 'complete')
      .order('post_set_at', { ascending: false })
      .limit(1),
  ]);

  const totalSessions7d = sessions7dResult.data?.length ?? 0;
  const totalCompleted7d = completedJournals7dResult.data?.length ?? 0;
  const journals30d = completedJournals30dResult.data ?? [];

  const hitOrExceeded = journals30d.filter(
    (j: any) => j.post_outcome === 'hit_it' || j.post_outcome === 'exceeded'
  ).length;

  // Compute streak (consecutive days with at least one complete journal)
  const streakDays = await computeJournalStreak(userId, db);

  return {
    journal_completeness_7d: totalSessions7d > 0
      ? Math.round((totalCompleted7d / totalSessions7d) * 1000) / 1000
      : null,
    journal_streak_days: streakDays,
    target_achievement_rate_30d: journals30d.length > 0
      ? Math.round((hitOrExceeded / journals30d.length) * 1000) / 1000
      : null,
    last_journal_at: lastJournalResult.data?.[0]?.post_set_at ?? null,
    pending_pre_journal_count: pendingPreResult.data?.length ?? 0,
    pending_post_journal_count: pendingPostResult.data?.length ?? 0,
  };
}

/**
 * Compute consecutive days with at least one complete journal (looking backward from today).
 */
async function computeJournalStreak(
  userId: string,
  db: ReturnType<typeof supabaseAdmin>
): Promise<number> {
  const { data } = await (db as any)
    .from('training_journals')
    .select('event_date')
    .eq('user_id', userId)
    .eq('journal_state', 'complete')
    .order('event_date', { ascending: false })
    .limit(60); // Max 60-day lookback

  if (!data || data.length === 0) return 0;

  const uniqueDates = [...new Set(data.map((j: any) => j.event_date as string))].sort().reverse();

  let streak = 0;
  const today = new Date();
  let expectedDate = new Date(today.toISOString().split('T')[0]);

  for (const dateStr of uniqueDates) {
    const journalDate = new Date(dateStr as string);
    const diffDays = Math.round(
      (expectedDate.getTime() - journalDate.getTime()) / (24 * 3600 * 1000)
    );

    if (diffDays <= 1) {
      streak++;
      expectedDate = journalDate;
    } else {
      break;
    }
  }

  return streak;
}
