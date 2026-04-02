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

// Cast to `any` — notification tables (migration 025) not yet in generated Supabase types.
// Run `npx supabase gen types typescript --local` after migration to remove.
const db = () => supabaseAdmin() as any;

// ─── Timing Constants (minutes unless stated) ────────────────────────

/** Pre-session journal nudge: fires when session is this many minutes away (lower bound) */
const PRE_SESSION_WINDOW_MIN = 45;
/** Pre-session journal nudge: fires when session is this many minutes away (upper bound) */
const PRE_SESSION_WINDOW_MAX = 75;

/** Session starting soon: fires when session is this many minutes away (lower bound) */
const STARTING_SOON_WINDOW_MIN = 25;
/** Session starting soon: fires when session is this many minutes away (upper bound) */
const STARTING_SOON_WINDOW_MAX = 35;

/** Post-session journal nudge: fires when session ended this many minutes ago (lower bound) */
const POST_SESSION_WINDOW_MIN = 40;
/** Post-session journal nudge: fires when session ended this many minutes ago (upper bound) */
const POST_SESSION_WINDOW_MAX = 50;

/** Minimum streak length to trigger streak-at-risk */
const STREAK_AT_RISK_MIN_DAYS = 5;

/** ACWR threshold above which rest day reminders fire */
const REST_DAY_ACWR_THRESHOLD = 1.2;

/** Dual load index above which DUAL_LOAD_SPIKE fires */
const DUAL_LOAD_SPIKE_THRESHOLD = 72;
/** Dual load index below which DUAL_LOAD_SPIKE resolves */
const DUAL_LOAD_RESOLVE_THRESHOLD = 65;

/** How far ahead to scan for approaching exams (days) */
const EXAM_LOOKAHEAD_DAYS = 7;

/** Smart check-in: window size in minutes for daily_reminder_time match */
const CHECKIN_REMINDER_WINDOW_MIN = 25;
/** Smart check-in: minutes after school_end before nudge fires (lower) */
const AFTER_SCHOOL_DELAY_MIN = 15;
/** Smart check-in: minutes after school_end before nudge stops (upper) */
const AFTER_SCHOOL_DELAY_MAX = 120;
/** Smart check-in: weekend window start (minutes from midnight, 11:00 AM) */
const WEEKEND_WINDOW_START = 660;
/** Smart check-in: weekend window end (minutes from midnight, 1:00 PM) */
const WEEKEND_WINDOW_END = 780;

/** Bedtime reminder: minutes before bedtime to fire (lower) */
const BEDTIME_WINDOW_MIN = 15;
/** Bedtime reminder: minutes before bedtime to fire (upper) */
const BEDTIME_WINDOW_MAX = 45;

const DEFAULT_TIMEZONE = 'Asia/Riyadh';

/** Minimal shape for player_schedule_preferences rows used in triggers */
interface SchedulePrefs {
  timezone?: string;
  school_days?: number[];
  school_end?: string;
  sleep_start?: string;
}

/** Minimal shape for athlete_notification_preferences rows */
interface NotifPrefs {
  daily_reminder_time?: string;
}

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

  // ── JOURNAL_PRE_SESSION: sessions starting in PRE_SESSION_WINDOW_MIN-MAX min, no journal ──
  const preStart = new Date(now.getTime() + PRE_SESSION_WINDOW_MIN * 60000).toISOString();
  const preEnd = new Date(now.getTime() + PRE_SESSION_WINDOW_MAX * 60000).toISOString();

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
        const { data: prefs } = await dbClient
          .from('player_schedule_preferences')
          .select('timezone')
          .eq('user_id', session.user_id)
          .maybeSingle();
        const timezone = (prefs as SchedulePrefs | null)?.timezone ?? DEFAULT_TIMEZONE;

        const startTime = new Date(session.start_at);
        const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone });

        await createNotification({
          athleteId: session.user_id,
          type: 'JOURNAL_PRE_SESSION',
          vars: {
            session_name: session.title || session.event_type,
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

  // ── SESSION_STARTING_SOON: sessions starting in STARTING_SOON_WINDOW min ──
  const soonStart = new Date(now.getTime() + STARTING_SOON_WINDOW_MIN * 60000).toISOString();
  const soonEnd = new Date(now.getTime() + STARTING_SOON_WINDOW_MAX * 60000).toISOString();

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
        const { data: prefs } = await dbClient
          .from('player_schedule_preferences')
          .select('timezone')
          .eq('user_id', session.user_id)
          .maybeSingle();
        const timezone = (prefs as SchedulePrefs | null)?.timezone ?? DEFAULT_TIMEZONE;

        const timeStr = new Date(session.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone });
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

  // ── JOURNAL_POST_SESSION: sessions ended POST_SESSION_WINDOW min ago ──
  const postStart = new Date(now.getTime() - POST_SESSION_WINDOW_MAX * 60000).toISOString();
  const postEnd = new Date(now.getTime() - POST_SESSION_WINDOW_MIN * 60000).toISOString();

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
    .gte('streak_days', STREAK_AT_RISK_MIN_DAYS);

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
    .gt('acwr', REST_DAY_ACWR_THRESHOLD);

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
  if (dualLoad > DUAL_LOAD_SPIKE_THRESHOLD) {
    await createNotification({
      athleteId,
      type: 'DUAL_LOAD_SPIKE',
      vars: { dual_load: dualLoad },
    });
  } else if (dualLoad < DUAL_LOAD_RESOLVE_THRESHOLD) {
    // Resolve existing DUAL_LOAD_SPIKE
    await resolveByType(athleteId, 'DUAL_LOAD_SPIKE');
  }

  // ── EXAM_APPROACHING: exams within 7 days ──
  const today = new Date();
  const in7Days = new Date(today.getTime() + EXAM_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

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

  // Get all athletes with snapshots
  const { data: athletes } = await dbClient
    .from('athlete_snapshots')
    .select('athlete_id');

  if (!athletes) return 0;

  let count = 0;

  for (const athlete of athletes) {
    // Get schedule preferences (includes timezone)
    const { data: prefs } = await dbClient
      .from('player_schedule_preferences')
      .select('school_days, school_end, timezone')
      .eq('user_id', athlete.athlete_id)
      .maybeSingle();

    // Get notification preferences (daily_reminder_time)
    const { data: notifPrefs } = await dbClient
      .from('athlete_notification_preferences')
      .select('daily_reminder_time')
      .eq('athlete_id', athlete.athlete_id)
      .maybeSingle();

    // Use athlete's local timezone for all time calculations
    const timezone = (prefs as SchedulePrefs | null)?.timezone ?? DEFAULT_TIMEZONE;
    const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const currentMinutes = localNow.getHours() * 60 + localNow.getMinutes();
    const dayOfWeek = localNow.getDay(); // local day of week
    const today = localNow.toISOString().split('T')[0]; // local date (YYYY-MM-DD)

    // Check if already checked in today (local date)
    const { data: checkin } = await dbClient
      .from('checkins')
      .select('id')
      .eq('user_id', athlete.athlete_id)
      .eq('date', today)
      .maybeSingle();

    if (checkin) continue; // Already checked in

    let shouldFire = false;
    let context = '';
    let dayType = '';

    // Priority 1: use daily_reminder_time if set (user-configured fixed time)
    const rawReminderTime = (notifPrefs as NotifPrefs | null)?.daily_reminder_time as string | null | undefined;
    if (rawReminderTime && /^\d{2}:\d{2}/.test(rawReminderTime)) {
      const [rh, rm] = rawReminderTime.split(':').map(Number);
      const reminderMinutes = rh * 60 + (rm || 0);
      // Fire within a 25-min window starting at the set time (covers 2 cron ticks)
      if (currentMinutes >= reminderMinutes && currentMinutes <= reminderMinutes + CHECKIN_REMINDER_WINDOW_MIN) {
        shouldFire = true;
        context = 'Daily check-in time';
        dayType = 'Daily reminder';
      }
    } else {
      // Fallback: fire 15-120 min after school ends (dedup prevents duplicate sends)
      const schoolDays: number[] = prefs?.school_days ?? [0, 1, 2, 3, 4]; // Sun-Thu default
      const schoolEnd = prefs?.school_end ?? '15:00';
      const [seh, sem] = schoolEnd.split(':').map(Number);
      const schoolEndMinutes = seh * 60 + (sem || 0);
      const isSchoolDay = schoolDays.includes(dayOfWeek);

      if (isSchoolDay) {
        const minutesAfterSchool = currentMinutes - schoolEndMinutes;
        if (minutesAfterSchool >= AFTER_SCHOOL_DELAY_MIN && minutesAfterSchool <= AFTER_SCHOOL_DELAY_MAX) {
          shouldFire = true;
          context = "School's done for the day";
          dayType = 'After school';
        }
      } else {
        // Weekend: fire between 11:00-13:00
        if (currentMinutes >= WEEKEND_WINDOW_START && currentMinutes <= WEEKEND_WINDOW_END) {
          shouldFire = true;
          context = 'Weekend morning \u2014 great time for a quick check-in';
          dayType = 'Weekend';
        }
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
 * Run every 15 min during a wide UTC window (15:00-23:00 UTC = covers UTC-1 to UTC+8 bedtime zones).
 * Uses per-athlete timezone from player_schedule_preferences for accurate local time comparison.
 */
export async function triggerBedtimeReminder(): Promise<number> {
  const dbClient = db();
  const now = new Date();

  // Default bedtime: 22:00, default timezone: UTC+3 (Asia/Riyadh)
  const DEFAULT_BEDTIME_MINUTES = 22 * 60;

  // Get athletes with schedule preferences (for custom bedtime + timezone)
  const { data: prefs } = await dbClient
    .from('player_schedule_preferences')
    .select('user_id, sleep_start, timezone');

  // Build lookup: athlete → { bedtimeMinutes, timezone }
  const prefMap = new Map<string, { bedtimeMinutes: number; timezone: string }>();
  if (prefs) {
    for (const pref of prefs) {
      const tz = pref.timezone || DEFAULT_TIMEZONE;
      let bedtimeMinutes = DEFAULT_BEDTIME_MINUTES;
      if (pref.sleep_start) {
        const [h, m] = pref.sleep_start.split(':').map(Number);
        bedtimeMinutes = h * 60 + (m || 0);
      }
      prefMap.set(pref.user_id, { bedtimeMinutes, timezone: tz });
    }
  }

  // Get all active athletes (have a snapshot)
  const { data: athletes } = await dbClient
    .from('athlete_snapshots')
    .select('athlete_id');

  if (!athletes) return 0;

  let count = 0;

  for (const athlete of athletes) {
    const athletePrefs = prefMap.get(athlete.athlete_id) ?? { bedtimeMinutes: DEFAULT_BEDTIME_MINUTES, timezone: DEFAULT_TIMEZONE };
    const { bedtimeMinutes, timezone } = athletePrefs;

    // Compute local time for this athlete's timezone
    const localStr = now.toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
    const [localH, localM] = localStr.split(':').map(Number);
    const localCurrentMinutes = localH * 60 + (localM || 0);

    const minutesUntilBedtime = bedtimeMinutes - localCurrentMinutes;

    // Notify 15-45 min before bedtime (captures one 15-min cron window)
    if (minutesUntilBedtime >= BEDTIME_WINDOW_MIN && minutesUntilBedtime <= BEDTIME_WINDOW_MAX) {
      const bedtimeH = Math.floor(bedtimeMinutes / 60);
      const bedtimeM = bedtimeMinutes % 60;
      const bedtimeStr = `${String(bedtimeH).padStart(2, '0')}:${String(bedtimeM).padStart(2, '0')}`;
      const today = now.toLocaleDateString('en-CA', { timeZone: timezone });

      // Compute the exact UTC ISO when bedtime occurs in the athlete's local timezone
      // localNow has local time components mapped to UTC milliseconds
      const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      const utcOffsetMs = now.getTime() - localNow.getTime();
      localNow.setHours(bedtimeH, bedtimeM, 0, 0);
      const bedtimeExpiry = new Date(localNow.getTime() + utcOffsetMs).toISOString();

      // Check if match tomorrow — if so, use PRE_MATCH_SLEEP_IMPORTANCE instead
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowDate = tomorrow.toLocaleDateString('en-CA', { timeZone: timezone });
      const tomorrowStart = tomorrowDate + 'T00:00:00.000Z';
      const tomorrowEnd = tomorrowDate + 'T23:59:59.999Z';

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
            bedtime_expiry: bedtimeExpiry,
          },
        });
      } else {
        // Regular bedtime reminder — expires exactly at bedtime
        await createNotification({
          athleteId: athlete.athlete_id,
          type: 'BEDTIME_REMINDER',
          vars: {
            bedtime: bedtimeStr,
            date: today,
            bedtime_expiry: bedtimeExpiry,
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
