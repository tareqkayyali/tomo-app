/**
 * Vitals Normative Data — Age-band ranges for wearable vitals
 *
 * Hardcoded TS constants (no DB table needed) with published pediatric/adolescent
 * normative ranges. Uses the same percentile math as benchmarkService.ts.
 *
 * Sources: Buchheit 2014 (HRV youth athletes), NSF (sleep), WHO (resp rate, SpO2)
 */

import {
  interpolatePercentile,
  getPercentileZone,
} from "@/scripts/seeds/football_benchmark_seed";

// ── Types ──────────────────────────────────────────────────────────

export interface VitalNormDef {
  metric: string;       // matches health_data.metric_type
  label: string;
  unit: string;
  direction: "higher_better" | "lower_better";
  ageMin: number;       // 13
  ageMax: number;       // 23
  means: number[];      // one per age (index 0 = age 13)
  sds: number[];        // one per age
}

export interface VitalPercentileResult {
  percentile: number;
  zone: "elite" | "good" | "average" | "developing" | "below";
  zoneLabel: string;
  ageMean: number;
  ageSd: number;
}

// ── Normative Data (ages 13–23, index 0 = age 13) ──────────────────

const VITAL_NORMS: VitalNormDef[] = [
  {
    metric: "hrv",
    label: "HRV",
    unit: "ms",
    direction: "higher_better",
    ageMin: 13,
    ageMax: 23,
    // Youth athletes: higher HRV = better parasympathetic tone
    // Ranges: ~50-70ms rMSSD for trained youth, improving through adolescence
    means: [52, 55, 58, 61, 63, 65, 66, 67, 67, 66, 65],
    sds:   [18, 18, 19, 19, 20, 20, 20, 20, 19, 19, 18],
  },
  {
    metric: "resting_hr",
    label: "Resting HR",
    unit: "bpm",
    direction: "lower_better",
    ageMin: 13,
    ageMax: 23,
    // Resting HR decreases with fitness and maturation
    means: [72, 70, 68, 66, 64, 63, 62, 61, 61, 60, 60],
    sds:   [10, 10, 10, 9,  9,  9,  8,  8,  8,  8,  8],
  },
  {
    metric: "sleep_hours",
    label: "Sleep",
    unit: "hrs",
    direction: "higher_better",
    ageMin: 13,
    ageMax: 23,
    // NSF: teens need 8-10h, young adults 7-9h
    means: [8.5, 8.3, 8.1, 7.9, 7.8, 7.6, 7.5, 7.4, 7.3, 7.2, 7.2],
    sds:   [1.2, 1.2, 1.3, 1.3, 1.3, 1.2, 1.2, 1.1, 1.1, 1.0, 1.0],
  },
  {
    metric: "blood_oxygen",
    label: "SpO2",
    unit: "%",
    direction: "higher_better",
    ageMin: 13,
    ageMax: 23,
    // Narrow range, 95-100% normal for all ages
    means: [97.5, 97.5, 97.5, 97.5, 97.5, 97.5, 97.5, 97.5, 97.5, 97.5, 97.5],
    sds:   [1.0,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0],
  },
  {
    metric: "respiratory_rate",
    label: "Respiratory Rate",
    unit: "brpm",
    direction: "lower_better",
    ageMin: 13,
    ageMax: 23,
    // Normal: 12-20 breaths/min, lower with fitness
    means: [17, 16.5, 16, 15.5, 15, 15, 14.5, 14.5, 14, 14, 14],
    sds:   [2.5, 2.5, 2.5, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0],
  },
  {
    metric: "steps",
    label: "Daily Steps",
    unit: "steps",
    direction: "higher_better",
    ageMin: 13,
    ageMax: 23,
    // Active youth athletes: 8000-14000 steps/day typical
    means: [10500, 10800, 11000, 11200, 10800, 10500, 10200, 10000, 9800, 9500, 9200],
    sds:   [3000,  3000,  3200,  3200,  3000,  3000,  2800,  2800,  2600, 2600, 2500],
  },
];

// ── Functions ──────────────────────────────────────────────────────

/**
 * Get normative data for a specific metric and age.
 * Returns null if metric not found or age out of range.
 */
export function getVitalNormForAge(
  metric: string,
  age: number
): { mean: number; sd: number; direction: "higher_better" | "lower_better" } | null {
  const norm = VITAL_NORMS.find((n) => n.metric === metric);
  if (!norm) return null;

  const clampedAge = Math.max(norm.ageMin, Math.min(norm.ageMax, Math.round(age)));
  const idx = clampedAge - norm.ageMin;

  return {
    mean: norm.means[idx],
    sd: norm.sds[idx],
    direction: norm.direction,
  };
}

/**
 * Compute percentile + zone for a vital metric value given the player's age.
 * Returns null if metric has no norms or age is unavailable.
 */
export function getVitalPercentile(
  metric: string,
  value: number,
  age: number | null
): VitalPercentileResult | null {
  if (age == null || isNaN(value)) return null;

  const normData = getVitalNormForAge(metric, age);
  if (!normData) return null;

  const percentile = interpolatePercentile(value, normData.mean, normData.sd, normData.direction);
  const zone = getPercentileZone(percentile);

  return {
    percentile,
    zone,
    zoneLabel: getVitalZoneLabel(zone, Math.round(age)),
    ageMean: normData.mean,
    ageSd: normData.sd,
  };
}

/**
 * Teen-friendly zone label with age context.
 */
function getVitalZoneLabel(
  zone: "elite" | "good" | "average" | "developing" | "below",
  age: number
): string {
  switch (zone) {
    case "elite":
      return `Top level for ${age}-year-olds`;
    case "good":
      return `Good for your age`;
    case "average":
      return `Average for your age`;
    case "developing":
      return `Below average for ${age}-year-olds`;
    case "below":
      return `Needs attention`;
  }
}

/**
 * Get all available vital norm definitions (for iteration).
 */
export function getAllVitalNorms(): VitalNormDef[] {
  return VITAL_NORMS;
}
