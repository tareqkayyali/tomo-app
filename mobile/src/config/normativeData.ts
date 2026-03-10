/**
 * Normative Data for Video Tests
 *
 * Hardcoded age/sport benchmarks for percentile ranking.
 * Sources: Youth athletic performance research (CMJ, sprint norms).
 *
 * Structure: { [testType]: { [ageGroup]: { p25, p50, p75, p90 } } }
 * - For "cm" tests (jump): higher is better
 * - For "s" tests (sprint): lower is better
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Percentiles {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

interface NormativeEntry {
  unit: string;
  lowerIsBetter: boolean;
  ageGroups: Record<string, Percentiles>;
}

// ---------------------------------------------------------------------------
// Normative tables
// ---------------------------------------------------------------------------

const NORMATIVE_DATA: Record<string, NormativeEntry> = {
  cmj: {
    unit: 'cm',
    lowerIsBetter: false,
    ageGroups: {
      '13-15': { p25: 25, p50: 32, p75: 38, p90: 44 },
      '16-18': { p25: 32, p50: 40, p75: 48, p90: 55 },
      '19-23': { p25: 36, p50: 44, p75: 52, p90: 60 },
    },
  },
  sprint_10m: {
    unit: 's',
    lowerIsBetter: true,
    ageGroups: {
      '13-15': { p25: 2.1, p50: 1.95, p75: 1.82, p90: 1.72 },
      '16-18': { p25: 1.95, p50: 1.82, p75: 1.70, p90: 1.62 },
      '19-23': { p25: 1.85, p50: 1.75, p75: 1.65, p90: 1.55 },
    },
  },
  sprint_20m: {
    unit: 's',
    lowerIsBetter: true,
    ageGroups: {
      '13-15': { p25: 3.8, p50: 3.5, p75: 3.25, p90: 3.05 },
      '16-18': { p25: 3.5, p50: 3.2, p75: 2.95, p90: 2.80 },
      '19-23': { p25: 3.3, p50: 3.0, p75: 2.80, p90: 2.65 },
    },
  },
  shuttle: {
    unit: 's',
    lowerIsBetter: true,
    ageGroups: {
      '13-15': { p25: 14.0, p50: 12.5, p75: 11.2, p90: 10.2 },
      '16-18': { p25: 12.5, p50: 11.0, p75: 10.0, p90: 9.2 },
      '19-23': { p25: 11.5, p50: 10.2, p75: 9.3, p90: 8.5 },
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the age group key for a given age.
 */
function getAgeGroup(age: number): string {
  if (age <= 15) return '13-15';
  if (age <= 18) return '16-18';
  return '19-23';
}

/**
 * Map a testId to its normative data key.
 */
function getNormativeKey(testId: string): string {
  const id = testId.toLowerCase();
  if (id.includes('cmj') || id.includes('jump')) return 'cmj';
  if (id.includes('20m')) return 'sprint_20m';
  if (id.includes('10m')) return 'sprint_10m';
  if (id.includes('shuttle') || id.includes('505') || id.includes('agility') || id.includes('tap')) return 'shuttle';
  // Default to sprint_10m for unknown tests
  return 'sprint_10m';
}

/**
 * Compute the percentile ranking for a test score.
 *
 * @param testId - Test ID (e.g., "football-cmj")
 * @param score  - The athlete's score
 * @param age    - Athlete's age (13-23)
 * @returns { percentile: number (0-100), label: string }
 */
export function getPercentile(
  testId: string,
  score: number,
  age: number,
): { percentile: number; label: string } {
  const key = getNormativeKey(testId);
  const norms = NORMATIVE_DATA[key];

  if (!norms) {
    return { percentile: 50, label: 'Average for your age group' };
  }

  const ageGroup = getAgeGroup(age);
  const brackets = norms.ageGroups[ageGroup];

  if (!brackets) {
    return { percentile: 50, label: 'Average for your age group' };
  }

  let percentile: number;

  if (norms.lowerIsBetter) {
    // Lower score = better (sprint time)
    if (score <= brackets.p90) percentile = 95;
    else if (score <= brackets.p75) percentile = 82;
    else if (score <= brackets.p50) percentile = 62;
    else if (score <= brackets.p25) percentile = 37;
    else percentile = 15;
  } else {
    // Higher score = better (jump height)
    if (score >= brackets.p90) percentile = 95;
    else if (score >= brackets.p75) percentile = 82;
    else if (score >= brackets.p50) percentile = 62;
    else if (score >= brackets.p25) percentile = 37;
    else percentile = 15;
  }

  const label = `Top ${100 - percentile}% for your age group`;
  return { percentile, label };
}

/**
 * Compute comparison badge info between current and previous score.
 *
 * @param score     - Current score
 * @param unit      - "cm" or "s"
 * @param prevScore - Previous score (null if first test)
 * @param isPB      - Whether this is a personal best
 * @returns { type, label, color }
 */
export function getComparisonBadge(
  score: number,
  unit: string,
  prevScore: number | null,
  isPB: boolean,
): { type: 'pb' | 'baseline' | 'improvement' | 'decline'; label: string } {
  if (isPB && prevScore !== null) {
    return { type: 'pb', label: 'Personal Best!' };
  }

  if (prevScore === null) {
    return { type: 'baseline', label: 'Baseline' };
  }

  const lowerIsBetter = unit === 's';
  let pctChange: number;

  if (lowerIsBetter) {
    // For time: improvement means lower score
    pctChange = ((prevScore - score) / prevScore) * 100;
  } else {
    // For distance: improvement means higher score
    pctChange = ((score - prevScore) / prevScore) * 100;
  }

  const rounded = Math.round(Math.abs(pctChange));

  if (pctChange > 0) {
    return { type: 'improvement', label: `+${rounded}% Improvement` };
  }
  return { type: 'decline', label: `${rounded}% Slower` };
}
