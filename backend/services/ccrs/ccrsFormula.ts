/**
 * CCRS — Cascading Confidence Readiness Score
 *
 * Pure formula engine. ZERO imports, ZERO I/O, ZERO side effects.
 * Every function is deterministic: same inputs → same outputs.
 *
 * The cascade eliminates single points of failure:
 * - Bio stale? → Weight shifts to check-in
 * - No check-in? → Weight shifts to historical prior
 * - No baseline? → Confidence = estimated, historical leads
 * - ACWR > 2.0? → Hard cap at 40/100, recommendation = blocked
 *
 * Weight sum is always 1.0 regardless of data availability.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PHVStage = 'pre_phv' | 'mid_phv' | 'post_phv' | 'adult' | 'unknown';
export type Confidence = 'very_high' | 'high' | 'medium' | 'low' | 'estimated';
export type Recommendation = 'full_load' | 'moderate' | 'reduced' | 'recovery' | 'blocked';
export type AlertFlag =
  | 'HRV_SUPPRESSED'
  | 'SLEEP_DEFICIT'
  | 'ACWR_SPIKE'
  | 'ACWR_BLOCKED'
  | 'PHV_CAP_ACTIVE'
  | 'NO_BIOMETRIC'
  | 'NO_CHECKIN'
  | 'LOW_MOTIVATION'
  | 'COLD_START'
  | 'BASELINE_FORMING';

export interface BiometricInputs {
  hrv_rmssd: number;
  rhr_bpm: number;
  sleep_hours: number;
  data_age_hours: number;
}

export interface AthleteBaseline {
  hrv_mean_30d: number;
  hrv_sd_30d: number;
  rhr_mean_30d: number;
  baseline_valid: boolean;
}

export interface HooperInputs {
  sleep_quality: number;
  energy_level: number;
  muscle_soreness: number;
  stress_level: number;
  motivation: number;
  athlete_age: number;
}

export interface ACWRInputs {
  acute_load_7d: number;
  chronic_load_28d: number;
}

export interface CCRSInputs {
  biometric: BiometricInputs | null;
  baseline: AthleteBaseline | null;
  hooper: HooperInputs | null;
  acwr: ACWRInputs | null;
  phv_stage: PHVStage;
  coach_phase_score: number | null;
  historical_score: number;
}

export interface CCRSResult {
  ccrs: number;
  confidence: Confidence;
  recommendation: Recommendation;
  weights: {
    biometric: number;
    hooper: number;
    historical: number;
    coach: number;
  };
  components: {
    biometric_score: number | null;
    hooper_score: number | null;
    historical_score: number;
    acwr_value: number | null;
    acwr_multiplier: number;
    phv_multiplier: number;
    freshness_mult: number;
  };
  alert_flags: AlertFlag[];
}

// ---------------------------------------------------------------------------
// Sub-functions (all pure)
// ---------------------------------------------------------------------------

/** Freshness decay: confidence in biometric data by age (hours since recorded) */
export function getFreshnessMult(data_age_hours: number): number {
  if (data_age_hours < 8) return 1.00;
  if (data_age_hours < 16) return 0.75;
  if (data_age_hours < 24) return 0.45;
  if (data_age_hours < 48) return 0.15;
  return 0;
}

/** HRV Z-score → 0–100 score (personal baseline normalization) */
export function getHRVScore(rmssd: number, mean: number, sd: number): number {
  if (sd <= 0) return 60; // degenerate baseline guard
  const z = (rmssd - mean) / sd;
  if (z > 2.0) return 100;
  if (z > 1.0) return 85 + (z - 1.0) * 15;
  if (z > 0.0) return 70 + z * 15;
  if (z > -1.0) return 50 + (z + 1.0) * 20;
  if (z > -2.0) return 20 + (z + 2.0) * 30;
  return Math.max(0, 20 + (z + 2.0) * 15);
}

/** RHR deviation from baseline → 0–100 score */
export function getRHRScore(rhr: number, baseline_rhr: number): number {
  const dev = rhr - baseline_rhr;
  if (dev <= 2) return Math.max(0, 90 - dev * 5);
  if (dev <= 5) return 80 - (dev - 2) * 7;
  if (dev <= 10) return 59 - (dev - 5) * 6;
  return Math.max(0, 29 - (dev - 10) * 5);
}

/** Sleep hours → 0–100 score (youth: 8h target, adult: 7.5h target) */
export function getSleepScore(hours: number, athlete_age: number): number {
  const target = athlete_age < 18 ? 8.0 : 7.5;
  const diff = Math.abs(hours - target);
  if (hours < 5) return 10;
  if (diff <= 0.5) return 95;
  if (diff <= 1.0) return 85;
  if (diff <= 1.5) return 72;
  if (diff <= 2.5) return 55;
  if (hours < 5.5) return 25;
  return Math.max(0, 55 - (diff - 2.5) * 10);
}

/** Composite biometric score: HRV 45%, RHR 30%, Sleep 25% */
export function getBiometricScore(
  bio: BiometricInputs,
  baseline: AthleteBaseline,
  athlete_age: number,
): number {
  const hrv = getHRVScore(bio.hrv_rmssd, baseline.hrv_mean_30d, baseline.hrv_sd_30d);
  const rhr = getRHRScore(bio.rhr_bpm, baseline.rhr_mean_30d);
  const sleep = getSleepScore(bio.sleep_hours, athlete_age);
  return hrv * 0.45 + rhr * 0.30 + sleep * 0.25;
}

/** Hooper 5-question wellness → 0–100 score (youth motivation weighted 1.2x) */
export function getHooperScore(h: HooperInputs): number {
  const motWeight = h.athlete_age < 18 ? 1.2 : 1.0;
  const raw =
    h.sleep_quality +
    h.energy_level +
    h.muscle_soreness +
    h.stress_level +
    h.motivation * motWeight;
  const max = 4 * 5 + 5 * motWeight;
  return Math.min(100, (raw / max) * 100);
}

/**
 * ACWR → multiplier + zone classification.
 *
 * Mode is env-driven (CCRS_ACWR_MODE):
 *   - 'hard_cap_only' (DEFAULT, April 2026): only ratio > 2.0 produces a
 *     non-unity multiplier. Anything ≤ 2.0 collapses to sweet_spot with
 *     multiplier 1.0 and hard_cap false. Academic load (×0.4 weight) was
 *     inflating ACWR into the 1.3–1.8 band without heavy training and
 *     biasing CCRS recommendations toward recovery.
 *   - 'full': legacy behaviour with caution/high_risk multipliers active.
 *
 * The 'blocked' branch (ratio > 2.0) remains active in both modes — this
 * is the catastrophic-overload safety net the user asked to preserve.
 */
export function getACWRMultiplier(acwr_inputs: ACWRInputs): {
  multiplier: number;
  acwr_value: number;
  zone: 'undertraining' | 'sweet_spot' | 'caution' | 'high_risk' | 'blocked';
  hard_cap: boolean;
} {
  const { acute_load_7d, chronic_load_28d } = acwr_inputs;
  const chronic_weekly = chronic_load_28d / 4;
  const ratio = chronic_weekly > 0 ? acute_load_7d / chronic_weekly : 1.0;

  if (ratio > 2.0) return { multiplier: 0.40, acwr_value: ratio, zone: 'blocked', hard_cap: true };

  const mode = process.env.CCRS_ACWR_MODE === 'full' ? 'full' : 'hard_cap_only';
  if (mode === 'hard_cap_only') {
    return { multiplier: 1.00, acwr_value: ratio, zone: 'sweet_spot', hard_cap: false };
  }

  if (ratio > 1.5) return { multiplier: 0.65, acwr_value: ratio, zone: 'high_risk', hard_cap: false };
  if (ratio > 1.3) return { multiplier: 0.85, acwr_value: ratio, zone: 'caution', hard_cap: false };
  if (ratio >= 0.8) return { multiplier: 1.00, acwr_value: ratio, zone: 'sweet_spot', hard_cap: false };
  return { multiplier: 0.90, acwr_value: ratio, zone: 'undertraining', hard_cap: false };
}

/** PHV stage → safety multiplier (deterministic, cannot be bypassed) */
export function getPHVMultiplier(stage: PHVStage): number {
  switch (stage) {
    case 'pre_phv': return 1.00;
    case 'mid_phv': return 0.85;
    case 'post_phv': return 0.95;
    case 'adult': return 1.00;
    case 'unknown': return 0.90;
  }
}

/**
 * Dynamic weight resolver — the core cascade logic.
 *
 * Eliminates single points of failure: when one data source is missing
 * or stale, the weight automatically redistributes to available sources.
 * Weights always sum to exactly 1.0.
 */
export function getCascadeWeights(params: {
  bio_available: boolean;
  freshness_mult: number;
  checkin_available: boolean;
  coach_available: boolean;
}): { biometric: number; hooper: number; historical: number; coach: number } {
  const { bio_available, freshness_mult: fm, checkin_available, coach_available } = params;

  let wb = 0;
  let wh = 0;
  let wc = 0;

  // Tier 1: biometric confidence (proportional to freshness)
  if (bio_available && fm >= 0.75) {
    wb = 0.55;
  } else if (bio_available && fm > 0) {
    wb = 0.55 * fm;
  } else {
    wb = 0;
  }

  // Tier 2: check-in (leads when bio is absent)
  wh = checkin_available ? (wb > 0 ? 0.30 : 0.65) : 0;

  // Tier 4: coach context
  wc = coach_available ? 0.08 : 0;

  // Tier 3: historical fills remainder
  const wHist = Math.max(0, 1 - wb - wh - wc);

  // Normalize to exactly 1.0
  const total = wb + wh + wHist + wc;
  if (total <= 0) return { biometric: 0, hooper: 0, historical: 1, coach: 0 };

  return {
    biometric: wb / total,
    hooper: wh / total,
    historical: wHist / total,
    coach: wc / total,
  };
}

// ---------------------------------------------------------------------------
// Master formula
// ---------------------------------------------------------------------------

export function calculateCCRS(inputs: CCRSInputs): CCRSResult {
  const {
    biometric,
    baseline,
    hooper,
    acwr,
    phv_stage,
    coach_phase_score,
    historical_score,
  } = inputs;

  const flags: AlertFlag[] = [];

  // Freshness
  const fm = biometric ? getFreshnessMult(biometric.data_age_hours) : 0;
  if (!biometric || fm === 0) flags.push('NO_BIOMETRIC');

  // Cold start check
  const baselineReady = baseline?.baseline_valid ?? false;
  if (baseline && !baselineReady) flags.push('COLD_START');

  // Biometric score
  let bs: number | null = null;
  if (biometric && baseline && baselineReady && fm > 0) {
    bs = getBiometricScore(biometric, baseline, hooper?.athlete_age ?? 18);
    if (bs < 50 && fm > 0.5) flags.push('HRV_SUPPRESSED');
    if (biometric.sleep_hours < 6) flags.push('SLEEP_DEFICIT');
  }

  // Check-in score
  let hs: number | null = null;
  if (hooper) {
    hs = getHooperScore(hooper);
    if (hooper.motivation <= 2) flags.push('LOW_MOTIVATION');
  } else {
    flags.push('NO_CHECKIN');
  }

  // ACWR
  let acwrMult = 1.0;
  let acwrValue: number | null = null;
  if (acwr) {
    const acwrResult = getACWRMultiplier(acwr);
    acwrMult = acwrResult.multiplier;
    acwrValue = acwrResult.acwr_value;
    if (acwrResult.zone === 'caution') flags.push('ACWR_SPIKE');
    if (acwrResult.zone === 'high_risk') flags.push('ACWR_SPIKE');
    if (acwrResult.zone === 'blocked') flags.push('ACWR_BLOCKED');
  }

  // PHV
  const phvMult = getPHVMultiplier(phv_stage);
  if (phv_stage === 'mid_phv') flags.push('PHV_CAP_ACTIVE');

  // Cascade weights
  const weights = getCascadeWeights({
    bio_available: bs !== null,
    freshness_mult: fm,
    checkin_available: hs !== null,
    coach_available: coach_phase_score !== null,
  });

  // Weighted raw score
  const coachScore = coach_phase_score ?? 65;
  const raw =
    weights.biometric * (bs ?? 0) * (bs !== null ? 1 : 0) +
    weights.hooper * (hs ?? 0) +
    weights.historical * historical_score +
    weights.coach * coachScore;

  // Apply multipliers
  let ccrs = raw * acwrMult * phvMult;

  // Hard caps
  if (acwrValue !== null && acwrValue > 2.0) ccrs = Math.min(ccrs, 40);
  ccrs = Math.min(100, Math.max(0, ccrs));

  // Confidence (how much reliable signal we have)
  const confScore =
    weights.biometric * fm +
    weights.hooper * (hs !== null ? 1 : 0) +
    weights.historical * 0.6 +
    weights.coach * 0.7;

  const confidence: Confidence = !baselineReady
    ? 'estimated'
    : confScore > 0.75
      ? 'very_high'
      : confScore > 0.55
        ? 'high'
        : confScore > 0.35
          ? 'medium'
          : 'low';

  // Recommendation
  const recommendation: Recommendation = flags.includes('ACWR_BLOCKED')
    ? 'blocked'
    : ccrs >= 80
      ? 'full_load'
      : ccrs >= 65
        ? 'moderate'
        : ccrs >= 45
          ? 'reduced'
          : 'recovery';

  return {
    ccrs: Math.round(ccrs * 10) / 10,
    confidence,
    recommendation,
    weights,
    components: {
      biometric_score: bs !== null ? Math.round(bs * 10) / 10 : null,
      hooper_score: hs !== null ? Math.round(hs * 10) / 10 : null,
      historical_score: Math.round(historical_score * 10) / 10,
      acwr_value: acwrValue,
      acwr_multiplier: acwrMult,
      phv_multiplier: phvMult,
      freshness_mult: Math.round(fm * 100) / 100,
    },
    alert_flags: flags,
  };
}

// ---------------------------------------------------------------------------
// Hooper normalization — maps Tomo's existing 1-10 check-in to Hooper 1-5
// ---------------------------------------------------------------------------

export interface TomoCheckinInputs {
  energy: number;       // 1-10
  soreness: number;     // 1-10 (high = sore)
  mood: number;         // 1-10
  sleepHours: number;   // decimal hours
  academicStress: number | null; // 1-10 (high = stressed)
  athlete_age: number;
}

/**
 * Normalize existing Tomo 1-10 check-in fields into Hooper 1-5 format.
 * Handles the inversion (soreness/stress are negative in Hooper but positive in Tomo).
 */
export function tomoCheckinToHooper(checkin: TomoCheckinInputs): HooperInputs {
  return {
    // Sleep quality: derived from sleep hours (Tomo doesn't capture sleep quality in check-in)
    sleep_quality: sleepHoursToQuality(checkin.sleepHours),
    // Energy: scale 1-10 → 1-5
    energy_level: Math.max(1, Math.min(5, Math.ceil(checkin.energy * 0.5))),
    // Muscle soreness: INVERT (Tomo: 10=very sore, Hooper: 5=no soreness)
    muscle_soreness: Math.max(1, Math.min(5, Math.ceil((11 - checkin.soreness) * 0.5))),
    // Stress: INVERT (Tomo: 10=maxed out, Hooper: 5=relaxed)
    stress_level: Math.max(
      1,
      Math.min(5, Math.ceil((11 - (checkin.academicStress ?? 5)) * 0.5)),
    ),
    // Motivation: not captured in current check-in, default to energy-derived estimate
    motivation: Math.max(1, Math.min(5, Math.ceil(checkin.mood * 0.5))),
    athlete_age: checkin.athlete_age,
  };
}

/** Map sleep hours to a 1-5 quality scale */
function sleepHoursToQuality(hours: number): number {
  if (hours >= 9) return 5;
  if (hours >= 8) return 4;
  if (hours >= 7) return 3;
  if (hours >= 5.5) return 2;
  return 1;
}
