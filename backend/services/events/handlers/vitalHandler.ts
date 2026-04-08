/**
 * Vital Handler — processes VITAL_READING, WEARABLE_SYNC, and SLEEP_RECORD events.
 *
 * Updates:
 * 1. athlete_snapshots — latest single values for guardrails
 * 2. health_data — per-metric rows for weekly vitals aggregator (My Vitals page)
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { upsertDailyVitals } from '../aggregations/dailyVitalsWriter';
import type { AthleteEvent, VitalReadingPayload, SleepRecordPayload } from '../types';

/**
 * Write a vital metric to health_data for the weekly aggregator.
 * Uses upsert on (user_id, date, metric_type) to avoid duplicates.
 */
async function writeHealthData(
  db: any,
  userId: string,
  date: string,
  metricType: string,
  value: number,
  unit: string,
  source: string = 'wearable'
): Promise<void> {
  await db.from('health_data').upsert(
    { user_id: userId, date, metric_type: metricType, value, unit, source },
    { onConflict: 'user_id,date,metric_type', ignoreDuplicates: false }
  );
}

/**
 * Handle VITAL_READING and WEARABLE_SYNC events.
 * Updates HRV baseline, snapshot, and writes to health_data.
 */
export async function handleVitalReading(event: AthleteEvent): Promise<void> {
  const payload = event.payload as VitalReadingPayload;
  const db = supabaseAdmin() as any;
  const eventDate = event.occurred_at
    ? new Date(event.occurred_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  // Write individual metrics to health_data for the weekly aggregator
  const writes: Promise<void>[] = [];
  if (payload.hrv_ms) {
    writes.push(writeHealthData(db, event.athlete_id, eventDate, 'hrv', payload.hrv_ms, 'ms', 'wearable'));
  }
  if (payload.resting_hr_bpm) {
    writes.push(writeHealthData(db, event.athlete_id, eventDate, 'resting_hr', payload.resting_hr_bpm, 'bpm', 'wearable'));
  }
  if (payload.spo2_percent) {
    writes.push(writeHealthData(db, event.athlete_id, eventDate, 'blood_oxygen', payload.spo2_percent, '%', 'wearable'));
  }
  if ((payload as any).recovery_score) {
    writes.push(writeHealthData(db, event.athlete_id, eventDate, 'recovery_score', (payload as any).recovery_score, '%', 'wearable'));
  }
  if (payload.skin_temp_celsius) {
    writes.push(writeHealthData(db, event.athlete_id, eventDate, 'body_temp', payload.skin_temp_celsius, '°C', 'wearable'));
  }
  await Promise.allSettled(writes);

  // Write to unified daily vitals (wearable = highest priority source)
  const wearableSource = payload.wearable_device?.toLowerCase() ?? 'wearable';
  upsertDailyVitals(event.athlete_id, eventDate, {
    source:           wearableSource,
    hrv_morning_ms:   payload.hrv_ms,
    resting_hr_bpm:   payload.resting_hr_bpm,
    spo2_percent:     payload.spo2_percent,
    recovery_score:   (payload as any).recovery_score,
  }).catch(err => console.error('[VitalHandler] dailyVitals write failed:', err));

  // Update snapshot with latest HRV/HR values whenever available
  // Also compute baseline from 28-day window for morning readings
  if (payload.hrv_ms) {
    // Always write today's values to snapshot
    const snapshotUpdate: Record<string, unknown> = {
      athlete_id: event.athlete_id,
      hrv_today_ms: payload.hrv_ms,
      snapshot_at: new Date().toISOString(),
    };
    if (payload.resting_hr_bpm) {
      snapshotUpdate.resting_hr_bpm = payload.resting_hr_bpm;
    }

    await db
      .from('athlete_snapshots')
      .upsert(snapshotUpdate, { onConflict: 'athlete_id' });
  } else if (payload.resting_hr_bpm) {
    // No HRV but has resting HR — still update snapshot
    await db
      .from('athlete_snapshots')
      .upsert({
        athlete_id: event.athlete_id,
        resting_hr_bpm: payload.resting_hr_bpm,
        snapshot_at: new Date().toISOString(),
      }, { onConflict: 'athlete_id' });
  }

  // Compute HRV baseline from 28-day window (for morning readings or any HRV data)
  if (payload.hrv_ms) {
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

        // Only update baseline (today's values already written above)
        await db
          .from('athlete_snapshots')
          .upsert({
            athlete_id: event.athlete_id,
            hrv_baseline_ms: Math.round(baseline * 10) / 10,
            snapshot_at: new Date().toISOString(),
          }, { onConflict: 'athlete_id' });
      }
    }
  }
}

/**
 * Handle SLEEP_RECORD events.
 * Updates sleep quality on snapshot and writes to health_data.
 */
export async function handleSleepRecord(event: AthleteEvent): Promise<void> {
  const payload = event.payload as SleepRecordPayload;
  const db = supabaseAdmin() as any;
  const eventDate = event.occurred_at
    ? new Date(event.occurred_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  // Write sleep metrics to health_data for the weekly aggregator
  const writes: Promise<void>[] = [];
  if (payload.sleep_duration_hours) {
    writes.push(writeHealthData(db, event.athlete_id, eventDate, 'sleep_hours', payload.sleep_duration_hours, 'hrs', 'wearable'));
  }
  await Promise.allSettled(writes);

  // Write to unified daily vitals (wearable sleep = highest priority)
  upsertDailyVitals(event.athlete_id, eventDate, {
    source:        'wearable',
    sleep_hours:   payload.sleep_duration_hours,
    sleep_quality: payload.sleep_quality_score ?? undefined,
    deep_sleep_min: payload.deep_sleep_min,
    rem_sleep_min:  payload.rem_sleep_min,
  }).catch(err => console.error('[VitalHandler] dailyVitals sleep write failed:', err));

  // Update snapshot
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
