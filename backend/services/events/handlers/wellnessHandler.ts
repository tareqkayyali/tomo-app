/**
 * Wellness Handler — processes WELLNESS_CHECKIN events.
 *
 * Calls the existing readinessCalculator pure functions to compute
 * readiness level and score. Does NOT duplicate logic — imports directly.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { calculateReadiness } from '@/services/readinessCalculator';
import { recomputeWellnessTrend } from '../computations/wellnessTrend';
import type { AthleteEvent, WellnessCheckinPayload } from '../types';
import { readinessToRag } from '../constants';

/**
 * Handle a WELLNESS_CHECKIN event:
 * 1. Compute readiness from the checkin payload (reuses existing pure function)
 * 2. Recompute 7-day wellness trend
 * 3. Store computed values back into the event payload (enrichment)
 */
export async function handleWellnessCheckin(event: AthleteEvent): Promise<void> {
  const payload = event.payload as WellnessCheckinPayload;

  // 1. Compute readiness using the existing pure function
  const readinessResult = calculateReadiness({
    energy: payload.energy,
    soreness: payload.soreness,
    painFlag: payload.pain_flag,
    painLocation: payload.pain_location,
    sleepHours: payload.sleep_hours,
    effortYesterday: payload.effort_yesterday ?? 5,
    mood: payload.mood,
    academicStress: payload.academic_stress,
  });

  // 2. Compute a numeric score (0–100) from the readiness components
  const score = computeReadinessScore(payload, readinessResult.readiness);

  // 3. Enrich the event payload with computed values (for audit trail + snapshot writer)
  const db = supabaseAdmin();
  const enrichedPayload = {
    ...payload,
    computed_readiness_level: readinessResult.readiness,
    computed_readiness_score: score,
  };

  // Mutate the in-memory event so writeSnapshot() sees the computed values
  (event as any).payload = enrichedPayload;

  await db
    .from('athlete_events')
    .update({ payload: enrichedPayload })
    .eq('event_id', event.event_id);

  // 4. Recompute wellness trend
  await recomputeWellnessTrend(event.athlete_id);
}

/**
 * Compute a 0–100 readiness score from wellness inputs.
 * Weights: Energy 30%, Soreness 25%, Sleep 25%, Mood 10%, Effort 10%
 */
function computeReadinessScore(
  payload: WellnessCheckinPayload,
  level: string,
): number {
  const energyNorm = (payload.energy / 10) * 100;
  const sorenessNorm = ((10 - payload.soreness) / 10) * 100;
  const sleepNorm = Math.min(100, (payload.sleep_hours / 9) * 100);
  const moodNorm = (payload.mood / 10) * 100;
  const effortNorm = ((10 - (payload.effort_yesterday ?? 5)) / 10) * 100;

  let raw = (
    energyNorm * 0.30 +
    sorenessNorm * 0.25 +
    sleepNorm * 0.25 +
    moodNorm * 0.10 +
    effortNorm * 0.10
  );

  // Clamp to level band
  if (level === 'Red') raw = Math.min(raw, 33);
  else if (level === 'Yellow') raw = Math.max(1, Math.min(raw, 66));
  else raw = Math.max(34, raw);

  return Math.round(raw);
}
