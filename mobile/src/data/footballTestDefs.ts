/**
 * Tomo Football Test Definitions
 * Central data-driven definitions for all 8 football physical tests.
 *
 * Each test definition describes its inputs, validation, derived metrics,
 * and normative data lookups. A single generic FootballTestInputScreen
 * renders the correct fields based on these definitions — no per-test
 * hardcoded screens.
 *
 * Research basis: Tomo Football Metrics Database, Sections 6.1-6.6.
 * All 8 tests map to the 42 metrics in the normative data table.
 */

import type { FootballAttribute } from '../types/football';
import { FOOTBALL_ATTRIBUTE_LABELS } from '../types/football';
import { FOOTBALL_SKILL_CONFIG, FOOTBALL_SKILL_ORDER } from '../types/football';
import type { FootballSkill } from '../types/football';
import { colors } from '../theme/colors';

// ═══ INTERFACES ═══

export interface InputFieldDef {
  key: string;
  label: string;
  unit: string;
  type: 'number' | 'select';
  required: boolean;
  placeholder: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
}

export interface DerivedMetricDef {
  key: string;
  label: string;
  unit: string;
  calculate: (inputs: Record<string, number | string>) => number | null;
  normMetricName?: string;
}

export interface FootballTestDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  attribute: FootballAttribute | FootballAttribute[];
  description: string;
  researchNote: string;
  inputs: InputFieldDef[];
  derivedMetrics: DerivedMetricDef[];
  primaryMetricName: string;
  primaryInputKey: string;
}

// ═══ NORMAL CDF ═══

/**
 * Standard normal CDF approximation (Abramowitz & Stegun).
 * Re-implemented here to avoid cross-module dependency.
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
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

// ═══ AGILITY METRIC RESOLVER ═══

const AGILITY_METRIC_MAP: Record<string, string> = {
  illinois: 'Illinois Agility Run',
  '5-0-5': '5-0-5 COD',
  ttest: 'T-Test Agility',
};

/**
 * Resolve the normative data metric name for an agility test type.
 * The agility test is dynamic — the user selects Illinois, 5-0-5, or T-Test.
 */
export function resolveAgilityMetricName(testType: string): string {
  return AGILITY_METRIC_MAP[testType] || 'Illinois Agility Run';
}

// ═══ 8 TEST DEFINITIONS ═══

export const FOOTBALL_TEST_DEFS: FootballTestDef[] = [
  // ── 1. Sprint Test ──
  {
    id: 'sprint',
    name: 'Sprint Test',
    icon: 'flash-outline',
    color: colors.info,
    attribute: 'pace',
    description: 'Measure your speed over 30 meters with optional splits.',
    researchNote: 'Sprint performance improves ~15% from U14 to senior (Radziminski et al., 2025). The 30m sprint is the standard benchmark for football acceleration.',
    inputs: [
      { key: 'time30m', label: '30m Time', unit: 's', type: 'number', required: true, placeholder: '4.20', min: 3.0, max: 8.0, step: 0.01 },
      { key: 'time5m', label: '5m Split', unit: 's', type: 'number', required: false, placeholder: '1.05', min: 0.7, max: 2.0, step: 0.01 },
      { key: 'time10m', label: '10m Split', unit: 's', type: 'number', required: false, placeholder: '1.80', min: 1.2, max: 3.0, step: 0.01 },
      { key: 'time40m', label: '40m Split', unit: 's', type: 'number', required: false, placeholder: '5.20', min: 4.0, max: 9.0, step: 0.01 },
    ],
    derivedMetrics: [
      {
        key: 'estMaxSpeed',
        label: 'Est. Max Speed',
        unit: 'km/h',
        calculate: (inputs) => {
          const t = Number(inputs.time30m);
          if (!t || t <= 0) return null;
          return Math.round((30 / t) * 3.6 * 10) / 10;
        },
        normMetricName: 'Max Sprint Speed',
      },
    ],
    primaryMetricName: '30m Sprint',
    primaryInputKey: 'time30m',
  },

  // ── 2. Jump Test ──
  {
    id: 'jump',
    name: 'Jump Test',
    icon: 'arrow-up-outline',
    color: colors.error,
    attribute: ['physicality', 'defending'],
    description: 'Countermovement jump height from flight time or direct measurement.',
    researchNote: 'CMJ increases ~50% from U14 to senior (Research Section 6.2). Jump height reflects lower-body power critical for aerial duels and acceleration.',
    inputs: [
      { key: 'cmjHeight', label: 'CMJ Height', unit: 'cm', type: 'number', required: false, placeholder: '38.0', min: 10, max: 80, step: 0.1 },
      { key: 'flightTime', label: 'Flight Time', unit: 'ms', type: 'number', required: false, placeholder: '520', min: 200, max: 900, step: 1 },
    ],
    derivedMetrics: [
      {
        key: 'heightFromFlight',
        label: 'Height from Flight',
        unit: 'cm',
        calculate: (inputs) => {
          const ft = Number(inputs.flightTime);
          if (!ft || ft <= 0) return null;
          const tSec = ft / 1000;
          return Math.round(((9.81 * tSec * tSec) / 8) * 100 * 10) / 10;
        },
      },
      {
        key: 'estPower',
        label: 'Est. Power',
        unit: 'W/kg',
        calculate: (inputs) => {
          const h = Number(inputs.cmjHeight) || (() => {
            const ft = Number(inputs.flightTime);
            if (!ft || ft <= 0) return 0;
            const tSec = ft / 1000;
            return ((9.81 * tSec * tSec) / 8) * 100;
          })();
          if (!h || h <= 0) return null;
          return Math.round(Math.sqrt(2 * 9.81 * (h / 100)) * 10) / 10;
        },
      },
    ],
    primaryMetricName: 'CMJ Jump Height',
    primaryInputKey: 'cmjHeight',
  },

  // ── 3. Endurance Test ──
  {
    id: 'endurance',
    name: 'Endurance Test',
    icon: 'fitness-outline',
    color: colors.error,
    attribute: 'physicality',
    description: 'Yo-Yo Intermittent Recovery Level 1 test distance.',
    researchNote: 'Yo-Yo IR1 doubles from U14 to senior (Research Section 6.4). VO2max is derived via Bangsbo formula: VO2max = d x 0.0084 + 36.4.',
    inputs: [
      { key: 'yoyoDistance', label: 'Yo-Yo Distance', unit: 'm', type: 'number', required: true, placeholder: '1800', min: 100, max: 3500, step: 10 },
    ],
    derivedMetrics: [
      {
        key: 'vo2max',
        label: 'VO2max',
        unit: 'mL/kg/min',
        calculate: (inputs) => {
          const d = Number(inputs.yoyoDistance);
          if (!d || d <= 0) return null;
          return Math.round((d * 0.0084 + 36.4) * 10) / 10;
        },
        normMetricName: 'VO2max',
      },
    ],
    primaryMetricName: 'Yo-Yo IR1 Distance',
    primaryInputKey: 'yoyoDistance',
  },

  // ── 4. Agility Test ──
  {
    id: 'agility',
    name: 'Agility Test',
    icon: 'git-branch-outline',
    color: colors.info,
    attribute: 'dribbling',
    description: 'Change of direction speed — choose Illinois, 5-0-5, or T-Test.',
    researchNote: 'Agility is neural and peaks earlier than power-based traits (Research Section 6.3). COD ability separates elite from sub-elite youth players.',
    inputs: [
      {
        key: 'agilityType', label: 'Test Type', unit: '', type: 'select', required: true, placeholder: '',
        options: [
          { label: 'Illinois', value: 'illinois' },
          { label: '5-0-5', value: '5-0-5' },
          { label: 'T-Test', value: 'ttest' },
        ],
      },
      { key: 'agilityTime', label: 'Time', unit: 's', type: 'number', required: true, placeholder: '15.0', min: 1.5, max: 25.0, step: 0.01 },
    ],
    derivedMetrics: [],
    primaryMetricName: 'Illinois Agility Run', // dynamic — resolved at runtime
    primaryInputKey: 'agilityTime',
  },

  // ── 5. Shooting Test ──
  {
    id: 'shooting',
    name: 'Shooting Test',
    icon: 'football-outline',
    color: colors.accent,
    attribute: 'shooting',
    description: 'Measure shot power with optional kick distance and non-dominant foot.',
    researchNote: 'Kick velocity increases with leg strength maturation. Shot power at professional level averages 100-115 km/h dominant foot.',
    inputs: [
      { key: 'shotPower', label: 'Shot Power', unit: 'km/h', type: 'number', required: true, placeholder: '92', min: 20, max: 160, step: 1 },
      { key: 'kickDistance', label: 'Kick Distance', unit: 'm', type: 'number', required: false, placeholder: '55', min: 10, max: 80, step: 1 },
      { key: 'weakFootSpeed', label: 'Non-Dominant Foot Speed', unit: 'km/h', type: 'number', required: false, placeholder: '68', min: 15, max: 140, step: 1 },
    ],
    derivedMetrics: [],
    primaryMetricName: 'Shot Power',
    primaryInputKey: 'shotPower',
  },

  // ── 6. Passing Test ──
  {
    id: 'passing',
    name: 'Passing Test',
    icon: 'navigate-outline',
    color: colors.accent,
    attribute: 'passing',
    description: 'Long pass distance and accuracy drill score.',
    researchNote: 'Pass distance follows the power maturation curve. Accuracy in structured drills distinguishes academy players from recreational.',
    inputs: [
      { key: 'longPassDist', label: 'Long Pass Distance', unit: 'm', type: 'number', required: true, placeholder: '45', min: 10, max: 80, step: 1 },
      { key: 'accuracy', label: 'Accuracy', unit: '/20', type: 'number', required: true, placeholder: '14', min: 0, max: 20, step: 1 },
      { key: 'passSpeed', label: 'Pass Speed', unit: 'km/h', type: 'number', required: false, placeholder: '76', min: 20, max: 120, step: 1 },
    ],
    derivedMetrics: [],
    primaryMetricName: 'Long Pass Distance',
    primaryInputKey: 'longPassDist',
  },

  // ── 7. Strength Test ──
  {
    id: 'strength',
    name: 'Strength Test',
    icon: 'barbell-outline',
    color: colors.info,
    attribute: ['defending', 'physicality'],
    description: 'Grip strength and relative squat strength for overall power.',
    researchNote: 'Strength peaks at 16-18 years (Sherwood, 2021). Grip strength correlates with upper body power needed for shielding and aerial duels.',
    inputs: [
      { key: 'gripStrength', label: 'Grip Strength', unit: 'kg', type: 'number', required: true, placeholder: '42', min: 10, max: 80, step: 0.5 },
      { key: 'squatBW', label: 'Squat (x Body Weight)', unit: 'xBW', type: 'number', required: true, placeholder: '1.40', min: 0.3, max: 3.0, step: 0.05 },
      { key: 'pushStrength', label: 'Push Strength', unit: 'kg', type: 'number', required: false, placeholder: '65', min: 15, max: 120, step: 1 },
    ],
    derivedMetrics: [],
    primaryMetricName: 'Grip Strength',
    primaryInputKey: 'gripStrength',
  },

  // ── 8. Skill Self-Assessment ──
  {
    id: 'selfAssessment',
    name: 'Skill Assessment',
    icon: 'star-outline',
    color: colors.warning,
    attribute: ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physicality'],
    description: 'Rate your 8 football skills across 24 sub-metrics (1-5 scale).',
    researchNote: 'Self-assessment builds self-awareness and metacognitive skills. Combined with physical tests, it gives a full player profile.',
    inputs: [], // Generated dynamically from FOOTBALL_SKILL_CONFIG
    derivedMetrics: [],
    primaryMetricName: '',
    primaryInputKey: '',
  },
];

// ═══ SELF-ASSESSMENT CONFIG ═══

export interface SelfAssessmentSlider {
  skillKey: FootballSkill;
  skillName: string;
  subKey: string;
  subLabel: string;
  unit: string;
}

/**
 * Generate the 24 sliders for the self-assessment test (8 skills x 3 sub-metrics).
 */
export function getSelfAssessmentSliders(): SelfAssessmentSlider[] {
  const sliders: SelfAssessmentSlider[] = [];
  for (const skillKey of FOOTBALL_SKILL_ORDER) {
    const cfg = FOOTBALL_SKILL_CONFIG[skillKey];
    for (const sub of cfg.subMetrics) {
      sliders.push({
        skillKey,
        skillName: cfg.name,
        subKey: sub.key,
        subLabel: sub.label,
        unit: sub.unit,
      });
    }
  }
  return sliders;
}

/**
 * Map 1-5 scale ratings to 0-99 range and compute average.
 * 1→10, 2→30, 3→50, 4→70, 5→90.
 */
const SCALE_MAP: Record<number, number> = { 1: 10, 2: 30, 3: 50, 4: 70, 5: 90 };

export function calculateSelfAssessmentRating(
  ratings: Record<string, number>,
): number {
  const values = Object.values(ratings);
  if (values.length === 0) return 0;
  const mapped = values.map(v => SCALE_MAP[v] ?? 50);
  const avg = mapped.reduce((a, b) => a + b, 0) / mapped.length;
  return Math.round(avg);
}

// ═══ HELPERS ═══

export function getFootballTestDef(id: string): FootballTestDef | undefined {
  return FOOTBALL_TEST_DEFS.find(t => t.id === id);
}

/**
 * Get the attribute label abbreviation (e.g., "PAC") for a test.
 * If the test covers multiple attributes, returns the first.
 */
export function getTestAttributeLabel(testDef: FootballTestDef): string {
  const attr = Array.isArray(testDef.attribute) ? testDef.attribute[0] : testDef.attribute;
  return FOOTBALL_ATTRIBUTE_LABELS[attr];
}

/**
 * Get the attribute color for a test.
 */
export function getTestAttributeColor(testDef: FootballTestDef): string {
  return testDef.color;
}
