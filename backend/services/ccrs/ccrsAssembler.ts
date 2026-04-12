/**
 * CCRS Assembler — I/O bridge between the pure formula and the database.
 *
 * Reads snapshot + events → assembles CCRSInputs → calls calculateCCRS() →
 * writes result to snapshot + ccrs_scores log.
 *
 * This is the ONLY file in the CCRS module that touches the database.
 * The formula itself (ccrsFormula.ts) remains pure.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getPlayerPHVStage } from '@/services/programs/phvCalculator';
import {
  calculateCCRS,
  tomoCheckinToHooper,
  type CCRSInputs,
  type CCRSResult,
  type BiometricInputs,
  type AthleteBaseline,
  type HooperInputs,
  type ACWRInputs,
} from './ccrsFormula';

/**
 * Assemble all inputs, compute CCRS, and persist the result.
 *
 * Called from:
 *   - wellnessHandler (after check-in)
 *   - vitalHandler (after biometric sync)
 *   - snapshotStalenessDecay (nightly batch for stale athletes)
 */
export async function computeAndPersistCCRS(athleteId: string): Promise<CCRSResult | null> {
  const db = supabaseAdmin();

  // ── Parallel data assembly (all I/O happens here) ──
  // Cast to any for columns not yet in generated types (ccrs_scores table, snapshot CCRS columns)
  const dbAny = db as any;
  const [snapshotRes, checkinRes, loadRes, recentScoresRes, phv] = await Promise.all([
    dbAny
      .from('athlete_snapshots')
      .select(
        'hrv_today_ms, hrv_baseline_ms, hrv_sd_30d, hrv_sample_n, ' +
        'resting_hr_bpm, sleep_hours, hrv_recorded_at, sleep_recorded_at, ' +
        'last_checkin_at, acwr, atl_7day, ctl_28day, dob',
      )
      .eq('athlete_id', athleteId)
      .maybeSingle(),

    // Today's check-in (from checkins table)
    db
      .from('checkins')
      .select('energy, soreness, mood, sleep_hours, academic_stress, effort_yesterday')
      .eq('user_id', athleteId)
      .eq('date', new Date().toISOString().slice(0, 10))
      .maybeSingle(),

    // (ACWR now read from snapshot — no separate daily_load query needed)
    Promise.resolve({ data: null }),

    // Historical CCRS scores (14-day rolling average as prior)
    dbAny
      .from('ccrs_scores')
      .select('ccrs')
      .eq('athlete_id', athleteId)
      .gte('session_date', new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)),

    // PHV stage
    getPlayerPHVStage(athleteId),
  ]);

  const snapshot = snapshotRes.data as Record<string, any> | null;
  if (!snapshot) {
    console.log(`[CCRS] No snapshot for ${athleteId} — skipping`);
    return null;
  }

  const now = new Date();

  // ── Biometric inputs ──
  let biometric: BiometricInputs | null = null;
  if (snapshot.hrv_today_ms != null) {
    // Compute data age from whichever is more recent: HRV or sleep recorded_at
    const timestamps = [snapshot.hrv_recorded_at, snapshot.sleep_recorded_at]
      .filter(Boolean)
      .map((t: string) => new Date(t).getTime());
    const mostRecentBio = timestamps.length > 0 ? Math.max(...timestamps) : 0;
    const dataAgeHours = mostRecentBio > 0
      ? (now.getTime() - mostRecentBio) / (60 * 60 * 1000)
      : 999; // No timestamp = treat as very stale

    biometric = {
      hrv_rmssd: snapshot.hrv_today_ms,
      rhr_bpm: snapshot.resting_hr_bpm ?? 65, // fallback if missing
      sleep_hours: snapshot.sleep_hours ?? 7, // fallback if missing
      data_age_hours: dataAgeHours,
    };
  }

  // ── Baseline ──
  let baseline: AthleteBaseline | null = null;
  if (snapshot.hrv_baseline_ms != null) {
    baseline = {
      hrv_mean_30d: snapshot.hrv_baseline_ms,
      hrv_sd_30d: snapshot.hrv_sd_30d ?? 10, // fallback SD
      rhr_mean_30d: snapshot.resting_hr_bpm ?? 65,
      baseline_valid: (snapshot.hrv_sample_n ?? 0) >= 14,
    };
  }

  // ── Hooper inputs (from today's check-in, normalized from 1-10 to 1-5) ──
  let hooper: HooperInputs | null = null;
  const checkin = checkinRes.data;
  if (checkin) {
    const athleteAge = computeAge(snapshot.dob, now);
    hooper = tomoCheckinToHooper({
      energy: checkin.energy ?? 5,
      soreness: checkin.soreness ?? 5,
      mood: checkin.mood ?? 5,
      sleepHours: checkin.sleep_hours ?? 7,
      academicStress: checkin.academic_stress ?? null,
      athlete_age: athleteAge,
    });
  }

  // ── ACWR inputs (use snapshot's authoritative ACWR, not raw daily_load) ──
  // acwrComputation.ts includes academic load weighting (×0.4) and proper
  // daily-average normalization. Recomputing here would diverge.
  let acwr: ACWRInputs | null = null;
  if (snapshot.acwr != null && snapshot.atl_7day != null && snapshot.ctl_28day != null) {
    // Convert daily averages back to period sums for the CCRS formula
    acwr = {
      acute_load_7d: snapshot.atl_7day * 7,
      chronic_load_28d: snapshot.ctl_28day * 28,
    };
  }

  // ── Historical score (14-day rolling CCRS average, default 62) ──
  const recentScores = recentScoresRes.data;
  const historicalAvg =
    recentScores && recentScores.length > 0
      ? recentScores.reduce((s: number, r: any) => s + r.ccrs, 0) / recentScores.length
      : 62; // population prior for new athletes

  // ── PHV stage ──
  const phvStage = phv?.phvStage === 'mid_phv'
    ? 'mid_phv'
    : phv?.phvStage === 'post_phv'
      ? 'post_phv'
      : phv?.phvStage === 'pre_phv'
        ? 'pre_phv'
        : 'adult';

  // ── Assemble inputs and call pure formula ──
  const inputs: CCRSInputs = {
    biometric,
    baseline,
    hooper,
    acwr,
    phv_stage: phvStage,
    coach_phase_score: null, // Phase 9: wire coach inputs when available
    historical_score: historicalAvg,
  };

  const result = calculateCCRS(inputs);

  // ── Persist to snapshot ──
  const today = now.toISOString().slice(0, 10);
  await db
    .from('athlete_snapshots')
    .upsert(
      {
        athlete_id: athleteId,
        ccrs: result.ccrs,
        ccrs_confidence: result.confidence,
        ccrs_recommendation: result.recommendation,
        ccrs_alert_flags: result.alert_flags,
        snapshot_at: now.toISOString(),
      },
      { onConflict: 'athlete_id' },
    );

  // ── Persist to ccrs_scores log (append-only audit trail) ──
  await (db as any)
    .from('ccrs_scores')
    .upsert(
      {
        athlete_id: athleteId,
        session_date: today,
        computed_at: now.toISOString(),
        ccrs: result.ccrs,
        confidence: result.confidence,
        recommendation: result.recommendation,
        biometric_score: result.components.biometric_score,
        hooper_score: result.components.hooper_score,
        historical_score: result.components.historical_score,
        acwr_value: result.components.acwr_value,
        acwr_multiplier: result.components.acwr_multiplier,
        phv_multiplier: result.components.phv_multiplier,
        freshness_mult: result.components.freshness_mult,
        weight_biometric: result.weights.biometric,
        weight_hooper: result.weights.hooper,
        weight_historical: result.weights.historical,
        weight_coach: result.weights.coach,
        alert_flags: result.alert_flags,
        bio_data_age_hours: biometric?.data_age_hours ?? null,
      },
      { onConflict: 'athlete_id,session_date' },
    );

  console.log(
    `[CCRS] ${athleteId}: score=${result.ccrs} confidence=${result.confidence} ` +
    `rec=${result.recommendation} flags=[${result.alert_flags.join(',')}]`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeAge(dob: string | null, now: Date): number {
  if (!dob) return 16; // conservative youth default
  return Math.floor(
    (now.getTime() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  );
}
