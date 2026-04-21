/**
 * Notification Triggers — Maps data events to notification creation.
 *
 * Called fire-and-forget from eventProcessor after writeSnapshot().
 * Reads the updated snapshot to check threshold conditions.
 *
 * Reference: Files/tomo_notification_center_p2.md §9
 */

import { readSnapshot } from '../events/snapshot/snapshotReader';
import {
  createNotification,
  resolveByType,
  resolveBySourceRef,
} from './notificationEngine';
import { supabaseAdmin } from '@/lib/supabase/admin';

const db = () => supabaseAdmin() as any;

// ─── Types ────────────────────────────────────────────────────────────

// Use the canonical event type from the events module
import type { AthleteEvent as CanonicalEvent } from '../events/types';

// Local alias that works with any payload shape
type AthleteEvent = CanonicalEvent;

// ─── Streak Milestones ────────────────────────────────────────────────

const STREAK_MILESTONES = [7, 14, 30, 60, 100];

// ─── Main Dispatcher ──────────────────────────────────────────────────

export async function processDataEvent(event: AthleteEvent): Promise<void> {
  const { event_type, athlete_id } = event;

  switch (event_type) {
    case 'WELLNESS_CHECKIN':
      await handleWellnessCheckinNotifs(event);
      break;

    case 'ASSESSMENT_RESULT':
      await handleAssessmentNotifs(event);
      break;

    case 'INJURY_FLAG':
      await handleInjuryFlagNotif(event);
      break;

    case 'INJURY_CLEARED':
      // Resolve any active injury notifications
      await resolveByType(athlete_id, 'INJURY_RISK_FLAG');
      break;

    case 'JOURNAL_PRE_SESSION':
      // Journal pre completed → resolve the pre-session nudge
      if ((event.payload as any).calendar_event_id) {
        await resolveBySourceRef('journal', String((event.payload as any).calendar_event_id));
      }
      break;

    case 'JOURNAL_POST_SESSION':
      // Journal post completed → resolve the post-session nudge
      if ((event.payload as any).calendar_event_id) {
        await resolveBySourceRef('journal', String((event.payload as any).calendar_event_id));
      }
      break;

    case 'SLEEP_RECORD':
      await handleSleepRecordNotifs(event);
      break;

    case 'COACH_ASSESSMENT':
      await handleCoachAssessmentNotif(event);
      break;

    case 'PARENT_INPUT':
      await handleParentInputNotif(event);
      break;

    case 'TRIANGLE_FLAG':
      await handleTriangleFlagNotif(event);
      break;
  }
}

// ─── Wellness Checkin Notifications ───────────────────────────────────

async function handleWellnessCheckinNotifs(event: AthleteEvent): Promise<void> {
  const { athlete_id, event_id } = event;
  const snapshot = await readSnapshot(athlete_id);
  if (!snapshot) return;

  const acwr = (snapshot as any).acwr ?? 0;
  const wellnessAvg = (snapshot as any).wellness_7day_avg ?? 5;
  const streakDays = (snapshot as any).streak_days ?? 0;
  const readinessScore = (snapshot as any).readiness_score ?? 50;

  // ── LOAD_WARNING_SPIKE: ACWR > 1.5 ──
  if (acwr > 1.5) {
    const daysAbove = await countConsecutiveHighAcwrDays(athlete_id, 1.5);
    if (daysAbove >= 2) {
      await createNotification({
        athleteId: athlete_id,
        type: 'LOAD_WARNING_SPIKE',
        vars: { N: daysAbove, acwr: acwr.toFixed(2) },
        sourceRef: { type: 'snapshot', id: event_id },
      });
    }
  } else if (acwr < 1.3) {
    // Resolve existing LOAD_WARNING_SPIKE if ACWR dropped
    await resolveByType(athlete_id, 'LOAD_WARNING_SPIKE');
  }

  // ── WELLNESS_CRITICAL: avg < 4 for 3+ days ──
  if (wellnessAvg < 4) {
    const lowDays = await countConsecutiveLowWellnessDays(athlete_id, 4);
    if (lowDays >= 3) {
      await createNotification({
        athleteId: athlete_id,
        type: 'WELLNESS_CRITICAL',
        vars: {},
        sourceRef: { type: 'snapshot', id: event_id },
      });
    }
  } else if (wellnessAvg >= 5) {
    // Resolve existing WELLNESS_CRITICAL
    await resolveByType(athlete_id, 'WELLNESS_CRITICAL');
  }

  // ── INJURY_RISK_FLAG / WATCH: from snapshot ──
  // RED \u2192 critical P1 notification (pushes even in quiet hours)
  // AMBER \u2192 training P2 watch card (soft, in-app focus)
  // GREEN/null \u2192 resolve both if present
  const injuryFlag = (snapshot as any).injury_risk_flag;
  const painLocation = (event.payload as any).pain_location ?? 'body';
  if (injuryFlag === 'RED') {
    await createNotification({
      athleteId: athlete_id,
      type: 'INJURY_RISK_FLAG',
      vars: { body_part: painLocation },
      sourceRef: { type: 'snapshot', id: event_id },
    });
    // RED takes precedence \u2014 clear any lingering AMBER watch card
    await resolveByType(athlete_id, 'INJURY_RISK_WATCH');
  } else if (injuryFlag === 'AMBER') {
    await createNotification({
      athleteId: athlete_id,
      type: 'INJURY_RISK_WATCH',
      vars: { body_part: painLocation },
      sourceRef: { type: 'snapshot', id: event_id },
    });
    // Ensure no stale RED flag outlives the athlete clearing down to AMBER
    await resolveByType(athlete_id, 'INJURY_RISK_FLAG');
  } else {
    // GREEN or null \u2014 clear both
    await resolveByType(athlete_id, 'INJURY_RISK_FLAG');
    await resolveByType(athlete_id, 'INJURY_RISK_WATCH');
  }

  // ── CHECKIN_STREAK_MILESTONE ──
  if (STREAK_MILESTONES.includes(streakDays)) {
    await createNotification({
      athleteId: athlete_id,
      type: 'CHECKIN_STREAK_MILESTONE',
      vars: { N: streakDays },
    });
  }

  // ── READINESS_TREND_UP ──
  const prevWeekAvg = await getPreviousWeekReadinessAvg(athlete_id);
  if (prevWeekAvg !== null && readinessScore - prevWeekAvg >= 10) {
    await createNotification({
      athleteId: athlete_id,
      type: 'READINESS_TREND_UP',
      vars: { current: readinessScore, delta: Math.round(readinessScore - prevWeekAvg) },
    });
  }

  // ── Resolve check-in notifications (checkin completed today) ──
  await resolveByType(athlete_id, 'STREAK_AT_RISK');
  // Mark CHECKIN_REMINDER as acted (moves to "Done" section, not expired/hidden)
  await markTypeAsActed(athlete_id, 'CHECKIN_REMINDER');

  // ── DAILY_CHECK_CONFIRMED: subtle positive feedback (in-app only, no push) ──
  // Makes the Center feel alive for healthy athletes whose state triggers
  // nothing else. Dedup group_key = athlete + date \u2014 one per day max.
  const rag = String((snapshot as any).readiness_rag ?? 'GREEN').toUpperCase();
  const ragLabel =
    rag === 'RED' ? 'RED \u2014 ease up'
    : rag === 'AMBER' ? 'AMBER \u2014 moderate'
    : 'GREEN \u2014 ready';
  const ragChipStyle = rag === 'RED' ? 'red' : rag === 'AMBER' ? 'amber' : 'green';
  const today = new Date().toISOString().split('T')[0];
  await createNotification({
    athleteId: athlete_id,
    type: 'DAILY_CHECK_CONFIRMED',
    vars: {
      rag_label: ragLabel,
      rag_chip_style: ragChipStyle,
      streak_days: streakDays,
      date: today,
    },
    sourceRef: { type: 'checkin', id: event_id },
  });
}

// ─── Assessment Notifications ─────────────────────────────────────────

async function handleAssessmentNotifs(event: AthleteEvent): Promise<void> {
  const payload = event.payload as any;
  if (payload.is_new_pb) {
    await createNotification({
      athleteId: event.athlete_id,
      type: 'PERSONAL_BEST',
      vars: {
        test_name: payload.test_name ?? 'Test',
        value: payload.value ?? '',
        percentile: payload.percentile ?? 0,
        benchmark_group: payload.benchmark_group ?? 'peers',
        phase: 'current',
      },
      sourceRef: { type: 'assessment', id: event.event_id },
    });

    // Also create CV_UPDATE_AVAILABLE if PB is eligible for CV
    await createNotification({
      athleteId: event.athlete_id,
      type: 'CV_UPDATE_AVAILABLE',
      vars: {
        reason: `New personal best in ${payload.test_name ?? 'a test'}`,
        N: 0, // days since last CV update
        pct: payload.cv_completeness ?? 0,
      },
    });
  }

  // Check for CV completeness milestones
  const snapshot = await readSnapshot(event.athlete_id);
  if (snapshot) {
    const cvPct = (snapshot as any).cv_completeness ?? 0;
    const milestones = [50, 75, 100];
    for (const milestone of milestones) {
      if (cvPct >= milestone && cvPct < milestone + 5) {
        // Only create if just crossed threshold (within 5% buffer)
        await createNotification({
          athleteId: event.athlete_id,
          type: 'CV_COMPLETENESS_MILESTONE',
          vars: {
            pct: milestone,
            missing_section: cvPct < 100 ? 'remaining sections' : '',
          },
        });
        break; // Only one milestone notification at a time
      }
    }
  }
}

// ─── Injury Flag Notification ─────────────────────────────────────────

async function handleInjuryFlagNotif(event: AthleteEvent): Promise<void> {
  const payload = event.payload as any;
  await createNotification({
    athleteId: event.athlete_id,
    type: 'INJURY_RISK_FLAG',
    vars: { body_part: payload.location ?? 'body' },
    sourceRef: { type: 'event', id: event.event_id },
  });
}

// ─── Stakeholder Notifications ────────────────────────────────────────

async function handleCoachAssessmentNotif(event: AthleteEvent): Promise<void> {
  const payload = event.payload as any;
  await createNotification({
    athleteId: event.athlete_id,
    type: 'COACH_ASSESSMENT_ADDED',
    vars: {
      coach_name: payload.coach_name ?? 'Coach',
      assessment_excerpt: (payload.notes ?? '').slice(0, 80),
      assessment_type: payload.category ?? 'General',
    },
    sourceRef: { type: 'triangle', id: event.event_id },
  });
}

async function handleParentInputNotif(event: AthleteEvent): Promise<void> {
  const payload = event.payload as any;
  await createNotification({
    athleteId: event.athlete_id,
    type: 'PARENT_SCHEDULE_FLAG',
    vars: {
      parent_name: payload.parent_name ?? 'Parent',
      flag_note: (payload.description ?? '').slice(0, 80),
      conflicting_event: payload.conflicting_event ?? 'schedule',
      date: payload.date ?? new Date().toISOString().split('T')[0],
    },
    sourceRef: { type: 'triangle', id: event.event_id },
  });
}

async function handleTriangleFlagNotif(event: AthleteEvent): Promise<void> {
  await createNotification({
    athleteId: event.athlete_id,
    type: 'TRIANGLE_ALIGNMENT_CHANGE',
    vars: {},
    sourceRef: { type: 'triangle', id: event.event_id },
  });
}

// ─── Sleep Record Notifications ──────────────────────────────────────

async function handleSleepRecordNotifs(event: AthleteEvent): Promise<void> {
  const { athlete_id } = event;
  const snapshot = await readSnapshot(athlete_id);
  if (!snapshot) return;

  const acwr = (snapshot as any).acwr ?? 0;

  // Check for consecutive low-quality sleep (quality < 5 for 3+ records)
  const consecutiveLow = await countConsecutiveLowSleepDays(athlete_id, 5);
  if (consecutiveLow >= 3) {
    await createNotification({
      athleteId: athlete_id,
      type: 'SLEEP_QUALITY_DROPPING',
      vars: {
        N: consecutiveLow,
        acwr: acwr.toFixed(2),
      },
      sourceRef: { type: 'snapshot', id: event.event_id },
    });
  } else if (consecutiveLow === 0) {
    // Sleep quality recovered — resolve existing notification
    await resolveByType(athlete_id, 'SLEEP_QUALITY_DROPPING');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function countConsecutiveHighAcwrDays(
  athleteId: string,
  threshold: number,
): Promise<number> {
  const dbClient = db();
  const { data } = await dbClient
    .from('athlete_daily_load')
    .select('load_date, training_load_au')
    .eq('athlete_id', athleteId)
    .order('load_date', { ascending: false })
    .limit(7);

  if (!data || data.length < 7) return 0;

  // Simplified: check how many recent days have high load ratio
  // In production, this would compute ACWR per day
  let consecutiveDays = 0;
  for (const row of data) {
    if ((row.training_load_au ?? 0) > 0) {
      consecutiveDays++;
    } else {
      break;
    }
  }
  return consecutiveDays;
}

async function countConsecutiveLowWellnessDays(
  athleteId: string,
  threshold: number,
): Promise<number> {
  const dbClient = db();
  const { data } = await dbClient
    .from('checkins')
    .select('energy, soreness, mood, created_at')
    .eq('user_id', athleteId)
    .order('created_at', { ascending: false })
    .limit(7);

  if (!data) return 0;

  let consecutiveDays = 0;
  for (const row of data) {
    const avg = ((row.energy ?? 5) + (10 - (row.soreness ?? 5)) + (row.mood ?? 5)) / 3;
    if (avg < threshold) {
      consecutiveDays++;
    } else {
      break;
    }
  }
  return consecutiveDays;
}

async function getPreviousWeekReadinessAvg(athleteId: string): Promise<number | null> {
  const dbClient = db();
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await dbClient
    .from('checkins')
    .select('energy, soreness, mood')
    .eq('user_id', athleteId)
    .gte('created_at', twoWeeksAgo)
    .lt('created_at', oneWeekAgo);

  if (!data || data.length === 0) return null;

  const total = data.reduce((sum: number, row: any) => {
    const energyNorm = ((row.energy ?? 5) / 10) * 100;
    const sorenessNorm = ((10 - (row.soreness ?? 5)) / 10) * 100;
    const moodNorm = ((row.mood ?? 5) / 10) * 100;
    return sum + (energyNorm * 0.4 + sorenessNorm * 0.3 + moodNorm * 0.3);
  }, 0);

  return total / data.length;
}

async function markTypeAsActed(
  athleteId: string,
  type: string,
): Promise<void> {
  const dbClient = db();
  await dbClient
    .from('athlete_notifications')
    .update({
      status: 'acted',
      acted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('status', ['unread', 'read'])
    .eq('athlete_id', athleteId)
    .eq('type', type);
}

async function countConsecutiveLowSleepDays(
  athleteId: string,
  threshold: number,
): Promise<number> {
  const dbClient = db();
  // Query health_data for recent sleep_hours entries (most recent first)
  const { data } = await dbClient
    .from('health_data')
    .select('value, recorded_date')
    .eq('athlete_id', athleteId)
    .eq('metric_key', 'sleep_hours')
    .order('recorded_date', { ascending: false })
    .limit(7);

  if (!data) return 0;

  let consecutiveDays = 0;
  for (const row of data) {
    // sleep_hours < threshold (e.g., 5 hours) = poor sleep
    if ((row.value ?? 8) < threshold) {
      consecutiveDays++;
    } else {
      break;
    }
  }
  return consecutiveDays;
}
