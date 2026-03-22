/**
 * Vital Handler — processes VITAL_READING, WEARABLE_SYNC, and SLEEP_RECORD events.
 *
 * Updates HRV baseline (28-day rolling average), resting HR, and sleep quality
 * on the athlete snapshot.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AthleteEvent, VitalReadingPayload, SleepRecordPayload } from '../types';

/**
 * Handle VITAL_READING and WEARABLE_SYNC events.
 * Updates HRV baseline and current readings on the snapshot.
 */
export async function handleVitalReading(event: AthleteEvent): Promise<void> {
  const payload = event.payload as VitalReadingPayload;
  const db = supabaseAdmin();

  // If this is a morning HRV reading, update baseline
  if (payload.hrv_ms && payload.measurement_window === 'MORNING') {
    // Fetch last 28 morning HRV readings for baseline calculation
    const { data: recentHRV } = await db
      .from('athlete_events')
      .select('payload')
      .eq('athlete_id', event.athlete_id)
      .eq('event_type', 'VITAL_READING')
      .gte('occurred_at', new Date(Date.now() - 28 * 86400000).toISOString())
      .order('occurred_at', { ascending: false })
      .limit(28);

    if (recentHRV && recentHRV.length > 0) {
      const hrvValues = recentHRV
        .map((r: any) => (r.payload as VitalReadingPayload)?.hrv_ms)
        .filter((v: any): v is number => typeof v === 'number' && v > 0);

      if (hrvValues.length > 0) {
        const baseline = hrvValues.reduce((sum: number, v: number) => sum + v, 0) / hrvValues.length;

        // Write directly to snapshot (snapshotWriter will also run, but this ensures freshness)
        await db
          .from('athlete_snapshots')
          .upsert({
            athlete_id: event.athlete_id,
            hrv_baseline_ms: Math.round(baseline * 10) / 10,
            hrv_today_ms: payload.hrv_ms,
            hrv_recorded_at: new Date().toISOString(),
            resting_hr_bpm: payload.resting_hr_bpm ?? null,
            snapshot_at: new Date().toISOString(),
          }, { onConflict: 'athlete_id' });
      }
    }
  }
}

/**
 * Handle SLEEP_RECORD events.
 * Updates sleep quality on the snapshot.
 */
export async function handleSleepRecord(event: AthleteEvent): Promise<void> {
  const payload = event.payload as SleepRecordPayload;
  const db = supabaseAdmin();

  if (payload.sleep_quality_score != null) {
    await db
      .from('athlete_snapshots')
      .upsert({
        athlete_id: event.athlete_id,
        sleep_quality: payload.sleep_quality_score,
        sleep_recorded_at: new Date().toISOString(),
        snapshot_at: new Date().toISOString(),
      }, { onConflict: 'athlete_id' });
  }
}
