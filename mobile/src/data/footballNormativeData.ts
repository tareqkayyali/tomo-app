/**
 * Football Normative Data
 * Age-stratified norms (means & SDs) for 42 football performance metrics.
 *
 * Research basis:
 * Sprint norms from Section 6.1, CMJ/jump from 6.2, agility from 6.3,
 * Yo-Yo IR1/VO2max from 6.4, strength from 6.6.
 */

import type { FootballAttribute } from '../types/football';

// ═══ INTERFACES ═══

export interface MetricNorm {
  name: string;
  unit: string;
  attribute: FootballAttribute;
  direction: 'higher' | 'lower';
  /** Index 0 = age 13, index 1 = age 14, ..., index 10 = age 23 */
  means: number[];
  sds: number[];
}

// ═══ NORMATIVE DATA — ALL 42 METRICS BY AGE (13-23) ═══
// Derived from Research Sections 6.1-6.6, Tomo Football Metrics Database.
// Each array has 11 entries: index 0 = age 13, index 10 = age 23.

export const FOOTBALL_NORMATIVE_DATA: MetricNorm[] = [
  // ── PAC (Pace) — 7 metrics ──
  { name: '5m Sprint', unit: 's', attribute: 'pace', direction: 'lower',
    means: [1.15, 1.12, 1.08, 1.05, 1.02, 1.00, 0.98, 0.97, 0.96, 0.96, 0.96],
    sds:   [0.08, 0.07, 0.07, 0.06, 0.06, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05] },
  { name: '10m Sprint', unit: 's', attribute: 'pace', direction: 'lower',
    means: [1.95, 1.90, 1.85, 1.80, 1.75, 1.72, 1.70, 1.70, 1.70, 1.70, 1.70],
    sds:   [0.12, 0.11, 0.10, 0.09, 0.08, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07] },
  { name: '30m Sprint', unit: 's', attribute: 'pace', direction: 'lower',
    means: [5.00, 4.80, 4.55, 4.35, 4.20, 4.10, 4.05, 4.00, 3.98, 3.97, 3.96],
    sds:   [0.30, 0.28, 0.25, 0.22, 0.20, 0.18, 0.15, 0.15, 0.15, 0.15, 0.15] },
  { name: 'Max Sprint Speed', unit: 'km/h', attribute: 'pace', direction: 'higher',
    means: [25.0, 27.0, 28.0, 29.0, 30.0, 31.0, 32.0, 32.5, 33.0, 33.0, 33.0],
    sds:   [2.5, 2.5, 2.0, 2.0, 2.0, 1.8, 1.5, 1.5, 1.5, 1.5, 1.5] },
  { name: 'Flying 20m Sprint', unit: 's', attribute: 'pace', direction: 'lower',
    means: [3.10, 2.95, 2.80, 2.65, 2.55, 2.45, 2.40, 2.35, 2.32, 2.30, 2.30],
    sds:   [0.20, 0.18, 0.16, 0.15, 0.12, 0.12, 0.10, 0.10, 0.10, 0.10, 0.10] },
  { name: '40m Sprint', unit: 's', attribute: 'pace', direction: 'lower',
    means: [6.50, 6.20, 5.90, 5.60, 5.35, 5.20, 5.10, 5.05, 5.02, 5.00, 5.00],
    sds:   [0.40, 0.35, 0.30, 0.28, 0.25, 0.22, 0.20, 0.18, 0.18, 0.18, 0.18] },
  { name: 'Repeated Sprint Avg 6x30m', unit: 's', attribute: 'pace', direction: 'lower',
    means: [5.30, 5.10, 4.90, 4.70, 4.55, 4.45, 4.40, 4.35, 4.32, 4.30, 4.30],
    sds:   [0.30, 0.28, 0.25, 0.22, 0.20, 0.18, 0.15, 0.15, 0.15, 0.15, 0.15] },

  // ── SHO (Shooting) — 7 metrics ──
  { name: 'Shot Power', unit: 'km/h', attribute: 'shooting', direction: 'higher',
    means: [60, 70, 78, 85, 92, 100, 105, 110, 112, 114, 115],
    sds:   [8, 8, 8, 8, 7, 7, 6, 6, 6, 6, 6] },
  { name: 'Max Kick Distance', unit: 'm', attribute: 'shooting', direction: 'higher',
    means: [30, 35, 40, 45, 50, 55, 58, 60, 61, 62, 62],
    sds:   [5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4] },
  { name: 'Non-Dominant Foot Speed', unit: 'km/h', attribute: 'shooting', direction: 'higher',
    means: [42, 50, 56, 62, 68, 75, 80, 85, 87, 88, 88],
    sds:   [7, 7, 7, 7, 6, 6, 5, 5, 5, 5, 5] },
  { name: 'Volley Kick Speed', unit: 'km/h', attribute: 'shooting', direction: 'higher',
    means: [48, 56, 64, 72, 78, 85, 90, 95, 97, 99, 100],
    sds:   [7, 7, 7, 7, 6, 6, 5, 5, 5, 5, 5] },
  { name: 'Shooting Drill Score', unit: 'pts/10', attribute: 'shooting', direction: 'higher',
    means: [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.2, 7.3, 7.4, 7.5],
    sds:   [1.2, 1.2, 1.1, 1.1, 1.0, 1.0, 0.9, 0.9, 0.9, 0.9, 0.9] },
  { name: 'Free Kick Distance', unit: 'm', attribute: 'shooting', direction: 'higher',
    means: [18, 22, 25, 28, 30, 32, 34, 35, 35.5, 36, 36],
    sds:   [4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3] },
  { name: 'Shot Release Time', unit: 's', attribute: 'shooting', direction: 'lower',
    means: [1.20, 1.10, 1.00, 0.90, 0.80, 0.70, 0.65, 0.60, 0.58, 0.56, 0.55],
    sds:   [0.15, 0.14, 0.12, 0.11, 0.10, 0.08, 0.07, 0.07, 0.07, 0.07, 0.07] },

  // ── PAS (Passing) — 7 metrics ──
  { name: 'Long Pass Distance', unit: 'm', attribute: 'passing', direction: 'higher',
    means: [28, 32, 36, 40, 45, 48, 52, 55, 56, 57, 57],
    sds:   [5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4] },
  { name: 'Pass Speed', unit: 'km/h', attribute: 'passing', direction: 'higher',
    means: [50, 58, 64, 70, 76, 82, 88, 92, 93, 94, 95],
    sds:   [7, 7, 6, 6, 6, 5, 5, 5, 5, 5, 5] },
  { name: 'Short Pass Drill Time', unit: 's', attribute: 'passing', direction: 'lower',
    means: [38, 35, 32, 30, 28, 26, 25, 24, 23.5, 23, 23],
    sds:   [4.0, 3.5, 3.0, 3.0, 2.5, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0] },
  { name: 'Passing Accuracy Drill', unit: 'pts/20', attribute: 'passing', direction: 'higher',
    means: [10, 11, 12, 13, 14, 15, 15.5, 16, 16.2, 16.4, 16.5],
    sds:   [2.0, 2.0, 2.0, 2.0, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5] },
  { name: 'Cross Delivery Distance', unit: 'm', attribute: 'passing', direction: 'higher',
    means: [22, 26, 30, 34, 38, 42, 45, 48, 49, 50, 50],
    sds:   [4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3] },
  { name: 'Throw-In Distance', unit: 'm', attribute: 'passing', direction: 'higher',
    means: [12, 15, 18, 20, 23, 25, 27, 29, 29.5, 30, 30],
    sds:   [3.0, 3.0, 3.0, 3.0, 2.5, 2.5, 2.5, 2.0, 2.0, 2.0, 2.0] },
  { name: 'Lofted Pass Hang Time', unit: 's', attribute: 'passing', direction: 'higher',
    means: [1.4, 1.6, 1.8, 2.0, 2.1, 2.3, 2.4, 2.5, 2.55, 2.58, 2.60],
    sds:   [0.30, 0.30, 0.25, 0.25, 0.20, 0.20, 0.20, 0.20, 0.20, 0.20, 0.20] },

  // ── DRI (Dribbling / Agility) — 7 metrics ──
  { name: 'T-Test Agility', unit: 's', attribute: 'dribbling', direction: 'lower',
    means: [11.5, 11.0, 10.5, 10.2, 10.0, 9.7, 9.5, 9.4, 9.35, 9.30, 9.30],
    sds:   [0.8, 0.7, 0.6, 0.5, 0.5, 0.4, 0.4, 0.3, 0.3, 0.3, 0.3] },
  { name: '5-0-5 COD', unit: 's', attribute: 'dribbling', direction: 'lower',
    means: [2.80, 2.65, 2.50, 2.40, 2.30, 2.25, 2.22, 2.20, 2.19, 2.18, 2.18],
    sds:   [0.20, 0.18, 0.15, 0.14, 0.12, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10] },
  { name: '5-10-5 Agility', unit: 's', attribute: 'dribbling', direction: 'lower',
    means: [5.50, 5.30, 5.10, 4.90, 4.75, 4.60, 4.50, 4.42, 4.38, 4.35, 4.35],
    sds:   [0.35, 0.30, 0.28, 0.25, 0.22, 0.20, 0.18, 0.16, 0.15, 0.15, 0.15] },
  { name: 'Illinois Agility Run', unit: 's', attribute: 'dribbling', direction: 'lower',
    means: [18.5, 17.5, 16.8, 16.2, 15.8, 15.3, 15.0, 14.8, 14.7, 14.6, 14.6],
    sds:   [1.2, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5] },
  { name: 'Slalom Dribble 10 Cones', unit: 's', attribute: 'dribbling', direction: 'lower',
    means: [17.0, 16.0, 15.0, 14.2, 13.5, 12.8, 12.3, 12.0, 11.9, 11.8, 11.8],
    sds:   [1.5, 1.3, 1.2, 1.0, 0.9, 0.8, 0.7, 0.7, 0.7, 0.7, 0.7] },
  { name: 'Ball Juggling Count', unit: 'reps', attribute: 'dribbling', direction: 'higher',
    means: [20, 35, 50, 70, 85, 100, 110, 120, 125, 128, 130],
    sds:   [10, 12, 15, 18, 18, 20, 20, 20, 20, 20, 20] },
  { name: 'Reaction Time', unit: 'ms', attribute: 'dribbling', direction: 'lower',
    means: [280, 260, 245, 230, 220, 210, 205, 200, 198, 196, 195],
    sds:   [25, 22, 20, 18, 15, 13, 12, 12, 12, 12, 12] },
  { name: 'Arrowhead Agility', unit: 's', attribute: 'dribbling', direction: 'lower',
    means: [10.5, 10.0, 9.5, 9.2, 9.0, 8.7, 8.5, 8.4, 8.35, 8.30, 8.30],
    sds:   [0.7, 0.6, 0.5, 0.5, 0.4, 0.4, 0.3, 0.3, 0.3, 0.3, 0.3] },

  // ── DEF (Defending / Duels) — 7 metrics ──
  { name: 'Standing Vertical Jump', unit: 'cm', attribute: 'defending', direction: 'higher',
    means: [25, 28, 32, 35, 38, 40, 41, 42, 42.5, 43, 43],
    sds:   [4, 4, 4, 4, 3.5, 3, 3, 3, 3, 3, 3] },
  { name: 'Header Distance', unit: 'm', attribute: 'defending', direction: 'higher',
    means: [5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 12.5, 13.0, 13.0],
    sds:   [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5] },
  { name: 'Lateral Shuffle 5mx4', unit: 's', attribute: 'defending', direction: 'lower',
    means: [7.2, 6.8, 6.4, 6.1, 5.8, 5.6, 5.4, 5.3, 5.25, 5.20, 5.20],
    sds:   [0.5, 0.5, 0.4, 0.4, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3] },
  { name: 'Backward Sprint 10m', unit: 's', attribute: 'defending', direction: 'lower',
    means: [4.00, 3.80, 3.50, 3.30, 3.20, 3.10, 3.00, 2.90, 2.88, 2.86, 2.85],
    sds:   [0.30, 0.30, 0.25, 0.22, 0.20, 0.18, 0.15, 0.15, 0.15, 0.15, 0.15] },
  { name: 'Isometric Push Strength', unit: 'kg', attribute: 'defending', direction: 'higher',
    means: [30, 35, 42, 50, 58, 65, 72, 78, 80, 82, 82],
    sds:   [5, 5, 6, 7, 7, 7, 7, 7, 7, 7, 7] },
  { name: 'Grip Strength', unit: 'kg', attribute: 'defending', direction: 'higher',
    means: [25, 30, 35, 38, 42, 45, 47, 48, 49, 50, 50],
    sds:   [4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3] },
  { name: 'Recovery Run 40m', unit: 's', attribute: 'defending', direction: 'lower',
    means: [8.0, 7.6, 7.2, 6.9, 6.7, 6.5, 6.4, 6.3, 6.25, 6.20, 6.20],
    sds:   [0.5, 0.5, 0.4, 0.4, 0.3, 0.3, 0.3, 0.2, 0.2, 0.2, 0.2] },

  // ── PHY (Physicality) — 7 metrics ──
  { name: 'CMJ Jump Height', unit: 'cm', attribute: 'physicality', direction: 'higher',
    means: [22, 26, 30, 34, 37, 40, 42, 43, 43.5, 44, 44],
    sds:   [4, 4, 4, 4, 3.5, 3, 3, 3, 3, 3, 3] },
  { name: 'Yo-Yo IR1 Distance', unit: 'm', attribute: 'physicality', direction: 'higher',
    means: [800, 1000, 1200, 1500, 1800, 2000, 2200, 2350, 2400, 2440, 2450],
    sds:   [200, 200, 250, 250, 250, 200, 200, 150, 150, 150, 150] },
  { name: 'VO2max', unit: 'mL/kg/min', attribute: 'physicality', direction: 'higher',
    means: [46, 48, 50, 52, 54, 56, 58, 59, 59.5, 60, 60],
    sds:   [4, 4, 4, 3.5, 3, 3, 3, 3, 3, 3, 3] },
  { name: 'Total Match Distance', unit: 'm', attribute: 'physicality', direction: 'higher',
    means: [6500, 7500, 8200, 9000, 9500, 10000, 10500, 11000, 11200, 11400, 11500],
    sds:   [800, 800, 700, 700, 600, 600, 500, 500, 500, 500, 500] },
  { name: 'HRV RMSSD', unit: 'ms', attribute: 'physicality', direction: 'higher',
    means: [65, 70, 72, 75, 78, 80, 82, 83, 84, 85, 85],
    sds:   [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15] },
  { name: 'Sleep Duration', unit: 'hours', attribute: 'physicality', direction: 'higher',
    means: [9.0, 9.0, 8.8, 8.5, 8.3, 8.0, 7.8, 7.5, 7.5, 7.5, 7.5],
    sds:   [1.0, 1.0, 1.0, 0.8, 0.8, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7] },
  { name: 'Relative Squat Strength', unit: 'xBW', attribute: 'physicality', direction: 'higher',
    means: [0.80, 0.90, 1.00, 1.10, 1.20, 1.40, 1.50, 1.60, 1.65, 1.68, 1.70],
    sds:   [0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15] },
];

// ═══ LOOKUP FUNCTIONS ═══

export function getMetricNorm(metricName: string): MetricNorm | undefined {
  return FOOTBALL_NORMATIVE_DATA.find(n => n.name === metricName);
}

/**
 * Get the mean value for a metric at a given age.
 * @param metricName - Exact metric name from FOOTBALL_NORMATIVE_DATA
 * @param age - Player age (13-23, clamped)
 * @returns The mean value, or undefined if metric not found
 */
export function getMetricMeanForAge(metricName: string, age: number): number | undefined {
  const norm = getMetricNorm(metricName);
  if (!norm) return undefined;
  const idx = Math.min(Math.max(age - 13, 0), 10);
  return norm.means[idx];
}
