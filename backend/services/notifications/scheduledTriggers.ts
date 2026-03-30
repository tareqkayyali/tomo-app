/**
 * Scheduled Notification Triggers — time-driven notifications.
 *
 * These run on a schedule (cron or API-triggered) to create notifications
 * based on calendar proximity, staleness, and time-of-day context.
 *
 * Triggers:
 *   - JOURNAL_PRE_SESSION:  sessions starting in 60min, no journal set
 *   - JOURNAL_POST_SESSION: sessions ended 45min ago, no post-journal
 *   - SESSION_STARTING_SOON: sessions starting in 30min
 *   - STREAK_AT_RISK:       no checkin by 21:00, streak >= 5
 *   - REST_DAY_REMINDER:    scheduled rest day, ACWR > 1.2
 *   - STUDY_TRAINING_CONFLICT: study overlaps with training
 *   - EXAM_APPROACHING:     exam within 7 days
 *   - DUAL_LOAD_SPIKE:      dual_load_index > 72 for 2+ days
 *
 * Reference: Files/tomo_notification_center_p2.md §9
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { createNotification, resolveByType } from './notificationEngine';

const db = () => supabaseAdmin() as any;

// ─── Session-Based Triggers (run every 15 min) ───────────────────────

/**
 * Scan for upcoming sessions and create journal/prep notifications.
 * Called every 15 minutes via cron or API.
 */
export async function triggerSessionNotifications(): Promise<{
  preSession: number;
  postSession: number;
  startingSoon: number;
}> {
  const now = new Date();
  let preSession = 0;
  let postSession = 0;
  let startingSoon = 0;

  const dbClient = db();

  // ── JOURNAL_PRE_SESSION: sessions starting in 45-75 min, no journal ──
  const preStart = new Date(now.getTime() + 45 * 60000).toISOString();
  const preEnd = new Date(now.getTime() + 75 * 60000).toISOString();

  const { data: upcomingSessions } = await dbClient
    .from('calendar_events')
    .select('id, user_id, title, event_type, start_at, intensity')
    .in('event_type', ['training', 'match'])
    .gte('start_at', preStart)
    .lte('start_at', preEnd);

  if (upcomingSessions) {
    for (const session of upcomingSessions) {
      // Check if journal pre-target already set
      const { data: journal } = await dbClient
        .from('training_journals')
        .select('id, state')
        .eq('calendar_event_id', session.id)
        .maybeSingle();

      if (!journal || journal.state === 'empty') {
        const startTime = new Date(session.start_at);
        const minutesUntil = Math.round((startTime.getTime() - now.getTime()) / 60000);
        const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        await createNotification({
          athleteId: session.user_id,
          type: 'JOURNAL_PRE_SESSION',
          vars: {
            session_name: session.title || session.event_type,
            N: minutesUntil,
            time: timeStr,
            category: session.event_type,
            event_id: session.id,
            session_start_time: session.start_at,
          },
          sourceRef: { type: 'journal', id: session.id },
        });
        preSession++;
      }
    }
  }

  // ── SESSION_STARTING_SOON: sessions starting in 25-35 min ──
  const soonStart = new Date(now.getTime() + 25 * 60000).toISOString();
  const soonEnd = new Date(now.getTime() + 35 * 60000).toISOString();

  const { data: soonSessions } = await dbClient
    .from('calendar_events')
    .select('id, user_id, title, event_type, start_at')
    .in('event_type', ['training', 'match'])
    .gte('start_at', soonStart)
    .lte('start_at', soonEnd);

  if (soonSessions) {
    for (const session of soonSessions) {
      // Only if no journal pre-target set
      const { data: journal } = await dbClient
        .from('training_journals')
        .select('id, state')
        .eq('calendar_event_id', session.id)
        .maybeSingle();

      if (!journal || journal.state === 'empty') {
        const timeStr = new Date(session.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        await createNotification({
          athleteId: session.user_id,
          type: 'SESSION_STARTING_SOON',
          vars: {
            session_name: session.title || session.event_type,
            time: timeStr,
            event_id: session.id,
            session_start_time: session.start_at,
          },
          sourceRef: { type: 'journal', id: session.id },
        });
        startingSoon++;
      }
    }
  }

  // ── JOURNAL_POST_SESSION: sessions ended 40-50 min ago, no post-journal ──
  const postStart = new Date(now.getTime() - 50 * 60000).toISOString();
  const postEnd = new Date(now.getTime() - 40 * 60000).toISOString();

  const { data: recentSessions } = await dbClient
    .from('calendar_events')
    .select('id, user_id, title, event_type, end_at')
    .in('event_type', ['training', 'match'])
    .gte('end_at', postStart)
    .lte('end_at', postEnd);

  if (recentSessions) {
    for (const session of recentSessions) {
      const { data: journal } = await dbClient
        .from('training_journals')
        .select('id, state, pre_target')
        .eq('calendar_event_id', session.id)
        .maybeSingle();

      // Only nudge if pre-target was set but post not yet completed
      if (journal && journal.state === 'pre_set') {
        const midnight = new Date();
        midnight.setHours(23, 59, 59, 999);
        const hoursLeft = Math.round((midnight.getTime() - now.getTime()) / 3600000);

        await createNotification({
          athleteId: session.user_id,
          type: 'JOURNAL_POST_SESSION',
          vars: {
            session_name: session.title || session.event_type,
            pre_target: journal.pre_target || 'your target',
            N: hoursLeft,
            event_id: session.id,
          },
          sourceRef: { type: 'journal', id: session.id },
        });
        postSession++;
      }
    }
  }

  return { preSession, postSession, startingSoon };
}

// ─── Daily Triggers (run at specific times) ──────────────────────────

/**
 * STREAK_AT_RISK: Athletes with streak >= 5 who haven't checked in today.
 * Run at 21:00 local time.
 */
export async function triggerStreakAtRisk(): Promise<number> {
  const dbClient = db();
  const today = new Date().toISOString().split('T')[0];

  // Find athletes with active streaks who haven't checked in today
  const { data: athletes } = await dbClient
    .from('athlete_snapshots')
    .select('athlete_id, streak_days, last_checkin_at')
    .gte('streak_days', 5);

  if (!athletes) return 0;

  let count = 0;
  for (const athlete of athletes) {
    const lastCheckin = athlete.last_checkin_at
      ? new Date(athlete.last_checkin_at).toISOString().split('T')[0]
      : null;

    if (lastCheckin !== today) {
      await createNotification({
        athleteId: athlete.athlete_id,
        type: 'STREAK_AT_RISK',
        vars: { N: athlete.streak_days },
      });
      count++;
    }
  }

  return count;
}

/**
 * REST_DAY_REMINDER: Athletes on a rest day with elevated ACWR.
 * Run at 06:00 local time.
 */
export async function triggerRestDayReminder(): Promise<number> {
  const dbClient = db();
  const today = new Date().toISOString().split('T')[0];
  const dayStart = `${today}T00:00:00.000Z`;
  const dayEnd = `${today}T23:59:59.999Z`;

  // Find athletes with ACWR > 1.2
  const { data: athletes } = await dbClient
    .from('athlete_snapshots')
    .select('athlete_id, acwr')
    .gt('acwr', 1.2);

  if (!athletes) return 0;

  let count = 0;
  for (const athlete of athletes) {
    // Check if they have any training events today
    const { data: todayEvents } = await dbClient
      .from('calendar_events')
      .select('id')
      .eq('user_id', athlete.athlete_id)
      .in('event_type', ['training', 'match'])
      .gte('start_at', dayStart)
      .lte('start_at', dayEnd)
      .limit(1);

    // If NO training today = rest day
    if (!todayEvents || todayEvents.length === 0) {
      await createNotification({
        athleteId: athlete.athlete_id,
        type: 'REST_DAY_REMINDER',
        vars: {
          acwr: (athlete.acwr ?? 0).toFixed(2),
          date: today,
        },
      });
      count++;
    }
  }

  return count;
}

// ─── Snapshot-Based Triggers (run after snapshot write) ──────────────

/**
 * Check snapshot for DUAL_LOAD_SPIKE and EXAM_APPROACHING conditions.
 * Called after writeSnapshot() for relevant event types.
 */
export async function triggerSnapshotNotifications(
  athleteId: string,
): Promise<void> {
  const dbClient = db();

  // Read latest snapshot
  const { data: snapshot } = await dbClient
    .from('athlete_snapshots')
    .select('dual_load_index, acwr')
    .eq('athlete_id', athleteId)
    .single();

  if (!snapshot) return;

  // ── DUAL_LOAD_SPIKE: dual_load_index > 72 ──
  const dualLoad = snapshot.dual_load_index ?? 0;
  if (dualLoad > 72) {
    await createNotification({
      athleteId,
      type: 'DUAL_LOAD_SPIKE',
      vars: { dual_load: dualLoad },
    });
  } else if (dualLoad < 65) {
    // Resolve existing DUAL_LOAD_SPIKE
    await resolveByType(athleteId, 'DUAL_LOAD_SPIKE');
  }

  // ── EXAM_APPROACHING: exams within 7 days ──
  const today = new Date();
  const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: exams } = await dbClient
    .from('calendar_events')
    .select('id, title, start_at')
    .eq('user_id', athleteId)
    .eq('event_type', 'exam')
    .gte('start_at', today.toISOString())
    .lte('start_at', in7Days.toISOString())
    .order('start_at')
    .limit(3);

  if (exams && exams.length > 0) {
    for (const exam of exams) {
      const examDate = new Date(exam.start_at);
      const daysUntil = Math.ceil((examDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

      await createNotification({
        athleteId,
        type: 'EXAM_APPROACHING',
        vars: {
          subject: exam.title || 'Exam',
          N: daysUntil,
          dual_load: dualLoad,
          date: examDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        },
        sourceRef: { type: 'event', id: exam.id },
      });
    }
  }
}

// ─── Smart Check-in Reminder (run every 15 min) ─────────────────────

/**
 * CHECKIN_REMINDER: Context-aware check-in nudge.
 * - School days: fires 15-60 min after school_end if no checkin today
 * - Weekends: fires 11:00-11:45 if no checkin today
 * Run every 15 min via cron (self-gates by time window).
 */
export async function triggerSmartCheckinReminder(): Promise<number> {
  const dbClient = db();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat

  // Get all athletes with snapshots
  const { data: athletes } = await dbClient
    .from('athlete_snapshots')
    .select('athlete_id');

  if (!athletes) return 0;

  let count = 0;

  for (const athlete of athletes) {
    // Check if already checked in today
    const { data: checkin } = await dbClient
      .from('checkins')
      .select('id')
      .eq('user_id', athlete.athlete_id)
      .eq('date', today)
      .maybeSingle();

    if (checkin) continue; // Already checked in

    // Get schedule preferences
    const { data: prefs } = await dbClient
      .from('player_schedule_preferences')
      .select('school_days, school_end')
      .eq('user_id', athlete.athlete_id)
      .maybeSingle();

    const schoolDays: number[] = prefs?.school_days ?? [0, 1, 2, 3, 4]; // Sun-Thu default
    const schoolEnd = prefs?.school_end ?? '15:00';
    const [seh, sem] = schoolEnd.split(':').map(Number);
    const schoolEndMinutes = seh * 60 + (sem || 0);

    const isSchoolDay = schoolDays.includes(dayOfWeek);

    let shouldFire = false;
    let context = '';
    let dayType = '';

    if (isSchoolDay) {
      // Fire 15-60 min after school ends
      const minutesAfterSchool = currentMinutes - schoolEndMinutes;
      if (minutesAfterSchool >= 15 && minutesAfterSchool <= 60) {
        shouldFire = true;
        context = "School's done for the day";
        dayType = 'After school';
      }
    } else {
      // Weekend: fire between 11:00-11:45
      if (currentMinutes >= 660 && currentMinutes <= 705) {
        shouldFire = true;
        context = 'Weekend morning \u2014 great time for a quick check-in';
        dayType = 'Weekend';
      }
    }

    if (shouldFire) {
      await createNotification({
        athleteId: athlete.athlete_id,
        type: 'CHECKIN_REMINDER',
        vars: {
          context,
          day_type: dayType,
          date: today,
        },
      });
      count++;
    }
  }

  return count;
}

// ─── Sleep Triggers (run in evening window) ─────────────────────────

/**
 * BEDTIME_REMINDER: Athletes whose bedtime is within the next 30 min.
 * Run every 15 min during evening hours (19:00-23:00).
 */
export async function triggerBedtimeReminder(): Promise<number> {
  const dbClient = db();
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Default bedtime: 22:00 (1320 minutes)
  const DEFAULT_BEDTIME_MINUTES = 22 * 60;

  // Get athletes with schedule preferences (for custom bedtime)
  const { data: prefs } = await dbClient
    .from('player_schedule_preferences')
    .select('user_id, sleep_start');

  // Build lookup of athlete → bedtime in minutes
  const bedtimeMap = new Map<string, number>();
  if (prefs) {
    for (const pref of prefs) {
      if (pref.sleep_start) {
        const [h, m] = pref.sleep_start.split(':').map(Number);
        bedtimeMap.set(pref.user_id, h * 60 + (m || 0));
      }
    }
  }

  // Get all active athletes (have a snapshot)
  const { data: athletes } = await dbClient
    .from('athlete_snapshots')
    .select('athlete_id');

  if (!athletes) return 0;

  let count = 0;
  const today = now.toISOString().split('T')[0];

  for (const athlete of athletes) {
    const bedtimeMinutes = bedtimeMap.get(athlete.athlete_id) ?? DEFAULT_BEDTIME_MINUTES;
    const minutesUntilBedtime = bedtimeMinutes - currentMinutes;

    // Notify 15-45 min before bedtime (captures one 15-min cron window)
    if (minutesUntilBedtime >= 15 && minutesUntilBedtime <= 45) {
      const bedtimeStr = `${Math.floor(bedtimeMinutes / 60).toString().padStart(2, '0')}:${(bedtimeMinutes % 60).toString().padStart(2, '0')}`;

      // Check if match tomorrow — if so, use PRE_MATCH_SLEEP_IMPORTANCE instead
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStart = tomorrow.toISOString().split('T')[0] + 'T00:00:00.000Z';
      const tomorrowEnd = tomorrow.toISOString().split('T')[0] + 'T23:59:59.999Z';

      const { data: matchTomorrow } = await dbClient
        .from('calendar_events')
        .select('id, title, start_at')
        .eq('user_id', athlete.athlete_id)
        .eq('event_type', 'match')
        .gte('start_at', tomorrowStart)
        .lte('start_at', tomorrowEnd)
        .limit(1);

      if (matchTomorrow && matchTomorrow.length > 0) {
        // Pre-match sleep notification instead
        const match = matchTomorrow[0];
        const matchTime = new Date(match.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const cutoffHour = Math.max(bedtimeMinutes - 60, 20 * 60); // 1hr before bedtime or 20:00
        const cutoffStr = `${Math.floor(cutoffHour / 60).toString().padStart(2, '0')}:${(cutoffHour % 60).toString().padStart(2, '0')}`;

        await createNotification({
          athleteId: athlete.athlete_id,
          type: 'PRE_MATCH_SLEEP_IMPORTANCE',
          vars: {
            match_time: matchTime,
            target_hours: '9',
            cutoff: cutoffStr,
            date: today,
          },
        });
      } else {
        // Regular bedtime reminder
        await createNotification({
          athleteId: athlete.athlete_id,
          type: 'BEDTIME_REMINDER',
          vars: {
            bedtime: bedtimeStr,
            date: today,
          },
        });
      }
      count++;
    }
  }

  return count;
}

// ─── Conflict Detection ──────────────────────────────────────────────

/**
 * STUDY_TRAINING_CONFLICT: detect overlapping study and training blocks.
 * Called when a new calendar event is created.
 */
export async function checkStudyTrainingConflict(
  athleteId: string,
  calendarEvent: { id: string; event_type: string; start_at: string; end_at: string | null; title: string },
): Promise<void> {
  if (!calendarEvent.end_at) return;

  const dbClient = db();
  const isStudy = calendarEvent.event_type === 'study' || calendarEvent.event_type === 'exam';
  const isTraining = calendarEvent.event_type === 'training' || calendarEvent.event_type === 'match';

  if (!isStudy && !isTraining) return;

  // Find overlapping events of the opposite type
  const oppositeTypes = isStudy ? ['training', 'match'] : ['study', 'exam'];

  const { data: conflicts } = await dbClient
    .from('calendar_events')
    .select('id, title, event_type, start_at, end_at')
    .eq('user_id', athleteId)
    .in('event_type', oppositeTypes)
    .lt('start_at', calendarEvent.end_at)
    .gt('end_at', calendarEvent.start_at)
    .neq('id', calendarEvent.id)
    .limit(1);

  if (conflicts && conflicts.length > 0) {
    const conflict = conflicts[0];
    const dayStr = new Date(calendarEvent.start_at).toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = new Date(calendarEvent.start_at).toISOString().split('T')[0];

    await createNotification({
      athleteId,
      type: 'STUDY_TRAINING_CONFLICT',
      vars: {
        day: dayStr,
        date: dateStr,
        study_block: isStudy ? calendarEvent.title : conflict.title,
        session_name: isTraining ? calendarEvent.title : conflict.title,
      },
      sourceRef: { type: 'event', id: calendarEvent.id },
    });
  }
}
