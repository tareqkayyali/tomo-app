/**
 * ════════════════════════════════════════════════════════════════════════════
 * UNIFIED ATHLETE STATE — Module Exports
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The single read API for all athlete data in Tomo.
 * Every consumer calls getAthleteState() — nothing else.
 *
 * Usage:
 *
 *   import { getAthleteState } from '@/services/unified';
 *
 *   // Dashboard tab
 *   const state = await getAthleteState(athleteId, {
 *     role: 'ATHLETE',
 *     preset: 'dashboard',
 *   });
 *
 *   // AI Chat
 *   const state = await getAthleteState(athleteId, {
 *     role: 'ATHLETE',
 *     preset: 'chat',
 *     ragQuery: userMessage,
 *   });
 *
 *   // Timeline tab
 *   const state = await getAthleteState(athleteId, {
 *     role: 'ATHLETE',
 *     preset: 'timeline',
 *   });
 * ══════════════════════════════════════════════════════════════════════════
 */

export { getAthleteState } from './getAthleteState';

export type {
  AthleteState,
  AthleteProfile,
  GetAthleteStateOptions,
  ConsumerPreset,
  DailyVitals,
  WeeklyDigest,
  MonthlySummary,
  BenchmarkProfile,
  CalendarEvent,
  ActiveRecommendation,
} from './types';

export { CONSUMER_PRESETS } from './types';
