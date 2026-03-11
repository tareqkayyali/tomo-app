/**
 * Derived Metric Calculator Registry
 *
 * DB stores derived_metrics as [{key: "estMaxSpeed", ...}].
 * Frontend looks up CALCULATORS["estMaxSpeed"] to get the calculate function.
 *
 * This keeps sport-science math in type-checked TypeScript code
 * while allowing DB-driven test definitions.
 */

type CalcFn = (inputs: Record<string, number | string>) => number | null;

export const DERIVED_METRIC_CALCULATORS: Record<string, CalcFn> = {
  // Sprint Test: Est. Max Speed (km/h) from 30m time
  estMaxSpeed: (inputs) => {
    const t = Number(inputs.time30m);
    if (!t || t <= 0) return null;
    return Math.round((30 / t) * 3.6 * 10) / 10;
  },

  // Jump Test: Height from Flight Time (cm)
  heightFromFlight: (inputs) => {
    const ft = Number(inputs.flightTime);
    if (!ft || ft <= 0) return null;
    const tSec = ft / 1000;
    return Math.round(((9.81 * tSec * tSec) / 8) * 100 * 10) / 10;
  },

  // Jump Test: Est. Power (W/kg) from CMJ height or flight time
  estPower: (inputs) => {
    const h =
      Number(inputs.cmjHeight) ||
      (() => {
        const ft = Number(inputs.flightTime);
        if (!ft || ft <= 0) return 0;
        const tSec = ft / 1000;
        return ((9.81 * tSec * tSec) / 8) * 100;
      })();
    if (!h || h <= 0) return null;
    return Math.round(Math.sqrt(2 * 9.81 * (h / 100)) * 10) / 10;
  },

  // Endurance Test: VO2max via Bangsbo formula
  vo2max: (inputs) => {
    const d = Number(inputs.yoyoDistance);
    if (!d || d <= 0) return null;
    return Math.round((d * 0.0084 + 36.4) * 10) / 10;
  },
};

/**
 * Standard normal CDF approximation (Abramowitz & Stegun).
 * Used for percentile calculation from z-scores.
 */
export function normalCDF(z: number): number {
  if (z < -6) return 0;
  if (z > 6) return 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
  return 0.5 * (1.0 + sign * y);
}

/**
 * Agility metric name resolver — the agility test is dynamic.
 */
const AGILITY_METRIC_MAP: Record<string, string> = {
  illinois: 'Illinois Agility Run',
  '5-0-5': '5-0-5 COD',
  ttest: 'T-Test Agility',
};

export function resolveAgilityMetricName(testType: string): string {
  return AGILITY_METRIC_MAP[testType] || 'Illinois Agility Run';
}

/**
 * Self-assessment: Map 1-5 scale to 0-99 range.
 */
const SCALE_MAP: Record<number, number> = { 1: 10, 2: 30, 3: 50, 4: 70, 5: 90 };

export function calculateSelfAssessmentRating(
  ratings: Record<string, number>,
): number {
  const values = Object.values(ratings);
  if (values.length === 0) return 0;
  const mapped = values.map((v) => SCALE_MAP[v] ?? 50);
  return Math.round(mapped.reduce((a, b) => a + b, 0) / mapped.length);
}
