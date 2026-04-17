/**
 * Event Processor — Main router for the Athlete Data Fabric.
 *
 * Triggered by Supabase Database Webhook on every INSERT into athlete_events.
 * Routes to type-specific handlers, then writes the updated snapshot (Layer 2).
 *
 * This is the engine that keeps the Athlete Snapshot current.
 */

import { EVENT_TYPES } from './constants';
import { handleWellnessCheckin } from './handlers/wellnessHandler';
import { handleVitalReading, handleSleepRecord } from './handlers/vitalHandler';
import { handleSessionLog } from './handlers/sessionHandler';
import { handleAssessmentResult, handlePhvMeasurement } from './handlers/assessmentHandler';
import { handleAcademicEvent } from './handlers/academicHandler';
import { handleStakeholderEvent } from './handlers/stakeholderHandler';
import { handleInjuryEvent } from './handlers/injuryHandler';
import { handleCompetitionResult } from './handlers/competitionHandler';
import { handleDrillCompleted } from './handlers/drillHandler';
import { handleJournalPreSession, handleJournalPostSession } from './handlers/journalHandler';
import { handleModeChange } from './handlers/modeChangeHandler';
import { writeSnapshot } from './snapshot/snapshotWriter';
import { readSnapshot } from './snapshot/snapshotReader';
import { logger } from '@/lib/logger';
import { triggerRecommendationComputation } from '../recommendations/recommendationDispatcher';
import { triggerDeepProgramRefreshAsync, isDeepProgramStale } from '../programs/deepProgramRefresh';
import { processDataEvent } from '../notifications/notificationTriggers';
import { triggerSnapshotNotifications } from '../notifications/scheduledTriggers';
import { evaluatePDProtocols } from '../pdil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AthleteEvent } from './types';

/** Event types that should trigger a program recommendation refresh */
const PROGRAM_REFRESH_TRIGGERS = new Set<string>([
  EVENT_TYPES.ASSESSMENT_RESULT,   // New test scores → benchmarks change
  EVENT_TYPES.WELLNESS_CHECKIN,    // Readiness changes → load caps change
  EVENT_TYPES.SESSION_LOG,         // Training load changes → ACWR changes
  EVENT_TYPES.INJURY_FLAG,         // Injury → block categories
  EVENT_TYPES.INJURY_CLEARED,      // Cleared → unblock categories
  EVENT_TYPES.PHV_MEASUREMENT,     // PHV change → program contraindications
  EVENT_TYPES.WEARABLE_SYNC,       // HRV/sleep data → load adjustments
  EVENT_TYPES.ACADEMIC_EVENT,      // Exam period → dual load
  EVENT_TYPES.STUDY_SESSION_LOG,   // Academic load → dual load
  EVENT_TYPES.MODE_CHANGE,         // Mode change → load caps change
  EVENT_TYPES.WEEK_PLAN_CREATED,   // New week plan → recompute rec feed for the week
]);

/**
 * Process a single event. Called by the webhook route.
 *
 * 1. Route to specific handler based on event_type
 * 2. Always write updated snapshot back to Layer 2
 */
export async function processEvent(event: AthleteEvent): Promise<void> {
  const startMs = Date.now();
  const { athlete_id, event_type, event_id } = event;

  try {
    // ── Route to type-specific handler ──
    switch (event_type) {
      // Wellness / mental
      case EVENT_TYPES.WELLNESS_CHECKIN:
        await handleWellnessCheckin(event);
        break;

      // Biometric / wearable
      case EVENT_TYPES.VITAL_READING:
      case EVENT_TYPES.WEARABLE_SYNC:
        await handleVitalReading(event);
        break;

      case EVENT_TYPES.SLEEP_RECORD:
        await handleSleepRecord(event);
        break;

      // Training
      case EVENT_TYPES.SESSION_LOG:
        await handleSessionLog(event);
        break;

      case EVENT_TYPES.DRILL_COMPLETED:
        await handleDrillCompleted(event);
        break;

      // Academic (Angle 2)
      case EVENT_TYPES.ACADEMIC_EVENT:
      case EVENT_TYPES.STUDY_SESSION_LOG:
        await handleAcademicEvent(event);
        break;

      // Assessment / testing
      case EVENT_TYPES.ASSESSMENT_RESULT:
        await handleAssessmentResult(event);
        break;

      case EVENT_TYPES.PHV_MEASUREMENT:
        await handlePhvMeasurement(event);
        break;

      // Stakeholder inputs (Angle 4)
      case EVENT_TYPES.COACH_NOTE:
      case EVENT_TYPES.COACH_ASSESSMENT:
      case EVENT_TYPES.PARENT_INPUT:
      case EVENT_TYPES.TRIANGLE_FLAG:
        await handleStakeholderEvent(event);
        break;

      // Injury events
      case EVENT_TYPES.INJURY_FLAG:
      case EVENT_TYPES.INJURY_CLEARED:
        await handleInjuryEvent(event);
        break;

      // Competition results — updates mastery + CV
      case EVENT_TYPES.COMPETITION_RESULT:
        await handleCompetitionResult(event);
        break;

      // Journal events
      case EVENT_TYPES.JOURNAL_PRE_SESSION:
        await handleJournalPreSession(event);
        break;

      case EVENT_TYPES.JOURNAL_POST_SESSION:
        await handleJournalPostSession(event);
        break;

      // Planning Intelligence
      case EVENT_TYPES.MODE_CHANGE:
        await handleModeChange(event);
        break;

      // Planning passive events — logged in event stream, snapshot meta update only
      case EVENT_TYPES.PLAN_PROPOSED:
      case EVENT_TYPES.PLAN_COMMITTED:
      case EVENT_TYPES.DLI_AMBER:
      case EVENT_TYPES.DLI_RED:
        break;

      // Week planner — the commit endpoint already wrote athlete_week_plans +
      // calendar_events before emitting, so the handler only needs the default
      // downstream processing (snapshot + rec refresh).
      case EVENT_TYPES.WEEK_PLAN_CREATED:
        break;

      // Passive events — logged in event stream, snapshot meta update only
      case EVENT_TYPES.CLUB_VIEW:
      case EVENT_TYPES.CV_EXPORTED:
      case EVENT_TYPES.MILESTONE_HIT:
      case EVENT_TYPES.SESSION_SKIPPED:
      case EVENT_TYPES.INTRA_SESSION_ADAPT:
      case EVENT_TYPES.ACADEMIC_STRESS_FLAG:
        break;

      default:
        logger.warn('Unknown event_type', { event_type, event_id, athlete_id });
    }

    // ── Always write updated snapshot ──
    await writeSnapshot(athlete_id, event);

    // ── PDIL Evaluation (fire-and-forget — audit trail + protocol-triggered actions) ──
    evaluatePDILForEvent(athlete_id, event).catch(err =>
      logger.error('PDIL evaluation failed', { event_type, event_id, athlete_id, error: (err as Error).message })
    );

    // ── Notification Center triggers (fire-and-forget, reads updated snapshot) ──
    processDataEvent(event as any).catch(err =>
      logger.error('Notification trigger failed', { event_type, event_id, athlete_id, error: (err as Error).message })
    );

    // ── Snapshot-based notifications (DUAL_LOAD_SPIKE, EXAM_APPROACHING) ──
    if ([EVENT_TYPES.WELLNESS_CHECKIN, EVENT_TYPES.ACADEMIC_EVENT, EVENT_TYPES.STUDY_SESSION_LOG, EVENT_TYPES.SESSION_LOG].includes(event_type as any)) {
      triggerSnapshotNotifications(athlete_id).catch(err =>
        logger.error('Snapshot notification trigger failed', { event_type, athlete_id, error: (err as Error).message })
      );
    }

    // ── Layer 4: Recommendation Intelligence Engine (fire-and-forget) ──
    triggerRecommendationComputation(event).catch(err =>
      logger.error('Recommendation computation failed', { event_type, event_id, athlete_id, error: (err as Error).message })
    );

    // ── Layer 5: Program Recommendation Refresh (fire-and-forget) ──
    // Only trigger on events that meaningfully change program suitability.
    // Checks staleness first to avoid unnecessary AI calls.
    if (PROGRAM_REFRESH_TRIGGERS.has(event_type)) {
      isDeepProgramStale(athlete_id).then(stale => {
        if (stale) {
          triggerDeepProgramRefreshAsync(athlete_id);
        }
      }).catch(err =>
        logger.error('Program refresh check failed', { event_type, athlete_id, error: (err as Error).message })
      );
    }

    const durationMs = Date.now() - startMs;
  } catch (err) {
    logger.error('Event processing failed', { event_type, event_id, athlete_id, error: (err as Error).message });
    // Don't re-throw — webhook should return 200 to avoid retries on permanent failures.
    // Transient failures will be caught by monitoring.
  }
}

// ============================================================================
// PDIL EVALUATION HELPER
// ============================================================================

/**
 * Reads the freshly-written snapshot + minimal context, then runs PDIL evaluation.
 * This is fire-and-forget — it writes the audit trail and returns PDContext
 * but the eventProcessor doesn't block on it.
 *
 * The PDContext returned here is NOT cached — it's for audit purposes.
 * Screen consumers get their PDContext via getAthleteState() at render time.
 */
async function evaluatePDILForEvent(athleteId: string, event: AthleteEvent): Promise<void> {
  const db = supabaseAdmin();

  // Read the freshly-written snapshot
  const snapshot = await readSnapshot(athleteId, 'ATHLETE');
  if (!snapshot) return; // No snapshot = new athlete, nothing to evaluate yet

  const today = new Date().toISOString().split('T')[0];

  // Parallel: fetch today's vitals, upcoming events, recent load
  const [vitalsResult, eventsResult, loadResult] = await Promise.allSettled([
    // Today's resolved vitals
    (db as any)
      .from('athlete_daily_vitals')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('vitals_date', today)
      .single(),

    // Upcoming 14 days of events (for days_to_exam, has_match_today, etc.)
    (() => {
      const forward = new Date();
      forward.setDate(forward.getDate() + 14);
      return db
        .from('calendar_events')
        .select('*')
        .eq('athlete_id', athleteId)
        .gte('start_at', `${today}T00:00:00`)
        .lte('start_at', forward.toISOString());
    })(),

    // 28 days of daily load (for ACWR trend, load_trend_7d)
    (() => {
      const loadFrom = new Date();
      loadFrom.setDate(loadFrom.getDate() - 28);
      return db
        .from('athlete_daily_load')
        .select('*')
        .eq('athlete_id', athleteId)
        .gte('load_date', loadFrom.toISOString().split('T')[0]);
    })(),
  ]);

  const todayVitals = vitalsResult.status === 'fulfilled' ? vitalsResult.value.data : null;
  const upcomingEvents = eventsResult.status === 'fulfilled' ? (eventsResult.value.data ?? []) : [];
  const recentDailyLoad = loadResult.status === 'fulfilled' ? (loadResult.value.data ?? []) : [];

  await evaluatePDProtocols({
    snapshot: snapshot as Record<string, unknown>,
    todayVitals,
    upcomingEvents: upcomingEvents as any[],
    recentDailyLoad: recentDailyLoad as any[],
    trigger: 'event',
    sourceEventId: event.event_id,
  });
}
