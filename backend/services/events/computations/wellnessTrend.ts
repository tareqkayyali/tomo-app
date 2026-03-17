/**
 * Wellness Trend Computation — 7-day rolling average + trend detection.
 *
 * Computes a composite wellness score from recent WELLNESS_CHECKIN events
 * and determines IMPROVING / STABLE / DECLINING trend.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { WELLNESS_TREND_IMPROVING_DELTA, WELLNESS_TREND_DECLINING_DELTA } from '../constants';
import type { WellnessCheckinPayload } from '../types';

/**
 * Recompute the 7-day wellness average and trend for an athlete.
 * Compares current 7-day avg to prior 7-day avg to determine trend.
 */
export async function recomputeWellnessTrend(athleteId: string): Promise<void> {
  const db = supabaseAdmin();

  // Fetch last 14 days of wellness checkins (7 current + 7 prior for comparison)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();

  const { data: checkins } = await db
    .from('athlete_events')
    .select('occurred_at, payload')
    .eq('athlete_id', athleteId)
    .eq('event_type', 'WELLNESS_CHECKIN')
    .gte('occurred_at', fourteenDaysAgo)
    .order('occurred_at', { ascending: false })
    .limit(14);

  if (!checkins || checkins.length === 0) return;

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Current week (last 7 days)
  const currentWeek = checkins.filter((c: any) => c.occurred_at >= sevenDaysAgo);
  // Prior week (7-14 days ago)
  const priorWeek = checkins.filter((c: any) => c.occurred_at < sevenDaysAgo);

  const currentAvg = computeWellnessAvg(currentWeek.map((c: any) => c.payload as WellnessCheckinPayload));
  const priorAvg = priorWeek.length > 0
    ? computeWellnessAvg(priorWeek.map((c: any) => c.payload as WellnessCheckinPayload))
    : currentAvg;

  // Determine trend
  const delta = currentAvg - priorAvg;
  let trend: 'IMPROVING' | 'STABLE' | 'DECLINING' = 'STABLE';
  if (delta >= WELLNESS_TREND_IMPROVING_DELTA) trend = 'IMPROVING';
  else if (delta <= WELLNESS_TREND_DECLINING_DELTA) trend = 'DECLINING';

  await db
    .from('athlete_snapshots')
    .upsert({
      athlete_id: athleteId,
      wellness_7day_avg: Math.round(currentAvg * 10) / 10,
      wellness_trend: trend,
      snapshot_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' });
}

/**
 * Compute a composite wellness score (0–10) from checkin payloads.
 * Weights: Energy 25%, (10-Soreness) 25%, Sleep 25%, Mood 25%
 */
function computeWellnessAvg(payloads: WellnessCheckinPayload[]): number {
  if (payloads.length === 0) return 5; // default neutral

  let total = 0;
  for (const p of payloads) {
    const energyNorm = p.energy;                        // 1–10
    const sorenessNorm = 10 - p.soreness;               // invert: high soreness = low wellness
    const sleepNorm = Math.min(10, (p.sleep_hours / 9) * 10);
    const moodNorm = p.mood;                            // 1–10

    total += (energyNorm + sorenessNorm + sleepNorm + moodNorm) / 4;
  }

  return total / payloads.length;
}
