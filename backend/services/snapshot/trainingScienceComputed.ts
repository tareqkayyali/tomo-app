/**
 * Training Science Computed Fields — Pure function service.
 *
 * Implements the Banister (1991) training science model:
 * - Training Monotony: mean daily load / standard deviation of daily load
 * - Training Strain: total weekly load × monotony
 *
 * Monotony > 2.0 is an injury predictor independent of ACWR.
 *
 * Zero DB access.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeeklyLoadData {
  /** Daily loads for the last 7 days, most recent last. Null days omitted. */
  dailyLoads: number[];
}

export interface TrainingScienceResult {
  /**
   * weekly_load_mean / weekly_load_sd
   * Null if fewer than 4 data points (insufficient for meaningful SD)
   * > 2.0 = injury predictor (Banister 1991)
   */
  training_monotony: number | null;
  /**
   * weekly_total_load × training_monotony
   * Null if monotony is null
   */
  training_strain: number | null;
}

// ---------------------------------------------------------------------------
// Pure Function
// ---------------------------------------------------------------------------

/**
 * Compute training monotony and strain from daily load data.
 *
 * Guards:
 * - Returns null for both if fewer than 4 data points
 * - Returns null for monotony if SD is 0 (all loads identical — infinite monotony is meaningless)
 */
export function computeTrainingScience(data: WeeklyLoadData): TrainingScienceResult {
  const { dailyLoads } = data;

  if (dailyLoads.length < 4) {
    return { training_monotony: null, training_strain: null };
  }

  const n = dailyLoads.length;
  const sum = dailyLoads.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  // Standard deviation (population)
  const squaredDiffs = dailyLoads.map(x => (x - mean) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(variance);

  // SD of 0 means all loads are identical — monotony would be infinite
  if (sd === 0) {
    return { training_monotony: null, training_strain: null };
  }

  const monotony = Math.round((mean / sd) * 100) / 100; // Round to 2dp
  const strain = Math.round(sum * monotony);

  return {
    training_monotony: monotony,
    training_strain: strain,
  };
}
