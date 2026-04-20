/**
 * ════════════════════════════════════════════════════════════════════════════
 * CCRS Formula — CMS Configuration
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Every tunable parameter in the CCRS formula is surfaced here as a Zod
 * schema + hardcoded DEFAULT. The DEFAULT is the source of truth for
 * cold-boot and fallback paths; the DB row in `system_config` lets ops
 * override a value without a code deploy.
 *
 * Physiological curves (HRV z-score → score, RHR → score, sleep hours →
 * score) are intentionally NOT in config. They're evidence-based
 * functions, not business knobs, and changing them should require a PR
 * with a scientific citation.
 *
 * What IS configurable:
 *   - Biometric composite weights (HRV, RHR, sleep split)
 *   - Hooper motivation youth multiplier
 *   - Freshness decay curve (hour thresholds + multipliers)
 *   - PHV multipliers per stage
 *   - Cascade weight constants (the cornerstone of the "cascading"
 *     confidence algorithm)
 *   - Confidence tier thresholds
 *   - Recommendation cutoffs (full_load / moderate / reduced / recovery)
 *   - Hard-cap score for ACWR_BLOCKED
 *   - Alert flag thresholds
 *   - Default coach phase score (until coach inputs land in the pipeline)
 *
 * Wiring:
 *   - `ccrsFormula.calculateCCRS` accepts an optional config; when absent,
 *     uses DEFAULT.
 *   - `ccrsAssembler.computeAndPersistCCRS` calls `getCCRSConfig()` and
 *     passes the resolved payload in.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { z } from 'zod';
import { createConfigLoader } from '@/services/config/configLoader';

// ── Schema ─────────────────────────────────────────────────────────────────

export const ccrsFormulaSchema = z.object({
  biometric_composite: z.object({
    // HRV/RHR/Sleep split inside getBiometricScore. Must sum to 1.0.
    hrv_weight:   z.number().min(0).max(1),
    rhr_weight:   z.number().min(0).max(1),
    sleep_weight: z.number().min(0).max(1),
  }).refine(
    (c) => Math.abs(c.hrv_weight + c.rhr_weight + c.sleep_weight - 1) < 0.001,
    { message: 'hrv_weight + rhr_weight + sleep_weight must sum to 1.0' },
  ),

  hooper: z.object({
    youth_motivation_multiplier: z.number().min(1).max(2),
    youth_age_threshold:         z.number().int().min(10).max(25),
  }),

  freshness_decay: z.array(z.object({
    hours_max:  z.number().min(0),
    multiplier: z.number().min(0).max(1),
  })).min(1),

  phv_multipliers: z.object({
    pre_phv:  z.number().min(0.5).max(1.2),
    mid_phv:  z.number().min(0.5).max(1.2),
    post_phv: z.number().min(0.5).max(1.2),
    adult:    z.number().min(0.5).max(1.2),
    unknown:  z.number().min(0.5).max(1.2),
  }),

  cascade_weights: z.object({
    // Tier 1 — biometric when fresh
    biometric_full:               z.number().min(0).max(1),
    biometric_freshness_min:      z.number().min(0).max(1),
    // Tier 2 — hooper (two branches depending on bio availability)
    hooper_with_biometric:        z.number().min(0).max(1),
    hooper_without_biometric:     z.number().min(0).max(1),
    // Tier 4 — coach (runtime-weighted behind bio/hooper)
    coach_when_available:         z.number().min(0).max(1),
  }),

  confidence_tiers: z.object({
    very_high_min: z.number().min(0).max(1),
    high_min:      z.number().min(0).max(1),
    medium_min:    z.number().min(0).max(1),
  }).refine(
    (c) => c.very_high_min > c.high_min && c.high_min > c.medium_min,
    { message: 'confidence tier thresholds must be strictly decreasing' },
  ),

  recommendation_cutoffs: z.object({
    full_load_min: z.number().int().min(0).max(100),
    moderate_min:  z.number().int().min(0).max(100),
    reduced_min:   z.number().int().min(0).max(100),
    // Below reduced_min is always 'recovery'. blocked is driven by ACWR_BLOCKED flag only.
  }).refine(
    (c) => c.full_load_min > c.moderate_min && c.moderate_min > c.reduced_min,
    { message: 'recommendation cutoffs must be strictly decreasing' },
  ),

  hard_caps: z.object({
    acwr_blocked_score_cap: z.number().int().min(0).max(100),
  }),

  historical_default: z.number().min(0).max(100),
  coach_phase_default: z.number().min(0).max(100),

  alert_thresholds: z.object({
    // HRV_SUPPRESSED fires when biometric_score < this AND freshness > freshness_min
    hrv_suppressed_score_max:  z.number().min(0).max(100),
    hrv_suppressed_freshness_min: z.number().min(0).max(1),
    sleep_deficit_hours_max:   z.number().min(0).max(24),
    low_motivation_max:        z.number().int().min(1).max(5),
  }),

  // Internal weights used inside the confidence calculation. Exposed so ops
  // can tune how much "having a check-in" boosts confidence vs "having a
  // fresh biometric reading" vs "having historical prior".
  confidence_signal_weights: z.object({
    historical_weight: z.number().min(0).max(1),
    coach_weight:      z.number().min(0).max(1),
  }),
});

export type CCRSFormulaConfig = z.infer<typeof ccrsFormulaSchema>;

// ── DEFAULT — matches current hardcoded constants exactly ──────────────────

export const CCRS_FORMULA_DEFAULT: CCRSFormulaConfig = {
  biometric_composite: {
    hrv_weight:   0.45,
    rhr_weight:   0.30,
    sleep_weight: 0.25,
  },
  hooper: {
    youth_motivation_multiplier: 1.2,
    youth_age_threshold:         18,
  },
  // Matches getFreshnessMult: <8h=1.0, <16h=0.75, <24h=0.45, <48h=0.15, else 0
  freshness_decay: [
    { hours_max: 8,   multiplier: 1.00 },
    { hours_max: 16,  multiplier: 0.75 },
    { hours_max: 24,  multiplier: 0.45 },
    { hours_max: 48,  multiplier: 0.15 },
    { hours_max: 9999, multiplier: 0.00 },
  ],
  phv_multipliers: {
    pre_phv:  1.00,
    mid_phv:  0.85,
    post_phv: 0.95,
    adult:    1.00,
    unknown:  0.90,
  },
  cascade_weights: {
    biometric_full:           0.55,
    biometric_freshness_min:  0.75,
    hooper_with_biometric:    0.30,
    hooper_without_biometric: 0.65,
    coach_when_available:     0.08,
  },
  confidence_tiers: {
    very_high_min: 0.75,
    high_min:      0.55,
    medium_min:    0.35,
  },
  recommendation_cutoffs: {
    full_load_min: 80,
    moderate_min:  65,
    reduced_min:   45,
  },
  hard_caps: {
    acwr_blocked_score_cap: 40,
  },
  historical_default:  62,  // seeded from ccrsAssembler historicalAvg fallback
  coach_phase_default: 65,  // line 331 of ccrsFormula.ts
  alert_thresholds: {
    hrv_suppressed_score_max:     50,
    hrv_suppressed_freshness_min: 0.5,
    sleep_deficit_hours_max:      6,
    low_motivation_max:           2,
  },
  confidence_signal_weights: {
    historical_weight: 0.6, // line 349 of ccrsFormula.ts
    coach_weight:      0.7, // line 350 of ccrsFormula.ts
  },
};

// ── Loader ─────────────────────────────────────────────────────────────────

export const getCCRSConfig = createConfigLoader({
  key:     'ccrs_formula_v1',
  schema:  ccrsFormulaSchema,
  default: CCRS_FORMULA_DEFAULT,
});

// ── Helpers for consumers ──────────────────────────────────────────────────

/**
 * Resolve freshness multiplier from an age-in-hours against the decay curve.
 * Centralised so the curve evaluation stays consistent anywhere the config
 * is read. Replaces the hardcoded ladder in getFreshnessMult().
 */
export function freshnessMultFromConfig(
  config: CCRSFormulaConfig,
  data_age_hours: number,
): number {
  // Entries are sorted ascending by hours_max; walk until we find the first
  // bucket whose upper bound exceeds the age.
  for (const bucket of config.freshness_decay) {
    if (data_age_hours < bucket.hours_max) return bucket.multiplier;
  }
  // Fallthrough: past the last bucket → 0 staleness.
  return 0;
}
