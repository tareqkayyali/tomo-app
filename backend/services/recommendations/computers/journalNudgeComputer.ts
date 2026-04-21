/**
 * Journal Nudge Recommendation Computer
 *
 * Generates time-sensitive nudges for training journal completion.
 * Two scenarios:
 *   1. Pre-session: Training starts within 60min, no target set → P1
 *   2. Post-session: Training ended, reflection pending → P2
 *
 * $0 cost — deterministic fast-path, no AI calls.
 *
 * Notification fatigue guard: After 7 consecutive missed sessions,
 * reduce to every other session to avoid journal blindness.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { supersedeExisting } from '../supersedeExisting';
import { REC_EXPIRY_HOURS } from '../constants';
import type { AthleteEvent } from '../../events/types';
import type { RecommendationInsert } from '../types';
import { insertRecommendationWithNotify } from '../notifyRec';

/** After N consecutive misses, only nudge every other session */
const FATIGUE_THRESHOLD = 7;

export async function computeJournalNudgeRec(
  athleteId: string,
  event: AthleteEvent
): Promise<void> {
  const db = supabaseAdmin();

  // 1. Read snapshot for journal stats (cast as any — columns not in generated types yet)
  const { data: snapshot } = await (db as any)
    .from('athlete_snapshots')
    .select('pending_pre_journal_count, pending_post_journal_count, journal_streak_days, journal_completeness_7d, last_journal_at')
    .eq('athlete_id', athleteId)
    .single();

  if (!snapshot) return;

  // 2. Fatigue guard — check consecutive misses
  const pendingTotal = ((snapshot as any).pending_pre_journal_count ?? 0) +
                       ((snapshot as any).pending_post_journal_count ?? 0);

  // If the athlete just journaled (this event IS a journal event), supersede existing nudges
  if (event.event_type === 'JOURNAL_PRE_SESSION' || event.event_type === 'JOURNAL_POST_SESSION') {
    await supersedeExisting(athleteId, 'JOURNAL_NUDGE');
    console.log(`[RIE/JournalNudge] Superseded existing nudges for ${athleteId} (journal submitted)`);
    return;
  }

  // 3. Query today's upcoming training events that need journals
  const today = new Date().toISOString().split('T')[0];
  const { data: todayEvents } = await db
    .from('calendar_events')
    .select('id, title, event_type, start_at, end_at')
    .eq('user_id', athleteId)
    .gte('start_at', `${today}T00:00:00Z`)
    .lte('start_at', `${today}T23:59:59Z`)
    .in('event_type', ['training', 'match', 'recovery'])
    .order('start_at', { ascending: true });

  if (!todayEvents || todayEvents.length === 0) return;

  // 4. Check journal state for each event
  const eventIds = todayEvents.map(e => e.id);
  const { data: journals } = await (db as any)
    .from('training_journals')
    .select('calendar_event_id, journal_state, pre_target')
    .eq('user_id', athleteId)
    .in('calendar_event_id', eventIds);

  const journalMap = new Map<string, any>();
  if (Array.isArray(journals)) {
    for (const j of journals) journalMap.set(j.calendar_event_id, j);
  }

  const now = Date.now();

  // 5. Check fatigue — if too many consecutive misses, skip every other
  if (pendingTotal >= FATIGUE_THRESHOLD) {
    // Simple heuristic: only nudge if session index is even
    const totalSessions = todayEvents.length;
    if (totalSessions % 2 !== 0) {
      console.log(`[RIE/JournalNudge] Fatigue guard: skipping nudge for ${athleteId} (${pendingTotal} consecutive misses)`);
      return;
    }
  }

  // 6. Pre-session nudge: training starting within 60min, no target set
  for (const ev of todayEvents) {
    const startMs = new Date(ev.start_at).getTime();
    const minutesUntil = (startMs - now) / 60000;
    const j = journalMap.get(ev.id);
    const journalState = j?.journal_state ?? 'empty';

    if (minutesUntil > 0 && minutesUntil <= 60 && journalState === 'empty') {
      // Supersede any existing JOURNAL_NUDGE
      await supersedeExisting(athleteId, 'JOURNAL_NUDGE');

      const expiryHours = REC_EXPIRY_HOURS.JOURNAL_NUDGE ?? 4;
      const expiresAt = new Date(startMs).toISOString(); // expires at session start

      const rec: RecommendationInsert = {
        athlete_id: athleteId,
        rec_type: 'JOURNAL_NUDGE',
        priority: 1,
        title: `Set your target — ${ev.title} in ${Math.round(minutesUntil)} min`,
        body_short: 'Athletes who train with a clear intention perform better. Takes 30 seconds.',
        body_long: 'Setting a specific target before you train activates deliberate focus. What do you want to achieve in this session?',
        confidence_score: 1.0,
        evidence_basis: {
          calendar_event_id: ev.id,
          event_name: ev.title,
          minutes_until_start: Math.round(minutesUntil),
        },
        trigger_event_id: event.event_id,
        context: {
          action_label: 'Set target',
          deep_link: `tomo://chat?intent=journal_pre&event_id=${ev.id}`,
          calendar_event_id: ev.id,
        },
        expires_at: expiresAt,
      };

      const insertedId = await insertRecommendationWithNotify(db as any, rec);
      if (!insertedId) {
        console.error(`[RIE/JournalNudge] Pre-session insert failed`);
      } else {
        console.log(`[RIE/JournalNudge] P1 "Set target" for ${athleteId} — ${ev.title}`);
      }
      return; // Only one nudge at a time
    }
  }

  // 7. Post-session nudge: training ended, reflection pending
  for (const ev of todayEvents) {
    const endMs = ev.end_at
      ? new Date(ev.end_at).getTime()
      : new Date(ev.start_at).getTime() + 60 * 60000; // default 60min
    const minutesSinceEnd = (now - endMs) / 60000;
    const j = journalMap.get(ev.id);
    const journalState = j?.journal_state ?? 'empty';

    if (minutesSinceEnd > 30 && journalState === 'pre_set') {
      await supersedeExisting(athleteId, 'JOURNAL_NUDGE');

      const endOfDay = new Date(`${today}T23:59:59Z`).toISOString();

      const rec: RecommendationInsert = {
        athlete_id: athleteId,
        rec_type: 'JOURNAL_NUDGE',
        priority: 2,
        title: `Log your reflection — ${ev.title}`,
        body_short: j?.pre_target
          ? `Your target was: "${(j.pre_target as string).slice(0, 60)}". How did it go?`
          : 'How did the session go? Quick reflection helps you grow.',
        body_long: 'Post-session reflection is where improvement compounds. 60 seconds to capture what happened while it\'s fresh.',
        confidence_score: 1.0,
        evidence_basis: {
          calendar_event_id: ev.id,
          event_name: ev.title,
          minutes_since_end: Math.round(minutesSinceEnd),
          pre_target: j?.pre_target ?? null,
        },
        trigger_event_id: event.event_id,
        context: {
          action_label: 'Log reflection',
          deep_link: `tomo://chat?intent=journal_post&event_id=${ev.id}`,
          calendar_event_id: ev.id,
        },
        expires_at: endOfDay,
      };

      const insertedId = await insertRecommendationWithNotify(db as any, rec);
      if (!insertedId) {
        console.error(`[RIE/JournalNudge] Post-session insert failed`);
      } else {
        console.log(`[RIE/JournalNudge] P2 "Log reflection" for ${athleteId} — ${ev.title}`);
      }
      return;
    }
  }
}
