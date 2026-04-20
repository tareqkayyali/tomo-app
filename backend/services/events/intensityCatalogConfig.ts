/**
 * ════════════════════════════════════════════════════════════════════════════
 * Intensity Catalog — CMS Configuration
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Owns every AU-per-hour rate, the program/drill → intensity translation
 * tables, and the wearable + RPE → intensity ladders. Replaces the
 * hardcoded constants at the top of loadEstimator.ts plus the scattered
 * intensity-mapping logic across the session/program pipelines.
 *
 * What this unblocks (context from the April 2026 production audit):
 *   - 1947 SESSION_LOG events firing with null intensity because
 *     scheduled training events were created without the athlete picking
 *     a bucket. With the new default_intensity on training_programs plus
 *     the drill_intensity_map here, the creation path can pull a sensible
 *     default from the linked program/drill.
 *   - The sessionHandler fallback defense (future PR) will consult this
 *     catalog to compute an AU when payload.training_load_au is missing
 *     but intensity + duration are known.
 *
 * Non-goals:
 *   - The load-attribution state machine (completed/skipped/wearable
 *     matching) lives in `load_attribution_v1`, not here.
 *   - The 3-source blended intensity cascade (wearable/RPE/checkin weights)
 *     lives in `intensity_resolution_v1`, not here.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { z } from 'zod';
import { createConfigLoader } from '@/services/config/configLoader';

// ── Schema ─────────────────────────────────────────────────────────────────

export const intensityBucket = z.enum(['REST', 'LIGHT', 'MODERATE', 'HARD', 'MATCH', 'RECOVERY']);
export type IntensityBucket = z.infer<typeof intensityBucket>;

export const intensityCatalogSchema = z.object({
  /** AU-per-hour rate for each intensity bucket (RPE proxy). */
  au_per_hour: z.object({
    REST:     z.number().min(0).max(30),
    LIGHT:    z.number().min(0).max(30),
    MODERATE: z.number().min(0).max(30),
    HARD:     z.number().min(0).max(30),
    MATCH:    z.number().min(0).max(30),
    RECOVERY: z.number().min(0).max(30),
  }),

  /** AU per hour for academic events (study, exam). Separate from physical. */
  academic_au_per_hour: z.number().min(0).max(30),

  /**
   * Per-event-type overrides. For example, event_type='match' forces
   * intensity to MATCH regardless of what the athlete selected, because
   * a competition's physiological cost is known independent of subjective
   * intensity.
   */
  event_type_overrides: z.record(
    z.string(),
    z.object({
      au_per_hour:       z.number().min(0).max(30).optional(),
      always_intensity:  intensityBucket.optional(),
    }),
  ),

  /**
   * Program.difficulty → intensity mapping. Used when creating a calendar
   * event linked to a training_programs row and the athlete doesn't
   * explicitly pick an intensity. Beginner-level programs default to
   * LIGHT, elite to HARD, etc.
   */
  program_difficulty_to_intensity: z.object({
    beginner:     intensityBucket,
    intermediate: intensityBucket,
    advanced:     intensityBucket,
    elite:        intensityBucket,
  }),

  /**
   * Drill.intensity ('light'|'moderate'|'hard', from training_drills schema)
   * → calendar event intensity bucket.
   */
  drill_intensity_map: z.object({
    light:    intensityBucket,
    moderate: intensityBucket,
    hard:     intensityBucket,
  }),

  /**
   * Wearable strain → intensity bucket. Ordered low→high. First bucket
   * whose strain_max exceeds the reading wins. WHOOP strain is 0–21.
   */
  wearable_strain_to_intensity: z.object({
    whoop: z.array(z.object({
      strain_max: z.number().min(0).max(30),
      intensity:  intensityBucket,
    })).min(1),
  }),

  /**
   * Post-session RPE (1–10) → intensity bucket. Same sentinel-ladder
   * pattern: first rpe_max > reading wins.
   */
  rpe_to_intensity: z.array(z.object({
    rpe_max:   z.number().min(1).max(10),
    intensity: intensityBucket,
  })).min(1),

  /**
   * Fallback when no intensity can be resolved from any source and
   * duration is present. Never blocks an event; ensures load is non-zero
   * so ATL/CTL isn't silently erased.
   */
  default_intensity: intensityBucket,
});

export type IntensityCatalog = z.infer<typeof intensityCatalogSchema>;

// ── DEFAULT — matches current hardcoded constants exactly ──────────────────
//
// AU rates mirror loadEstimator.ts (REST=2, LIGHT=4, MODERATE=6, HARD=8,
// MATCH=9, RECOVERY=1). Academic 10 AU/hr from academicHandler.ts.

export const INTENSITY_CATALOG_DEFAULT: IntensityCatalog = {
  au_per_hour: {
    REST:     2,
    LIGHT:    4,
    MODERATE: 6,
    HARD:     8,
    MATCH:    9,
    RECOVERY: 1,
  },
  academic_au_per_hour: 10,

  event_type_overrides: {
    match:    { au_per_hour: 9, always_intensity: 'MATCH' },
    recovery: { au_per_hour: 1, always_intensity: 'LIGHT' },
  },

  program_difficulty_to_intensity: {
    beginner:     'LIGHT',
    intermediate: 'MODERATE',
    advanced:     'HARD',
    elite:        'HARD',
  },

  drill_intensity_map: {
    light:    'LIGHT',
    moderate: 'MODERATE',
    hard:     'HARD',
  },

  wearable_strain_to_intensity: {
    whoop: [
      { strain_max: 6,  intensity: 'LIGHT' },
      { strain_max: 12, intensity: 'MODERATE' },
      { strain_max: 18, intensity: 'HARD' },
      { strain_max: 21, intensity: 'HARD' },
    ],
  },

  rpe_to_intensity: [
    { rpe_max: 2,  intensity: 'REST' },
    { rpe_max: 4,  intensity: 'LIGHT' },
    { rpe_max: 6,  intensity: 'MODERATE' },
    { rpe_max: 10, intensity: 'HARD' },
  ],

  default_intensity: 'MODERATE',
};

// ── Loader ─────────────────────────────────────────────────────────────────

export const getIntensityCatalog = createConfigLoader({
  key:     'intensity_catalog_v1',
  schema:  intensityCatalogSchema,
  default: INTENSITY_CATALOG_DEFAULT,
});

// ── Helpers for consumers ──────────────────────────────────────────────────

/**
 * Resolve AU per hour for a given event_type + intensity, honouring
 * event_type_overrides. Pure — takes the resolved config explicitly so
 * callers can pass a previously-fetched payload (avoids re-hitting the
 * loader inside a tight loop).
 */
export function auPerHourForEvent(
  config: IntensityCatalog,
  event_type: string,
  intensity: IntensityBucket | null,
): number {
  const override = config.event_type_overrides[event_type];
  if (override?.au_per_hour != null) return override.au_per_hour;
  if (override?.always_intensity) return config.au_per_hour[override.always_intensity];

  const bucket = intensity ?? config.default_intensity;
  return config.au_per_hour[bucket];
}

/** Map a Whoop strain score (0–21) to an intensity bucket. */
export function whoopStrainToIntensity(
  config: IntensityCatalog,
  strain: number,
): IntensityBucket {
  for (const row of config.wearable_strain_to_intensity.whoop) {
    if (strain <= row.strain_max) return row.intensity;
  }
  // Past the last row → treat as HARD (defensive; last row in DEFAULT
  // already caps at 21 which is the WHOOP ceiling).
  return 'HARD';
}

/** Map a reported RPE (1–10) to an intensity bucket. */
export function rpeToIntensity(
  config: IntensityCatalog,
  rpe: number,
): IntensityBucket {
  for (const row of config.rpe_to_intensity) {
    if (rpe <= row.rpe_max) return row.intensity;
  }
  return 'HARD';
}
