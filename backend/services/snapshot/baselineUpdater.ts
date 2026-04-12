/**
 * Baseline Updater — Nightly batch that recomputes HRV/RHR baselines.
 *
 * Runs daily at 02:00 UTC via the cron route. For each active athlete:
 * 1. Query last 30 days of VITAL_READING events
 * 2. Compute HRV mean + stddev (for CCRS Z-score normalization)
 * 3. Compute RHR mean (for CCRS RHR scoring)
 * 4. Upsert hrv_baseline_ms, hrv_sd_30d, hrv_sample_n on snapshot
 *
 * The vitalHandler already does this on each vital event, but this nightly
 * batch catches athletes who haven't synced in a while — their baseline
 * window still slides forward even without new data points.
 *
 * Pattern: follows enrichSnapshotPeriodic.ts (batches of 10, Promise.allSettled).
 */

import { supabaseAdmin } from '@/lib/supabase/admin';

/** Only recompute baselines for athletes active in the last 7 days */
const ACTIVE_WINDOW_DAYS = 7;

/** Process in batches */
const BATCH_SIZE = 10;

/** Minimum data points for baseline_valid = true */
const MIN_SAMPLES_FOR_VALID = 14;

export interface BaselineResult {
  updated: number;
  skipped: number;
  errors: number;
}

/**
 * Run nightly baseline recomputation for all recently active athletes.
 * Called by the cron route at 02:00 UTC daily.
 */
export async function updateBaselines(): Promise<BaselineResult> {
  const db = supabaseAdmin();
  const now = new Date();
  const activeWindow = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const result: BaselineResult = { updated: 0, skipped: 0, errors: 0 };

  // Get athletes with recent snapshot activity
  const { data: activeAthletes, error } = await db
    .from('athlete_snapshots')
    .select('athlete_id')
    .gte('snapshot_at', activeWindow.toISOString());

  if (error || !activeAthletes) {
    console.error('[BaselineUpdater] Failed to fetch active athletes:', error?.message);
    return { ...result, errors: 1 };
  }

  if (activeAthletes.length === 0) {
    console.log('[BaselineUpdater] No active athletes found');
    return result;
  }

  console.log(`[BaselineUpdater] Processing ${activeAthletes.length} active athletes`);

  for (let i = 0; i < activeAthletes.length; i += BATCH_SIZE) {
    const batch = activeAthletes.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(a => updateSingleBaseline(db, a.athlete_id, now))
    );

    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        if (r.value) result.updated++;
        else result.skipped++;
      } else {
        result.errors++;
      }
    }
  }

  console.log(
    `[BaselineUpdater] Done: ${result.updated} updated, ${result.skipped} skipped (no data), ${result.errors} errors`
  );

  return result;
}

/**
 * Recompute HRV + RHR baseline for a single athlete from 30-day vital event history.
 * Returns true if baseline was updated, false if skipped (no data).
 */
async function updateSingleBaseline(
  db: any,
  athleteId: string,
  now: Date
): Promise<boolean> {
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Query HRV + RHR from daily vitals (source-priority-resolved, one row per day)
  const { data: recentVitals } = await db
    .from('athlete_daily_vitals')
    .select('hrv_morning_ms, resting_hr_bpm, date')
    .eq('athlete_id', athleteId)
    .gte('date', thirtyDaysAgo.slice(0, 10))
    .order('date', { ascending: false });

  if (!recentVitals || recentVitals.length === 0) {
    return false;
  }

  // Extract valid HRV values
  const hrvValues = recentVitals
    .map((v: any) => v.hrv_morning_ms as number | null)
    .filter((v: number | null): v is number => typeof v === 'number' && v > 0);

  // Extract valid RHR values
  const rhrValues = recentVitals
    .map((v: any) => v.resting_hr_bpm as number | null)
    .filter((v: number | null): v is number => typeof v === 'number' && v > 0);

  const update: Record<string, unknown> = {
    athlete_id: athleteId,
    snapshot_at: now.toISOString(),
  };

  // HRV baseline: mean + stddev + sample count
  if (hrvValues.length > 0) {
    const mean = hrvValues.reduce((sum: number, v: number) => sum + v, 0) / hrvValues.length;
    const variance = hrvValues.reduce((sum: number, v: number) => sum + Math.pow(v - mean, 2), 0) / hrvValues.length;
    const sd = Math.sqrt(variance);

    update.hrv_baseline_ms = Math.round(mean * 10) / 10;
    update.hrv_sd_30d = Math.round(sd * 100) / 100;
    update.hrv_sample_n = hrvValues.length;
  }

  // RHR baseline (stored for CCRS biometric scoring)
  if (rhrValues.length > 0) {
    const rhrMean = rhrValues.reduce((sum: number, v: number) => sum + v, 0) / rhrValues.length;
    update.resting_hr_baseline_bpm = Math.round(rhrMean * 10) / 10;
  }

  if (Object.keys(update).length <= 2) {
    return false;
  }

  await db
    .from('athlete_snapshots')
    .upsert(update, { onConflict: 'athlete_id' });

  return true;
}
