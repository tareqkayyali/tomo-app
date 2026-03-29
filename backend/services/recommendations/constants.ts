/**
 * Recommendation Intelligence Engine — Constants
 *
 * Event-to-recommendation routing table and configuration.
 * Determines which rec types need recomputation when an event fires.
 */

import { EVENT_TYPES } from '../events/constants';
import type { RecType } from './types';

// ---------------------------------------------------------------------------
// Event → Rec Type Routing Table
// ---------------------------------------------------------------------------

/**
 * Maps event types to the recommendation types that need recomputation.
 * When an event is processed, the dispatcher looks up affected rec types
 * and invokes the corresponding computers.
 */
export const EVENT_TO_REC_TYPES: Partial<Record<string, RecType[]>> = {
  // Wellness / biometric → readiness + recovery
  [EVENT_TYPES.WELLNESS_CHECKIN]: ['READINESS', 'RECOVERY'],
  [EVENT_TYPES.VITAL_READING]: ['READINESS'],
  [EVENT_TYPES.WEARABLE_SYNC]: ['READINESS'],
  [EVENT_TYPES.SLEEP_RECORD]: ['READINESS', 'RECOVERY'],

  // Training → load, readiness, recovery, motivation
  [EVENT_TYPES.SESSION_LOG]: ['LOAD_WARNING', 'READINESS', 'RECOVERY', 'MOTIVATION'],

  // Competition → load, motivation
  [EVENT_TYPES.COMPETITION_RESULT]: ['LOAD_WARNING', 'MOTIVATION'],

  // Academic → academic load recs
  [EVENT_TYPES.ACADEMIC_EVENT]: ['ACADEMIC'],
  [EVENT_TYPES.STUDY_SESSION_LOG]: ['ACADEMIC'],

  // Assessment → development, CV, motivation
  [EVENT_TYPES.ASSESSMENT_RESULT]: ['DEVELOPMENT', 'CV_OPPORTUNITY', 'MOTIVATION'],

  // Stakeholder → triangle alerts
  [EVENT_TYPES.COACH_ASSESSMENT]: ['TRIANGLE_ALERT'],
  [EVENT_TYPES.PARENT_INPUT]: ['TRIANGLE_ALERT'],
  [EVENT_TYPES.TRIANGLE_FLAG]: ['TRIANGLE_ALERT'],

  // Milestones → motivation
  [EVENT_TYPES.MILESTONE_HIT]: ['MOTIVATION'],

  // Injury — no recs (handled by readiness/load via snapshot flags)
  [EVENT_TYPES.INJURY_FLAG]: [],
  [EVENT_TYPES.INJURY_CLEARED]: [],

  // Journal — nudge + motivation
  [EVENT_TYPES.JOURNAL_PRE_SESSION]: ['JOURNAL_NUDGE'],
  [EVENT_TYPES.JOURNAL_POST_SESSION]: ['JOURNAL_NUDGE', 'MOTIVATION'],
};

// ---------------------------------------------------------------------------
// Expiry Configuration
// ---------------------------------------------------------------------------

/** Default expiration durations per rec type (hours from creation) */
export const REC_EXPIRY_HOURS: Partial<Record<RecType, number>> = {
  READINESS: 24,          // Readiness recs are stale after 24 hours
  LOAD_WARNING: 48,       // Load warnings persist 48 hours
  RECOVERY: 12,           // Recovery windows are time-sensitive
  DEVELOPMENT: 168,       // Development recs persist 7 days
  ACADEMIC: 72,           // Academic recs persist 3 days
  CV_OPPORTUNITY: 336,    // CV opportunities persist 14 days
  TRIANGLE_ALERT: 72,     // Triangle alerts persist 3 days
  MOTIVATION: 48,         // Motivation recs persist 48 hours
  JOURNAL_NUDGE: 4,       // Journal nudges are time-sensitive (4 hours)
};

// ---------------------------------------------------------------------------
// Staleness Thresholds (hours)
// ---------------------------------------------------------------------------

/** Hours since last checkin before readiness data is considered stale */
export const READINESS_STALE_HOURS = 24;

/** Hours since last vital reading that counts as "wearable-only" confidence */
export const WEARABLE_ONLY_HOURS = 12;
