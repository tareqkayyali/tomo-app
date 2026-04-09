/**
 * Dual Load Index (DLI) — Pure function service.
 *
 * Computes the composite training + academic load metric.
 * Formula: DLI = (NTL × alpha) + (NAL × beta)
 * where NTL = normalized training load, NAL = normalized academic load.
 *
 * Zero DB access. Called by event handlers and planning engine.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DualLoadInput {
  /** 7-day athletic training load (AU). From snapshot: athletic_load_7day */
  athleticLoad7day: number | null;
  /** 7-day academic load (AU). From snapshot: academic_load_7day */
  academicLoad7day: number | null;
  /** Mode-specific load cap multiplier (0.0–1.0). From mode params */
  loadCapMultiplier?: number;
}

export interface DualLoadResult {
  dual_load_index: number | null;
  dual_load_zone: 'green' | 'amber' | 'red' | 'critical' | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Normalization ceilings (population P95 values) */
const TRAINING_LOAD_CEILING = 3000; // AU — elite youth weekly ceiling
const ACADEMIC_LOAD_CEILING = 500;  // AU — heavy exam week ceiling

/** Weighting factors */
const ALPHA = 0.6; // Training weight
const BETA = 0.4;  // Academic weight

/** Zone thresholds (aligned with dual_load_thresholds CMS table defaults) */
const ZONE_THRESHOLDS = {
  green: { min: 0, max: 50 },
  amber: { min: 51, max: 70 },
  red: { min: 71, max: 85 },
  critical: { min: 86, max: 100 },
} as const;

// ---------------------------------------------------------------------------
// Pure Function
// ---------------------------------------------------------------------------

/**
 * Compute the Dual Load Index from training and academic load.
 *
 * Returns null if both inputs are null (insufficient data).
 * Returns a value even if only one component is available (with the other treated as 0).
 */
export function computeDualLoadIndex(input: DualLoadInput): DualLoadResult {
  const { athleticLoad7day, academicLoad7day, loadCapMultiplier = 1.0 } = input;

  // Both null → insufficient data
  if (athleticLoad7day === null && academicLoad7day === null) {
    return { dual_load_index: null, dual_load_zone: null };
  }

  // Normalize each component to 0–100
  const ntl = Math.min(100, ((athleticLoad7day ?? 0) / TRAINING_LOAD_CEILING) * 100);
  const nal = Math.min(100, ((academicLoad7day ?? 0) / ACADEMIC_LOAD_CEILING) * 100);

  // Apply mode load cap to training component only
  const adjustedNtl = ntl * loadCapMultiplier;

  // Compute composite index
  const rawDli = (adjustedNtl * ALPHA) + (nal * BETA);
  const dli = Math.round(Math.min(100, Math.max(0, rawDli)));

  // Classify zone
  let zone: DualLoadResult['dual_load_zone'] = 'green';
  if (dli >= ZONE_THRESHOLDS.critical.min) zone = 'critical';
  else if (dli >= ZONE_THRESHOLDS.red.min) zone = 'red';
  else if (dli >= ZONE_THRESHOLDS.amber.min) zone = 'amber';

  return { dual_load_index: dli, dual_load_zone: zone };
}
