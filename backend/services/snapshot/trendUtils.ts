/**
 * Trend Utilities — Shared pure functions for computing directional trends.
 *
 * Used by vitalHandler, sessionHandler, and wellnessHandler to compute:
 * - resting_hr_trend_7d
 * - acwr_trend
 * - sleep_trend_7d
 * - hrv_trend_7d_pct
 * - load_trend_7d_pct
 *
 * Zero DB access.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrendDirection = 'IMPROVING' | 'STABLE' | 'DECLINING';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum non-null values required to compute a meaningful trend */
const MIN_VALUES = 4;
/** Percentage change threshold to be considered improving/declining (3%) */
const CHANGE_THRESHOLD_PCT = 3;

// ---------------------------------------------------------------------------
// Pure Functions
// ---------------------------------------------------------------------------

/**
 * Compute a directional trend from a series of values (most recent last).
 *
 * Compares the average of the last 3 values against the average of the prior values.
 * Returns null if fewer than MIN_VALUES non-null values exist.
 *
 * For metrics where LOWER is better (e.g., resting HR), set `lowerIsBetter = true`.
 *
 * @param values - Array of numbers (most recent last), nulls included
 * @param lowerIsBetter - If true, a decrease is IMPROVING (default: false)
 */
export function computeTrend(
  values: (number | null)[],
  lowerIsBetter = false
): TrendDirection | null {
  const nonNull = values.filter((v): v is number => v !== null);

  if (nonNull.length < MIN_VALUES) {
    return null;
  }

  // Split into recent (last 3) and prior (everything before)
  const recentCount = Math.min(3, nonNull.length - 1);
  const recent = nonNull.slice(-recentCount);
  const prior = nonNull.slice(0, -recentCount);

  if (prior.length === 0) return null;

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;

  // Avoid division by zero
  if (priorAvg === 0) return 'STABLE';

  const changePct = ((recentAvg - priorAvg) / Math.abs(priorAvg)) * 100;

  if (Math.abs(changePct) <= CHANGE_THRESHOLD_PCT) {
    return 'STABLE';
  }

  const isIncreasing = changePct > 0;

  // For most metrics, increasing = improving. For resting HR, decreasing = improving.
  if (lowerIsBetter) {
    return isIncreasing ? 'DECLINING' : 'IMPROVING';
  }
  return isIncreasing ? 'IMPROVING' : 'DECLINING';
}

/**
 * Compute a percentage change trend (e.g., HRV trend, load trend).
 *
 * Returns the percentage change as a number rather than a direction string.
 * Positive = recent values are higher. Negative = lower.
 * Returns null if insufficient data.
 */
export function computeTrendPct(values: (number | null)[]): number | null {
  const nonNull = values.filter((v): v is number => v !== null);

  if (nonNull.length < MIN_VALUES) {
    return null;
  }

  const recentCount = Math.min(3, nonNull.length - 1);
  const recent = nonNull.slice(-recentCount);
  const prior = nonNull.slice(0, -recentCount);

  if (prior.length === 0) return null;

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;

  if (priorAvg === 0) return null;

  return Math.round(((recentAvg / priorAvg) - 1) * 10000) / 100; // Round to 2dp
}

/**
 * Compute sleep debt over the last 3 nights.
 *
 * Sleep debt = sum(max(0, targetHours - actualHours)) over 3 nights.
 * Returns null if any of the 3 nights has no data.
 *
 * @param last3NightsSleepHours - Array of 3 sleep hour values (most recent last)
 * @param targetHours - Target sleep hours (default 8)
 */
export function computeSleepDebt3d(
  last3NightsSleepHours: (number | null)[],
  targetHours = 8
): number | null {
  if (last3NightsSleepHours.length < 3) return null;

  const last3 = last3NightsSleepHours.slice(-3);
  if (last3.some(v => v === null)) return null;

  const debt = last3.reduce((sum: number, hours) => {
    return sum + Math.max(0, targetHours - (hours as number));
  }, 0 as number);

  return Math.round(debt * 10) / 10; // Round to 1dp
}

/**
 * Compute sleep consistency score from a week of sleep hours.
 *
 * Score = 100 - (stddev × 20), clamped 0–100.
 * Returns null if fewer than 4 data points.
 *
 * Higher consistency (lower stddev) = higher score.
 */
export function computeSleepConsistency(
  sleepHoursArray: (number | null)[]
): number | null {
  const nonNull = sleepHoursArray.filter((v): v is number => v !== null);

  if (nonNull.length < 4) return null;

  const mean = nonNull.reduce((a, b) => a + b, 0) / nonNull.length;
  const variance = nonNull.reduce((sum, v) => sum + (v - mean) ** 2, 0) / nonNull.length;
  const sd = Math.sqrt(variance);

  const score = Math.round(100 - sd * 20);
  return Math.min(100, Math.max(0, score));
}
