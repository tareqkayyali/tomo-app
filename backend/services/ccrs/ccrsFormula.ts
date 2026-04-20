/**
 * CCRS — Cascading Confidence Readiness Score
 *
 * Pure formula engine. Every parameter is either in the signature or in
 * the typed config object (see ccrsFormulaConfig.ts / acwrConfig.ts).
 * NO runtime I/O inside these functions — callers pass resolved config.
 *
 * The cascade eliminates single points of failure:
 * - Bio stale? → Weight shifts to check-in
 * - No check-in? → Weight shifts to historical prior
 * - No baseline? → Confidence = estimated, historical leads
 * - ACWR > hard_cap? → Score hard-capped, recommendation = blocked
 *
 * Weight sum is always 1.0 regardless of data availability.
 *
 * Every function accepts config optionally; when omitted, the hardcoded
 * DEFAULT is used so legacy callers + tests keep working byte-for-byte.
 */

import type { CCRSFormulaConfig } from './ccrsFormulaConfig';
import { CCRS_FORMULA_DEFAULT, freshnessMultFromConfig } from './ccrsFormulaConfig';
import type { ACWRConfig } from '@/services/events/acwrConfig';
import { ACWR_CONFIG_DEFAULT } from '@/services/events/acwrConfig';

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

/**
 * Freshness decay: confidence in biometric data by age (hours since recorded).
 *
 * Reads the `freshness_decay` ladder from config. With DEFAULT the ladder
 * is <8h=1.0, <16h=0.75, <24h=0.45, <48h=0.15, else 0 — identical to the
 * pre-config hardcoded version.
 */
export function getFreshnessMult(
  data_age_hours: number,
  config: CCRSFormulaConfig = CCRS_FORMULA_DEFAULT,
): number {
  return freshnessMultFromConfig(config, data_age_hours);
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

/**
 * Composite biometric score.
 *
 * Config controls the HRV/RHR/Sleep split (must sum to 1.0). Physiological
 * subscores (getHRVScore etc.) are intentionally NOT configurable — they
 * encode evidence-based curves, not business knobs.
 */
export function getBiometricScore(
  bio: BiometricInputs,
  baseline: AthleteBaseline,
  athlete_age: number,
  config: CCRSFormulaConfig = CCRS_FORMULA_DEFAULT,
): number {
  const { hrv_weight, rhr_weight, sleep_weight } = config.biometric_composite;
  const hrv = getHRVScore(bio.hrv_rmssd, baseline.hrv_mean_30d, baseline.hrv_sd_30d);
  const rhr = getRHRScore(bio.rhr_bpm, baseline.rhr_mean_30d);
  const sleep = getSleepScore(bio.sleep_hours, athlete_age);
  return hrv * hrv_weight + rhr * rhr_weight + sleep * sleep_weight;
}

/**
 * Hooper 5-question wellness → 0–100 score.
 * Youth (under `youth_age_threshold`) gets motivation weighted higher since
 * motivation is a stronger predictor of injury risk in developing athletes.
 */
export function getHooperScore(
  h: HooperInputs,
  config: CCRSFormulaConfig = CCRS_FORMULA_DEFAULT,
): number {
  const isYouth = h.athlete_age < config.hooper.youth_age_threshold;
  const motWeight = isYouth ? config.hooper.youth_motivation_multiplier : 1.0;
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
 * Mode comes from config.mode (CMS-controlled as of PR 2 of the
 * config-engine plan; previously driven by the CCRS_ACWR_MODE env var).
 *
 *   - 'hard_cap_only' (DEFAULT): only ratio > hard_cap_threshold produces
 *     a non-unity multiplier. Anything below collapses to sweet_spot with
 *     multiplier 1.0 and hard_cap false. Decouples day-to-day CCRS from
 *     the academic-inflated mid-range ACWR readings we saw in April 2026.
 *   - 'full': legacy behaviour with caution/high_risk zones active.
 *
 * The hard_cap branch (ratio > hard_cap_threshold, typically 2.0) remains
 * active in both modes — catastrophic-overload safety net.
 */
export function getACWRMultiplier(
  acwr_inputs: ACWRInputs,
  config: ACWRConfig = ACWR_CONFIG_DEFAULT,
): {
  multiplier: number;
  acwr_value: number;
  zone: 'undertraining' | 'sweet_spot' | 'caution' | 'high_risk' | 'blocked';
  hard_cap: boolean;
} {
  const { acute_load_7d, chronic_load_28d } = acwr_inputs;
  const chronic_weekly = chronic_load_28d / 4;
  const ratio = chronic_weekly > 0 ? acute_load_7d / chronic_weekly : 1.0;

  const t = config.thresholds;
  const m = config.multipliers;

  if (ratio > t.hard_cap) {
    return { multiplier: m.blocked, acwr_value: ratio, zone: 'blocked', hard_cap: true };
  }

  if (config.mode === 'hard_cap_only') {
    return { multiplier: m.sweet_spot, acwr_value: ratio, zone: 'sweet_spot', hard_cap: false };
  }

  if (ratio > t.danger_high) {
    return { multiplier: m.high_risk, acwr_value: ratio, zone: 'high_risk', hard_cap: false };
  }
  if (ratio > t.caution_high) {
    return { multiplier: m.caution, acwr_value: ratio, zone: 'caution', hard_cap: false };
  }
  if (ratio >= t.safe_low) {
    return { multiplier: m.sweet_spot, acwr_value: ratio, zone: 'sweet_spot', hard_cap: false };
  }
  return { multiplier: m.undertraining, acwr_value: ratio, zone: 'undertraining', hard_cap: false };
}

/** PHV stage → safety multiplier (deterministic, cannot be bypassed). */
export function getPHVMultiplier(
  stage: PHVStage,
  config: CCRSFormulaConfig = CCRS_FORMULA_DEFAULT,
): number {
  return config.phv_multipliers[stage];
}

/**
 * Dynamic weight resolver — the core cascade logic.
 *
 * Eliminates single points of failure: when one data source is missing
 * or stale, the weight automatically redistributes to available sources.
 * Weights always sum to exactly 1.0.
 */
export function getCascadeWeights(
  params: {
    bio_available: boolean;
    freshness_mult: number;
    checkin_available: boolean;
    coach_available: boolean;
  },
  config: CCRSFormulaConfig = CCRS_FORMULA_DEFAULT,
): { biometric: number; hooper: number; historical: number; coach: number } {
  const { bio_available, freshness_mult: fm, checkin_available, coach_available } = params;
  const cw = config.cascade_weights;

  let wb = 0;
  let wh = 0;
  let wc = 0;

  // Tier 1: biometric confidence (proportional to freshness)
  if (bio_available && fm >= cw.biometric_freshness_min) {
    wb = cw.biometric_full;
  } else if (bio_available && fm > 0) {
    wb = cw.biometric_full * fm;
  } else {
    wb = 0;
  }

  // Tier 2: check-in (leads when bio is absent)
  wh = checkin_available ? (wb > 0 ? cw.hooper_with_biometric : cw.hooper_without_biometric) : 0;

  // Tier 4: coach context
  wc = coach_available ? cw.coach_when_available : 0;

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

export function calculateCCRS(
  inputs: CCRSInputs,
  configs: {
    ccrs?: CCRSFormulaConfig;
    acwr?: ACWRConfig;
  } = {},
): CCRSResult {
  const cfg = configs.ccrs ?? CCRS_FORMULA_DEFAULT;
  const acwrCfg = configs.acwr ?? ACWR_CONFIG_DEFAULT;
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
  const fm = biometric ? getFreshnessMult(biometric.data_age_hours, cfg) : 0;
  if (!biometric || fm === 0) flags.push('NO_BIOMETRIC');

  // Cold start check
  const baselineReady = baseline?.baseline_valid ?? false;
  if (baseline && !baselineReady) flags.push('COLD_START');

  // Biometric score
  const alerts = cfg.alert_thresholds;
  let bs: number | null = null;
  if (biometric && baseline && baselineReady && fm > 0) {
    bs = getBiometricScore(biometric, baseline, hooper?.athlete_age ?? 18, cfg);
    if (bs < alerts.hrv_suppressed_score_max && fm > alerts.hrv_suppressed_freshness_min) {
      flags.push('HRV_SUPPRESSED');
    }
    if (biometric.sleep_hours < alerts.sleep_deficit_hours_max) flags.push('SLEEP_DEFICIT');
  }

  // Check-in score
  let hs: number | null = null;
  if (hooper) {
    hs = getHooperScore(hooper, cfg);
    if (hooper.motivation <= alerts.low_motivation_max) flags.push('LOW_MOTIVATION');
  } else {
    flags.push('NO_CHECKIN');
  }

  // ACWR
  let acwrMult = 1.0;
  let acwrValue: number | null = null;
  if (acwr) {
    const acwrResult = getACWRMultiplier(acwr, acwrCfg);
    acwrMult = acwrResult.multiplier;
    acwrValue = acwrResult.acwr_value;
    if (acwrResult.zone === 'caution') flags.push('ACWR_SPIKE');
    if (acwrResult.zone === 'high_risk') flags.push('ACWR_SPIKE');
    if (acwrResult.zone === 'blocked') flags.push('ACWR_BLOCKED');
  }

  // PHV
  const phvMult = getPHVMultiplier(phv_stage, cfg);
  if (phv_stage === 'mid_phv') flags.push('PHV_CAP_ACTIVE');

  // Cascade weights
  const weights = getCascadeWeights({
    bio_available: bs !== null,
    freshness_mult: fm,
    checkin_available: hs !== null,
    coach_available: coach_phase_score !== null,
  }, cfg);

  // Weighted raw score
  const coachScore = coach_phase_score ?? cfg.coach_phase_default;
  const raw =
    weights.biometric * (bs ?? 0) * (bs !== null ? 1 : 0) +
    weights.hooper * (hs ?? 0) +
    weights.historical * historical_score +
    weights.coach * coachScore;

  // Apply multipliers
  let ccrs = raw * acwrMult * phvMult;

  // Hard caps
  if (acwrValue !== null && acwrValue > acwrCfg.thresholds.hard_cap) {
    ccrs = Math.min(ccrs, cfg.hard_caps.acwr_blocked_score_cap);
  }
  ccrs = Math.min(100, Math.max(0, ccrs));

  // Confidence (how much reliable signal we have)
  const confSignal = cfg.confidence_signal_weights;
  const confScore =
    weights.biometric * fm +
    weights.hooper * (hs !== null ? 1 : 0) +
    weights.historical * confSignal.historical_weight +
    weights.coach * confSignal.coach_weight;

  const tiers = cfg.confidence_tiers;
  const confidence: Confidence = !baselineReady
    ? 'estimated'
    : confScore > tiers.very_high_min
      ? 'very_high'
      : confScore > tiers.high_min
        ? 'high'
        : confScore > tiers.medium_min
          ? 'medium'
          : 'low';

  // Recommendation
  const cutoffs = cfg.recommendation_cutoffs;
  const recommendation: Recommendation = flags.includes('ACWR_BLOCKED')
    ? 'blocked'
    : ccrs >= cutoffs.full_load_min
      ? 'full_load'
      : ccrs >= cutoffs.moderate_min
        ? 'moderate'
        : ccrs >= cutoffs.reduced_min
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
