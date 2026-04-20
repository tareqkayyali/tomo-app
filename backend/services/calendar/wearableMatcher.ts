/**
 * ════════════════════════════════════════════════════════════════════════════
 * Wearable → Scheduled Event Matcher
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Incoming WHOOP workouts are matched to the athlete's scheduled
 * physical calendar events within the window defined by
 * load_attribution_v1.completion_triggers.wearable_match.
 *
 * Exactly-one-match wins:
 *   - 0 matches → do nothing (the workout still emits its own
 *                 WEARABLE-sourced SESSION_LOG through the existing path)
 *   - 1 match   → flip status='completed', completion_source='wearable',
 *                 effective_intensity derived from strain via
 *                 intensity_catalog.wearable_strain_to_intensity.whoop
 *   - 2+ matches→ ambiguous, do nothing (athlete will need to confirm
 *                 manually; safer than auto-completing the wrong event)
 *
 * No SESSION_LOG is emitted here — the WHOOP sync route emits its own
 * workout-derived SESSION_LOG through mapWorkoutsToSessionLogs, which
 * already carries strain + duration + HR. Double-counting would inflate
 * ATL/CTL.
 *
 * Pure helpers (`overlapsWithin`, `pickSingleMatch`) exported for unit
 * tests; the main side-effect function is `matchWorkoutToScheduled`.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  getIntensityCatalog,
  whoopStrainToIntensity,
  type IntensityCatalog,
} from '@/services/events/intensityCatalogConfig';
import {
  getLoadAttributionConfig,
  type LoadAttributionConfig,
} from '@/services/events/loadAttributionConfig';
import { toCalendarIntensity, type CalendarIntensity } from './resolveCompletion';

const PHYSICAL_EVENT_TYPES = ['training', 'match', 'recovery'] as const;

export interface WearableWorkoutLite {
  start:  string; // ISO
  end:    string; // ISO
  strain: number;
}

export interface ScheduledEventLite {
  id:         string;
  start_at:   string | null;
  end_at:     string | null;
  intensity:  string | null;
  event_type: string;
}

/**
 * Determine whether a scheduled window overlaps a workout window allowing
 * `beforeMin` minutes of leeway on the start and `afterMin` on the end.
 * Pure — used by the matcher + unit tests.
 */
export function overlapsWithin(params: {
  scheduledStart:  string | null;
  scheduledEnd:    string | null;
  workoutStart:    string;
  workoutEnd:      string;
  beforeMin:       number;
  afterMin:        number;
}): boolean {
  const { scheduledStart, scheduledEnd, workoutStart, workoutEnd, beforeMin, afterMin } = params;
  if (!scheduledStart) return false;

  const sStart = new Date(scheduledStart).getTime();
  const sEnd   = scheduledEnd ? new Date(scheduledEnd).getTime() : sStart + 60 * 60 * 1000; // 1h fallback
  const wStart = new Date(workoutStart).getTime();
  const wEnd   = new Date(workoutEnd).getTime();
  if (!Number.isFinite(sStart) || !Number.isFinite(wStart) || !Number.isFinite(wEnd)) return false;

  const beforeMs = beforeMin * 60 * 1000;
  const afterMs  = afterMin  * 60 * 1000;

  // Scheduled window widened by ± leeway; does the workout fall inside it?
  return wEnd >= (sStart - beforeMs) && wStart <= (sEnd + afterMs);
}

/**
 * Given a list of candidate scheduled events and a workout, return the
 * single event that should be auto-completed, or null if the match is
 * ambiguous (0 or 2+).
 */
export function pickSingleMatch(
  candidates: ScheduledEventLite[],
  workout:    WearableWorkoutLite,
  beforeMin:  number,
  afterMin:   number,
): ScheduledEventLite | null {
  const hits = candidates.filter((c) =>
    overlapsWithin({
      scheduledStart: c.start_at,
      scheduledEnd:   c.end_at,
      workoutStart:   workout.start,
      workoutEnd:     workout.end,
      beforeMin,
      afterMin,
    }),
  );
  return hits.length === 1 ? hits[0] : null;
}

export interface MatcherResult {
  matched:       boolean;
  event_id:      string | null;
  intensity:     CalendarIntensity | null;
  confidence:    number | null;
  reason:        'matched' | 'trigger_disabled' | 'no_match' | 'ambiguous' | 'db_error';
}

/**
 * Attempt to auto-complete a scheduled event from a WHOOP workout. Returns
 * a structured result instead of throwing so the caller (sync route) can
 * log and continue processing the rest of the batch.
 */
export async function matchWorkoutToScheduled(params: {
  athleteId: string;
  workout:   WearableWorkoutLite;
}): Promise<MatcherResult> {
  const { athleteId, workout } = params;

  const [loadAttr, catalog] = await Promise.all([
    getLoadAttributionConfig({ athleteId }),
    getIntensityCatalog({ athleteId }),
  ]);

  const trig = loadAttr.completion_triggers.wearable_match;
  if (!trig.enabled) {
    return { matched: false, event_id: null, intensity: null, confidence: null, reason: 'trigger_disabled' };
  }

  const db = supabaseAdmin();

  // Broad search window — we filter precisely via overlapsWithin. Pull
  // events whose start is within 24h of the workout to keep the row
  // count bounded.
  const wStart = new Date(workout.start).getTime();
  const windowStart = new Date(wStart - 24 * 60 * 60 * 1000).toISOString();
  const windowEnd   = new Date(wStart + 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await (db as any)
    .from('calendar_events')
    .select('id, start_at, end_at, intensity, event_type')
    .eq('user_id', athleteId)
    .eq('status', 'scheduled')
    .in('event_type', PHYSICAL_EVENT_TYPES as readonly string[])
    .gte('start_at', windowStart)
    .lte('start_at', windowEnd);

  if (error) {
    return { matched: false, event_id: null, intensity: null, confidence: null, reason: 'db_error' };
  }

  const chosen = pickSingleMatch(
    (candidates ?? []) as ScheduledEventLite[],
    workout,
    trig.window_minutes_before,
    trig.window_minutes_after,
  );
  if (!chosen) {
    const reason = (candidates ?? []).length === 0 ? 'no_match' : 'ambiguous';
    return { matched: false, event_id: null, intensity: null, confidence: null, reason };
  }

  const effectiveIntensity: CalendarIntensity = toCalendarIntensity(
    whoopStrainToIntensity(catalog, workout.strain),
  );

  const { error: updErr } = await (db as any)
    .from('calendar_events')
    .update({
      status:              'completed',
      completed:           true,
      completed_at:        new Date().toISOString(),
      completion_source:   'wearable',
      confidence_score:    trig.confidence,
      effective_intensity: effectiveIntensity,
    })
    .eq('id', chosen.id);

  if (updErr) {
    return { matched: false, event_id: chosen.id, intensity: null, confidence: null, reason: 'db_error' };
  }

  return {
    matched:    true,
    event_id:   chosen.id,
    intensity:  effectiveIntensity,
    confidence: trig.confidence,
    reason:     'matched',
  };
}
