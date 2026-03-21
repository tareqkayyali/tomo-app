/**
 * Recommendation Dispatcher
 *
 * Routes events to the correct recommendation computers based on
 * the EVENT_TO_REC_TYPES lookup table.
 *
 * Called fire-and-forget after writeSnapshot() in the event processor.
 * Each computer handles its own error logging — failures don't cascade.
 */

import { EVENT_TO_REC_TYPES } from './constants';
import { computeReadinessRec } from './computers/readinessComputer';
import { computeLoadWarningRec } from './computers/loadWarningComputer';
import { computeRecoveryRec } from './computers/recoveryComputer';
import { computeDevelopmentRec } from './computers/developmentComputer';
import { computeAcademicRec } from './computers/academicComputer';
import { computeCvOpportunityRec } from './computers/cvOpportunityComputer';
import { computeTriangleAlertRec } from './computers/triangleAlertComputer';
import { computeMotivationRec } from './computers/motivationComputer';
import type { AthleteEvent } from '../events/types';
import type { RecType } from './types';

/**
 * Trigger recommendation computation for all rec types affected by this event.
 *
 * This is the main entry point called by eventProcessor.ts.
 * Non-blocking — the event processor does NOT await this.
 */
export async function triggerRecommendationComputation(event: AthleteEvent): Promise<void> {
  const recTypes = EVENT_TO_REC_TYPES[event.event_type];

  if (!recTypes || recTypes.length === 0) return;

  for (const recType of recTypes) {
    try {
      await computeRecommendation(event.athlete_id, recType, event);
    } catch (err) {
      // Log but don't stop — other rec types should still compute
      console.error(`[RIE] ${recType} computation failed for ${event.athlete_id}:`, (err as Error).message);
    }
  }
}

/**
 * Dispatch to the correct computer for a specific rec type.
 */
async function computeRecommendation(
  athleteId: string,
  recType: RecType,
  event: AthleteEvent
): Promise<void> {
  switch (recType) {
    case 'READINESS':
      await computeReadinessRec(athleteId, event);
      break;
    case 'LOAD_WARNING':
      await computeLoadWarningRec(athleteId, event);
      break;
    case 'RECOVERY':
      await computeRecoveryRec(athleteId, event);
      break;
    case 'DEVELOPMENT':
      await computeDevelopmentRec(athleteId, event);
      break;
    case 'ACADEMIC':
      await computeAcademicRec(athleteId, event);
      break;
    case 'CV_OPPORTUNITY':
      await computeCvOpportunityRec(athleteId, event);
      break;
    case 'TRIANGLE_ALERT':
      await computeTriangleAlertRec(athleteId, event);
      break;
    case 'MOTIVATION':
      await computeMotivationRec(athleteId, event);
      break;
    default:
      console.warn(`[RIE] Unknown rec type: ${recType}`);
      break;
  }
}
