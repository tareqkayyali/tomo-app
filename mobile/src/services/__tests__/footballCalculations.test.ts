/**
 * Tests for footballCalculations.ts
 * Validates attribute formulas, overall rating, pathway rating,
 * skill rating, percentile, and readiness recommendation logic.
 *
 * Run: npx tsx src/services/__tests__/footballCalculations.test.ts
 */

import {
  calculateFootballAttribute,
  calculateOverallRating,
  calculatePathwayRating,
  getFootballRatingLevel,
  calculateSkillRating,
  getAttributePercentile,
  getReadinessRecommendation,
  FOOTBALL_NORMATIVE_DATA,
  FOOTBALL_ATTRIBUTE_COLORS,
} from '../footballCalculations';
import {
  FOOTBALL_ATTRIBUTE_ORDER,
  FOOTBALL_ATTRIBUTE_CONFIG,
  FOOTBALL_POSITION_WEIGHTS,
} from '../../types/football';
import type { FootballAttribute, FootballPosition } from '../../types/football';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function assertEq<T>(actual: T, expected: T, label: string) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

function assertClose(actual: number, expected: number, label: string, tolerance = 1) {
  if (Math.abs(actual - expected) <= tolerance) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label} — got ${actual}, expected ~${expected} (tol ${tolerance})`);
  }
}

// ─── calculateFootballAttribute ─────────────────────────────
console.log('\n--- calculateFootballAttribute ---');

// All 99s → 99
const all99 = [99, 99, 99, 99, 99, 99, 99];
assertEq(calculateFootballAttribute('pace', all99), 99, 'All 99s → 99');

// All 0s → 0
const all0 = [0, 0, 0, 0, 0, 0, 0];
assertEq(calculateFootballAttribute('pace', all0), 0, 'All 0s → 0');

// PAC weighted average: weights are [0.15, 0.15, 0.20, 0.20, 0.10, 0.10, 0.10]
// Scores: [80, 70, 85, 90, 75, 65, 60]
// = 80*0.15 + 70*0.15 + 85*0.20 + 90*0.20 + 75*0.10 + 65*0.10 + 60*0.10
// = 12 + 10.5 + 17 + 18 + 7.5 + 6.5 + 6 = 77.5 → 78
const pacScores = [80, 70, 85, 90, 75, 65, 60];
assertClose(calculateFootballAttribute('pace', pacScores), 78, 'PAC weighted avg = 78');

// SHO weighted average: weights are [0.25, 0.20, 0.15, 0.10, 0.15, 0.05, 0.10]
// Scores: [60, 50, 40, 55, 70, 30, 45]
// = 60*0.25 + 50*0.20 + 40*0.15 + 55*0.10 + 70*0.15 + 30*0.05 + 45*0.10
// = 15 + 10 + 6 + 5.5 + 10.5 + 1.5 + 4.5 = 53 → 53
const shoScores = [60, 50, 40, 55, 70, 30, 45];
assertClose(calculateFootballAttribute('shooting', shoScores), 53, 'SHO weighted avg = 53');

// Uniform 50s → 50
const all50 = [50, 50, 50, 50, 50, 50, 50];
assertEq(calculateFootballAttribute('dribbling', all50), 50, 'Uniform 50 → 50');

// Missing sub-attributes treated as 0
const partial = [80, 70];
const partialResult = calculateFootballAttribute('pace', partial);
// 80*0.15 + 70*0.15 + 0*... = 12 + 10.5 = 22.5 → 23
assertClose(partialResult, 23, 'Missing subs → treated as 0');

// Clamping: values above 99 should still work (weighted avg won't exceed input max)
assertEq(calculateFootballAttribute('pace', [99, 99, 99, 99, 99, 99, 99]), 99, 'Max clamped at 99');

// Specific PAC test: [72, 68, 65, 70, 67, 64, 66] → 68
// = 72*0.15 + 68*0.15 + 65*0.20 + 70*0.20 + 67*0.10 + 64*0.10 + 66*0.10
// = 10.8 + 10.2 + 13.0 + 14.0 + 6.7 + 6.4 + 6.6 = 67.7 → 68
const specificPac = [72, 68, 65, 70, 67, 64, 66];
assertEq(calculateFootballAttribute('pace', specificPac), 68, 'PAC [72,68,65,70,67,64,66] → 68');

// Verify each attribute works with its own weights
for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
  const result = calculateFootballAttribute(attr, all50);
  assertEq(result, 50, `${attr} uniform 50 → 50`);
}

// ─── calculateOverallRating ─────────────────────────────────
console.log('\n--- calculateOverallRating ---');

const allMax: Record<FootballAttribute, number> = {
  pace: 99, shooting: 99, passing: 99, dribbling: 99, defending: 99, physicality: 99,
};
assertEq(calculateOverallRating(allMax, 'ST'), 99, 'All 99s any position → 99');

const allZero: Record<FootballAttribute, number> = {
  pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physicality: 0,
};
assertEq(calculateOverallRating(allZero, 'CB'), 0, 'All 0s → 0');

// ST weights: pace 0.15, shooting 0.25, passing 0.10, dribbling 0.20, defending 0.05, physicality 0.25
const demoAttrs: Record<FootballAttribute, number> = {
  pace: 75, shooting: 80, passing: 60, dribbling: 70, defending: 40, physicality: 65,
};
// ST: 75*0.15 + 80*0.25 + 60*0.10 + 70*0.20 + 40*0.05 + 65*0.25
//   = 11.25 + 20 + 6 + 14 + 2 + 16.25 = 69.5 → 70
assertClose(calculateOverallRating(demoAttrs, 'ST'), 70, 'ST demo → 70');

// CB: 75*0.10 + 80*0.05 + 60*0.10 + 70*0.05 + 40*0.35 + 65*0.35
//   = 7.5 + 4 + 6 + 3.5 + 14 + 22.75 = 57.75 → 58
assertClose(calculateOverallRating(demoAttrs, 'CB'), 58, 'CB demo → 58');

// Same player, different positions should give different ratings
const stRating = calculateOverallRating(demoAttrs, 'ST');
const cbRating = calculateOverallRating(demoAttrs, 'CB');
assert(stRating !== cbRating, 'ST rating differs from CB rating for same attributes');

// ST with high SHO > ST with high DEF
const stHighSho: Record<FootballAttribute, number> = {
  pace: 50, shooting: 80, passing: 50, dribbling: 50, defending: 50, physicality: 50,
};
const stHighDef: Record<FootballAttribute, number> = {
  pace: 50, shooting: 50, passing: 50, dribbling: 50, defending: 80, physicality: 50,
};
assert(
  calculateOverallRating(stHighSho, 'ST') > calculateOverallRating(stHighDef, 'ST'),
  'ST with high SHO > ST with high DEF',
);

// CB with high DEF > CB with high SHO
const cbHighDef: Record<FootballAttribute, number> = {
  pace: 50, shooting: 50, passing: 50, dribbling: 50, defending: 80, physicality: 50,
};
const cbHighSho: Record<FootballAttribute, number> = {
  pace: 50, shooting: 80, passing: 50, dribbling: 50, defending: 50, physicality: 50,
};
assert(
  calculateOverallRating(cbHighDef, 'CB') > calculateOverallRating(cbHighSho, 'CB'),
  'CB with high DEF > CB with high SHO',
);

// Position weight sums verified (should all sum to 1.0)
const positions: FootballPosition[] = ['GK', 'CB', 'FB', 'CM', 'CAM', 'WM', 'ST'];
for (const pos of positions) {
  const weights = FOOTBALL_POSITION_WEIGHTS[pos];
  const sum = FOOTBALL_ATTRIBUTE_ORDER.reduce((s, a) => s + weights[a], 0);
  assert(Math.abs(sum - 1.0) < 0.001, `${pos} position weights sum to 1.0`);
}

// ─── calculatePathwayRating ─────────────────────────────────
console.log('\n--- calculatePathwayRating ---');

// Basic: overall 50, age 20, intermediate, club
// base = 500, ageMod = 5, expMod = 0, compMod = 10 → 515
assertClose(
  calculatePathwayRating(50, 20, 'intermediate', 'club'),
  515,
  'Rating 50, age 20, intermediate, club → 515',
);

// OVR 50, age 15, intermediate, club → mid-range
// base = 500, ageMod = 25 (age<16), expMod = 0, compMod = 10 → 535
const midRange = calculatePathwayRating(50, 15, 'intermediate', 'club');
assertClose(midRange, 535, 'OVR 50, age 15, intermediate, club → 535');
assert(midRange >= 450 && midRange <= 549, 'OVR 50, age 15, int, club is Sunday League range');

// Minimum: overall 0
assertEq(calculatePathwayRating(0, 25, 'beginner', 'recreational'), 0, 'Overall 0 with negative exp mod → clamped to 0');
// 0*10 + 0 + (-20) + 0 = -20 → clamped to 0

// Maximum: overall 99, young elite professional
// base=990, ageMod=25, expMod=25, compMod=40 → 1080 → 1000
assertEq(calculatePathwayRating(99, 15, 'elite', 'professional'), 1000, 'Max inputs → clamped to 1000');

// Age adjustment: younger = higher
const young = calculatePathwayRating(70, 14, 'intermediate', 'club');
const senior = calculatePathwayRating(70, 25, 'intermediate', 'club');
// young: 700 + 25 + 0 + 10 = 735
// senior: 700 + 0 + 0 + 10 = 710
assert(young > senior, 'Younger player gets higher pathway rating');
assertClose(young, 735, 'Young (14) pathway = 735');
assertClose(senior, 710, 'Senior (25) pathway = 710');

// Experience matters
const beginner = calculatePathwayRating(60, 18, 'beginner', 'club');
const elite = calculatePathwayRating(60, 18, 'elite', 'club');
assert(elite > beginner, 'Elite experience > beginner experience');

// Competition matters
const rec = calculatePathwayRating(60, 20, 'intermediate', 'recreational');
const pro = calculatePathwayRating(60, 20, 'intermediate', 'professional');
assert(pro > rec, 'Professional competition > recreational');

// ─── getFootballRatingLevel ─────────────────────────────────
console.log('\n--- getFootballRatingLevel ---');

assertEq(getFootballRatingLevel(0).name, 'Newcomer', '0 → Newcomer');
assertEq(getFootballRatingLevel(199).name, 'Newcomer', '199 → Newcomer');
assertEq(getFootballRatingLevel(200).name, 'Beginner', '200 → Beginner');
assertEq(getFootballRatingLevel(349).name, 'Beginner', '349 → Beginner');
assertEq(getFootballRatingLevel(350).name, 'Park Player', '350 → Park Player');
assertEq(getFootballRatingLevel(450).name, 'Sunday League', '450 → Sunday League');
assertEq(getFootballRatingLevel(550).name, 'Club Player', '550 → Club Player');
assertEq(getFootballRatingLevel(650).name, 'Academy Elite', '650 → Academy Elite');
assertEq(getFootballRatingLevel(750).name, 'Semi-Pro', '750 → Semi-Pro');
assertEq(getFootballRatingLevel(850).name, 'Professional', '850 → Professional');
assertEq(getFootballRatingLevel(929).name, 'Professional', '929 → Professional (boundary)');
assertEq(getFootballRatingLevel(930).name, 'World Class', '930 → World Class');
assertEq(getFootballRatingLevel(979).name, 'World Class', '979 → World Class (boundary)');
assertEq(getFootballRatingLevel(980).name, 'Legend', '980 → Legend');
assertEq(getFootballRatingLevel(999).name, 'Legend', '999 → Legend');
assertEq(getFootballRatingLevel(1000).name, 'Legend', '1000 → Legend');

// Level object has all fields
const level = getFootballRatingLevel(500);
assert(level.name.length > 0, 'Level has name');
assert(level.description.length > 0, 'Level has description');
assert(level.color.startsWith('#'), 'Level has color');
assert(level.minRating <= 500 && level.maxRating >= 500, 'Level range contains 500');

// ─── calculateSkillRating ───────────────────────────────────
console.log('\n--- calculateSkillRating ---');

assertEq(calculateSkillRating([99, 99, 99]), 99, 'All max → 99');
assertEq(calculateSkillRating([0, 0, 0]), 0, 'All zero → 0');
assertEq(calculateSkillRating([60, 70, 80]), 70, '[60,70,80] → 70');
assertEq(calculateSkillRating([50, 50, 50]), 50, 'Uniform 50 → 50');
assertEq(calculateSkillRating([33, 33, 34]), 33, '[33,33,34] → 33 (rounds)');
assertEq(calculateSkillRating([]), 0, 'Empty → 0');

// Clamping
assertEq(calculateSkillRating([99, 99, 99]), 99, 'Max clamped at 99');

// ─── getAttributePercentile ─────────────────────────────────
console.log('\n--- getAttributePercentile ---');

// A 14-year-old with PAC score at the age-group mean → ~50th percentile
const p50young = getAttributePercentile('pace', 35, 14, 'CM');
assertClose(p50young, 50, 'Score at U14 PAC mean → ~50th percentile', 2);

// A 14-year-old with PAC score well above mean → high percentile
const pHigh = getAttributePercentile('pace', 60, 14, 'CM');
assert(pHigh > 90, 'Score 60 for U14 PAC → >90th percentile');

// A senior with score at their mean → ~50th percentile
const p50senior = getAttributePercentile('pace', 55, 25, 'CM');
assertClose(p50senior, 50, 'Score at senior PAC mean → ~50th percentile', 2);

// Score 0 → low percentile
const pLow = getAttributePercentile('pace', 0, 20, 'CM');
assert(pLow < 5, 'Score 0 → very low percentile');

// Score 99 → high percentile
const pMax = getAttributePercentile('pace', 99, 20, 'CM');
assert(pMax > 95, 'Score 99 → very high percentile');

// Younger player with same score should have higher percentile
const youngPerc = getAttributePercentile('shooting', 50, 14, 'ST');
const seniorPerc = getAttributePercentile('shooting', 50, 25, 'ST');
assert(youngPerc > seniorPerc, 'Same score: younger gets higher percentile');

// All attributes return valid percentiles
for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
  const p = getAttributePercentile(attr, 50, 17, 'CM');
  assert(p >= 0 && p <= 100, `${attr} percentile is 0-100`);
}

// ─── getReadinessRecommendation ─────────────────────────────
console.log('\n--- getReadinessRecommendation ---');

// 1. Pain → ALWAYS rest (non-negotiable)
const painRest = getReadinessRecommendation('GREEN', 0, true, 3);
assertEq(painRest.intensity, 'rest', 'Pain + GREEN → rest');
assert(painRest.researchBasis.length > 0, 'Pain rest has research basis');

const painGreen = getReadinessRecommendation('GREEN', 2, true, 0);
assertEq(painGreen.intensity, 'rest', 'Pain always → rest regardless of other signals');

// 2. 6+ days without rest → rest
const overtrainRest = getReadinessRecommendation('GREEN', 6, false, 3);
assertEq(overtrainRest.intensity, 'rest', '6 days no rest → rest');

const overtrainRest7 = getReadinessRecommendation('GREEN', 7, false, 0);
assertEq(overtrainRest7.intensity, 'rest', '7 days no rest → rest');

// 3. RED → rest
const redRest = getReadinessRecommendation('RED', 2, false, 3);
assertEq(redRest.intensity, 'rest', 'RED → rest');

// 4. YELLOW → light
const yellowLight = getReadinessRecommendation('YELLOW', 2, false, 3);
assertEq(yellowLight.intensity, 'light', 'YELLOW → light');

// YELLOW + high effort → still light (YELLOW checked before effort)
const yellowHighEffort = getReadinessRecommendation('YELLOW', 2, false, 9);
assertEq(yellowHighEffort.intensity, 'light', 'YELLOW + effort 9 → light');

// 5. High effort yesterday → light
const highEffortLight = getReadinessRecommendation('GREEN', 2, false, 8);
assertEq(highEffortLight.intensity, 'light', 'GREEN + effort 8 → light');

const veryHighEffort = getReadinessRecommendation('GREEN', 2, false, 10);
assertEq(veryHighEffort.intensity, 'light', 'GREEN + effort 10 → light');

// 6. GREEN + moderate yesterday → moderate
const moderateDay = getReadinessRecommendation('GREEN', 2, false, 5);
assertEq(moderateDay.intensity, 'moderate', 'GREEN + effort 5 → moderate');

const moderate7 = getReadinessRecommendation('GREEN', 2, false, 7);
assertEq(moderate7.intensity, 'moderate', 'GREEN + effort 7 → moderate');

// 7. GREEN + easy yesterday → hard
const easyDay = getReadinessRecommendation('GREEN', 2, false, 3);
assertEq(easyDay.intensity, 'hard', 'GREEN + effort 3 → hard');

const restDay = getReadinessRecommendation('GREEN', 0, false, 0);
assertEq(restDay.intensity, 'hard', 'GREEN + effort 0 → hard');

// Priority order: pain beats everything
const painPriority = getReadinessRecommendation('GREEN', 0, true, 0);
assertEq(painPriority.intensity, 'rest', 'Pain beats all other signals');

// Priority order: days > RED
const daysVsRed = getReadinessRecommendation('RED', 6, false, 0);
assertEq(daysVsRed.intensity, 'rest', 'Both days>=6 and RED → rest');

// All recommendations have research basis
const allColors: Array<'GREEN' | 'YELLOW' | 'RED'> = ['GREEN', 'YELLOW', 'RED'];
for (const color of allColors) {
  const rec = getReadinessRecommendation(color, 2, false, 5);
  assert(rec.researchBasis.length > 0, `${color} recommendation has research basis`);
  assert(rec.description.length > 0, `${color} recommendation has description`);
}

// ─── NORMATIVE DATA STRUCTURE ───────────────────────────────
console.log('\n--- Normative Data ---');

for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
  const norms = FOOTBALL_NORMATIVE_DATA[attr];
  assert(norms.length > 0, `${attr} has normative data`);
  for (const norm of norms) {
    assert(norm.mean >= 0 && norm.mean <= 99, `${attr} mean in 0-99`);
    assert(norm.sd > 0, `${attr} sd > 0`);
    assert(norm.ageMin <= norm.ageMax, `${attr} ageMin <= ageMax`);
  }
}

// ─── ATTRIBUTE COLORS ───────────────────────────────────────
console.log('\n--- Attribute Colors ---');

for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
  assert(FOOTBALL_ATTRIBUTE_COLORS[attr].startsWith('#'), `${attr} color is hex`);
}

// ═══ SUMMARY ════════════════════════════════════════════════
const total = passed + failed;
console.log(`\n${'═'.repeat(50)}`);
console.log(`footballCalculations: ${passed}/${total} tests passed`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
