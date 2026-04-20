/**
 * ════════════════════════════════════════════════════════════════════════════
 * ACWR — CMS Configuration
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Surfaces every ACWR tunable in one typed, cached, validated knob.
 * Used by:
 *   - `services/events/computations/acwrComputation.ts` (window sizes,
 *     thresholds, load-channel weights, injury-risk flag mapping)
 *   - `services/ccrs/ccrsFormula.ts::getACWRMultiplier` (mode + zone
 *     multipliers + hard-cap threshold)
 *   - `services/programs/programGuardrails.ts` (whether Rule 1 ACWR gate
 *     runs; superseded by config.enabled column on system_config)
 *
 * Mode semantics:
 *   - `hard_cap_only` (default): only ratio > hard_cap_threshold produces a
 *     non-unity multiplier and the ACWR_BLOCKED flag. Anything below
 *     collapses to sweet_spot, multiplier 1.0. This is the post-April-2026
 *     behaviour that decoupled day-to-day CCRS from academic-inflated
 *     mid-range ACWR readings.
 *   - `full`: legacy behaviour with caution/high_risk zones active.
 *
 * Load channel weights:
 *   - `training_weight` always 1.0 (physical training is the source signal)
 *   - `academic_weight` defaults to 0.0 (physical-only ratio post fix 5952593).
 *     Set to 0.4 via CMS if you want to restore the pre-decontamination blend;
 *     prefer keeping at 0 and routing academic load through the Dual Load
 *     Index instead.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { z } from 'zod';
import { createConfigLoader } from '@/services/config/configLoader';

// ── Schema ─────────────────────────────────────────────────────────────────

export const acwrConfigSchema = z.object({
  mode: z.enum(['hard_cap_only', 'full']),

  thresholds: z.object({
    // Ratios that define each zone. Must be strictly ascending.
    safe_low:       z.number().min(0).max(3),
    safe_high:      z.number().min(0).max(3),
    caution_high:   z.number().min(0).max(3),
    danger_high:    z.number().min(0).max(3),
    hard_cap:       z.number().min(0).max(5),
  }).refine(
    (t) => t.safe_low < t.safe_high
        && t.safe_high <= t.caution_high
        && t.caution_high < t.danger_high
        && t.danger_high < t.hard_cap,
    { message: 'ACWR thresholds must be strictly ascending (safe_low < safe_high ≤ caution_high < danger_high < hard_cap)' },
  ),

  multipliers: z.object({
    undertraining: z.number().min(0).max(1),
    sweet_spot:    z.number().min(0).max(1),
    caution:       z.number().min(0).max(1),
    high_risk:     z.number().min(0).max(1),
    blocked:       z.number().min(0).max(1),
  }),

  windows: z.object({
    acute_days:   z.number().int().min(1).max(14),
    chronic_days: z.number().int().min(7).max(90),
  }).refine(
    (w) => w.chronic_days > w.acute_days,
    { message: 'chronic_days must exceed acute_days' },
  ),

  load_channels: z.object({
    training_weight: z.number().min(0).max(2),
    academic_weight: z.number().min(0).max(2),
  }),

  injury_risk_flag: z.object({
    // Map of ACWR ratio → flag. Rules checked in order; first match wins.
    // Encoded as thresholds + direction instead of a free-form list so the
    // admin UI can render simple inputs.
    red_above:     z.number().min(0).max(5),
    amber_above:   z.number().min(0).max(5),
    amber_below:   z.number().min(0).max(3),
  }).refine(
    (r) => r.red_above > r.amber_above && r.amber_below <= r.amber_above,
    { message: 'injury_risk_flag: red_above > amber_above > amber_below' },
  ),
});

export type ACWRConfig = z.infer<typeof acwrConfigSchema>;

// ── DEFAULT — matches current hardcoded constants exactly ──────────────────
//
// These values mirror:
//   - `services/events/constants.ts`:    ACWR_SAFE_LOW=0.8, ACWR_SAFE_HIGH=1.3, ACWR_DANGER_HIGH=1.5
//   - `services/ccrs/ccrsFormula.ts`:    getACWRMultiplier thresholds + multipliers, hard cap > 2.0
//   - `services/events/computations/acwrComputation.ts`: 7d/28d windows, physical-only (academic_weight=0)
//   - `services/programs/programGuardrails.ts`:          injury_risk_flag RED > 1.5, AMBER = outside 0.8–1.3

export const ACWR_CONFIG_DEFAULT: ACWRConfig = {
  mode: 'hard_cap_only',

  thresholds: {
    safe_low:     0.8,
    safe_high:    1.3,
    caution_high: 1.3,
    danger_high:  1.5,
    hard_cap:     2.0,
  },

  multipliers: {
    undertraining: 0.90,
    sweet_spot:    1.00,
    caution:       0.85,
    high_risk:     0.65,
    blocked:       0.40,
  },

  windows: {
    acute_days:   7,
    chronic_days: 28,
  },

  load_channels: {
    // Physical-only since commit 5952593. Academic surfaces via DLI.
    training_weight: 1.0,
    academic_weight: 0.0,
  },

  injury_risk_flag: {
    red_above:    1.5,
    amber_above:  1.3,
    amber_below:  0.8,
  },
};

// ── Loader ─────────────────────────────────────────────────────────────────

export const getACWRConfig = createConfigLoader({
  key:     'acwr_config_v1',
  schema:  acwrConfigSchema,
  default: ACWR_CONFIG_DEFAULT,
});
