/**
 * Wellness Handler — processes WELLNESS_CHECKIN events.
 *
 * Calls the existing readinessCalculator pure functions to compute
 * readiness level and score. Does NOT duplicate logic — imports directly.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { calculateReadiness } from '@/services/readinessCalculator';
import { recomputeWellnessTrend } from '../computations/wellnessTrend';
import { upsertDailyVitals } from '../aggregations/dailyVitalsWriter';
import { computeTrend, computeSleepDebt3d, computeSleepConsistency } from '@/services/snapshot/trendUtils';
import { computeAndPersistCCRS } from '@/services/ccrs/ccrsAssembler';
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

  // 5. Write to unified daily vitals (source-priority-resolved)
  const eventDate = event.occurred_at
    ? new Date(event.occurred_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  upsertDailyVitals(event.athlete_id, eventDate, {
    source:           'checkin',
    energy:           payload.energy,
    soreness:         payload.soreness,
    mood:             payload.mood,
    academic_stress:  payload.academic_stress ?? undefined,
    pain_flag:        payload.pain_flag,
    sleep_hours:      payload.sleep_hours,
    readiness_score:  score,
    readiness_rag:    readinessToRag(readinessResult.readiness),
  }).catch(err => console.error('[WellnessHandler] dailyVitals write failed:', err));

  // 6. Snapshot 360 enrichment
  await enrichWellnessSnapshot(db, event.athlete_id, payload, score);

  // 7. CCRS — recompute cascading readiness with fresh check-in data
  computeAndPersistCCRS(event.athlete_id).catch(err =>
    console.error('[WellnessHandler] CCRS computation failed:', err),
  );
}

/**
 * Enrich snapshot with Snapshot 360 wellness fields:
 * sleep_debt_3d, sleep_consistency_score, sleep_trend_7d, academic_stress_latest,
 * checkin_consistency_7d, readiness_delta
 */
async function enrichWellnessSnapshot(
  db: any,
  athleteId: string,
  payload: WellnessCheckinPayload,
  readinessScore: number
): Promise<void> {
  const enrichment: Record<string, unknown> = {
    athlete_id: athleteId,
    snapshot_at: new Date().toISOString(),
  };

  // Academic stress — latest value from this checkin
  if (payload.academic_stress != null) {
    enrichment.academic_stress_latest = payload.academic_stress;
  }

  // Readiness delta = subjective (checkin score) minus objective (HRV-derived)
  // Positive = athlete feels better than wearable data suggests
  const { data: snapshot } = await db
    .from('athlete_snapshots')
    .select('hrv_today_ms, hrv_baseline_ms')
    .eq('athlete_id', athleteId)
    .maybeSingle();

  if (snapshot?.hrv_today_ms != null && snapshot?.hrv_baseline_ms != null && snapshot.hrv_baseline_ms > 0) {
    const objectiveScore = Math.round((snapshot.hrv_today_ms / snapshot.hrv_baseline_ms) * 50);
    enrichment.readiness_delta = readinessScore - objectiveScore;
  }

  // Sleep-related trends from last 7 days of daily vitals
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const { data: recentVitals } = await db
    .from('athlete_daily_vitals')
    .select('sleep_hours, date')
    .eq('athlete_id', athleteId)
    .gte('date', sevenDaysAgo)
    .order('date', { ascending: true });

  if (recentVitals && recentVitals.length > 0) {
    const sleepHoursArr = recentVitals.map((v: any) => v.sleep_hours as number | null);

    const sleepTrend = computeTrend(sleepHoursArr);
    if (sleepTrend !== null) enrichment.sleep_trend_7d = sleepTrend;

    const debt = computeSleepDebt3d(sleepHoursArr);
    if (debt !== null) enrichment.sleep_debt_3d = debt;

    const consistency = computeSleepConsistency(sleepHoursArr);
    if (consistency !== null) enrichment.sleep_consistency_score = consistency;
  }

  // Checkin consistency = days_with_checkin / 7
  const { count: checkinCount } = await db
    .from('athlete_events')
    .select('event_id', { count: 'exact', head: true })
    .eq('athlete_id', athleteId)
    .eq('event_type', 'WELLNESS_CHECKIN')
    .gte('occurred_at', new Date(Date.now() - 7 * 86400000).toISOString());

  if (checkinCount != null) {
    enrichment.checkin_consistency_7d = Math.round((Math.min(checkinCount, 7) / 7) * 100) / 100;
  }

  if (Object.keys(enrichment).length > 2) {
    await db
      .from('athlete_snapshots')
      .upsert(enrichment, { onConflict: 'athlete_id' });
  }
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
