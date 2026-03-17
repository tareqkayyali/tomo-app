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
import { writeSnapshot } from './snapshot/snapshotWriter';
import { triggerRecommendationComputation } from '../recommendations/recommendationDispatcher';
import type { AthleteEvent } from './types';

/**
 * Process a single event. Called by the webhook route.
 *
 * 1. Route to specific handler based on event_type
 * 2. Always write updated snapshot back to Layer 2
 */
export async function processEvent(event: AthleteEvent): Promise<void> {
  const startMs = Date.now();
  const { athlete_id, event_type, event_id } = event;

  console.log(`[EventProcessor] Processing ${event_type} for athlete ${athlete_id} (event: ${event_id})`);

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

      // Passive events — logged in event stream, snapshot meta update only
      case EVENT_TYPES.CLUB_VIEW:
      case EVENT_TYPES.CV_EXPORTED:
      case EVENT_TYPES.MILESTONE_HIT:
      case EVENT_TYPES.SESSION_SKIPPED:
      case EVENT_TYPES.INTRA_SESSION_ADAPT:
      case EVENT_TYPES.ACADEMIC_STRESS_FLAG:
        break;

      default:
        console.warn(`[EventProcessor] Unknown event_type: ${event_type}`);
    }

    // ── Always write updated snapshot ──
    await writeSnapshot(athlete_id, event);

    // ── Layer 4: Recommendation Intelligence Engine (fire-and-forget) ──
    triggerRecommendationComputation(event).catch(err =>
      console.error('[RIE] recommendation computation failed:', err)
    );

    const durationMs = Date.now() - startMs;
    console.log(`[EventProcessor] Completed ${event_type} in ${durationMs}ms`);
  } catch (err) {
    console.error(`[EventProcessor] Error processing ${event_type}:`, (err as Error).message);
    // Don't re-throw — webhook should return 200 to avoid retries on permanent failures.
    // Transient failures will be caught by monitoring.
  }
}
