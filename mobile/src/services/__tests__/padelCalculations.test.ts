/**
 * Tests for padelCalculations.ts
 * Validates DNA formulas, shot ratings, tier boundaries, and padel rating pathway.
 */

import {
  calculateOverallRating,
  getDNATier,
  getTierLabel,
  calculateShotRating,
  rollingWeightedAverage,
  calculateShotVarietyIndex,
  calculatePadelRating,
  getPadelLevel,
  getRatingTier,
  getShotRatingColor,
  DNA_OVERALL_WEIGHTS,
} from '../padelCalculations';
import type { DNAAttribute, ShotType } from '../../types/padel';

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

function assertClose(a: number, b: number, label: string, tolerance = 1) {
  assert(Math.abs(a - b) <= tolerance, `${label} — got ${a}, expected ~${b}`);
}

// ═══ DNA OVERALL WEIGHTS ═══
console.log('\n--- DNA Overall Weights ---');

const weightSum = Object.values(DNA_OVERALL_WEIGHTS).reduce((a, b) => a + b, 0);
assertClose(weightSum, 1.0, 'Weights sum to 1.0', 0.001);
assert(DNA_OVERALL_WEIGHTS.control === 0.25, 'Control has highest weight (0.25)');
assert(DNA_OVERALL_WEIGHTS.reflexes === 0.18, 'Reflexes weight is 0.18');
assert(DNA_OVERALL_WEIGHTS.power === 0.15, 'Power weight is 0.15');
assert(DNA_OVERALL_WEIGHTS.stamina === 0.12, 'Stamina has lowest weight (0.12)');

// ═══ CALCULATE OVERALL RATING ═══
console.log('\n--- Calculate Overall Rating ---');

const allMax: Record<DNAAttribute, number> = {
  power: 99, reflexes: 99, control: 99, stamina: 99, agility: 99, tactics: 99,
};
assert(calculateOverallRating(allMax) === 99, 'All 99s → 99');

const allZero: Record<DNAAttribute, number> = {
  power: 0, reflexes: 0, control: 0, stamina: 0, agility: 0, tactics: 0,
};
assert(calculateOverallRating(allZero) === 0, 'All 0s → 0');

const demoAttrs: Record<DNAAttribute, number> = {
  power: 68, reflexes: 74, control: 61, stamina: 72, agility: 70, tactics: 55,
};
const demoOverall = calculateOverallRating(demoAttrs);
// 68*0.15 + 74*0.18 + 61*0.25 + 72*0.12 + 70*0.15 + 55*0.15
// = 10.2 + 13.32 + 15.25 + 8.64 + 10.5 + 8.25 = 66.16 → 66
assertClose(demoOverall, 66, 'Demo data overall = 66');

// ═══ DNA TIERS ═══
console.log('\n--- DNA Tiers ---');

assert(getDNATier(0) === 'bronze', 'Tier 0 → bronze');
assert(getDNATier(39) === 'bronze', 'Tier 39 → bronze');
assert(getDNATier(40) === 'silver', 'Tier 40 → silver');
assert(getDNATier(59) === 'silver', 'Tier 59 → silver');
assert(getDNATier(60) === 'gold', 'Tier 60 → gold');
assert(getDNATier(79) === 'gold', 'Tier 79 → gold');
assert(getDNATier(80) === 'diamond', 'Tier 80 → diamond');
assert(getDNATier(99) === 'diamond', 'Tier 99 → diamond');

assert(getTierLabel('bronze') === 'Bronze', 'Bronze label');
assert(getTierLabel('diamond') === 'Diamond', 'Diamond label');

// ═══ SHOT RATING CALCULATION ═══
console.log('\n--- Shot Rating ---');

assert(calculateShotRating(10, 10, 10) === 100, 'Max sub-metrics → 100');
assert(calculateShotRating(1, 1, 1) === 10, 'Min sub-metrics → 10');
assert(calculateShotRating(5, 5, 5) === 50, 'Mid sub-metrics → 50');
assert(calculateShotRating(7, 6, 8) === 70, '7+6+8=21 → 70');
assert(calculateShotRating(8, 7, 6) === 70, '8+7+6=21 → 70 (order independent)');

// ═══ ROLLING WEIGHTED AVERAGE ═══
console.log('\n--- Rolling Weighted Average ---');

assert(rollingWeightedAverage([], [], [50, 60]) === 55, 'No recent → all-time avg');
assert(rollingWeightedAverage([80], [], [50]) === 80, 'No medium → recent only');
const rwa = rollingWeightedAverage([70, 80], [60, 65], [50, 55]);
// recent avg=75, medium avg=62.5, all avg=52.5
// 75*0.5 + 62.5*0.3 + 52.5*0.2 = 37.5 + 18.75 + 10.5 = 66.75 → 67
assertClose(rwa, 67, 'Weighted average 50/30/20 split');

// ═══ SHOT VARIETY INDEX ═══
console.log('\n--- Shot Variety Index ---');

const allAbove50: Record<ShotType, { rating: number }> = {
  bandeja: { rating: 60 }, vibora: { rating: 55 }, smash: { rating: 70 },
  chiquita: { rating: 65 }, lob: { rating: 80 }, bajada: { rating: 51 },
  volley: { rating: 75 }, serve: { rating: 60 },
};
assert(calculateShotVarietyIndex(allAbove50) === 100, 'All >50 → 100%');

const halfAbove: Record<ShotType, { rating: number }> = {
  bandeja: { rating: 60 }, vibora: { rating: 55 }, smash: { rating: 70 },
  chiquita: { rating: 65 }, lob: { rating: 30 }, bajada: { rating: 20 },
  volley: { rating: 10 }, serve: { rating: 40 },
};
assert(calculateShotVarietyIndex(halfAbove) === 50, '4/8 >50 → 50%');

// ═══ PADEL RATING ═══
console.log('\n--- Padel Rating ---');

assert(calculatePadelRating(0, 0, 0, 0) === 0, 'All zeros → 0');
assert(calculatePadelRating(99, 10, 150, 100) === 1000, 'Max inputs → capped at 1000');

// Demo: DNA 66, 3 years exp, competition 80, streak 10
const demoRating = calculatePadelRating(66, 3, 80, 10);
// base = 66*7.5 = 495, exp = min(45, 100) = 45, comp = min(80, 150) = 80, cons = min(5, 8) = 5
// total = 495 + 45 + 80 + 5 = 625
assertClose(demoRating, 625, 'Demo padel rating ~625');

// ═══ PADEL LEVELS ═══
console.log('\n--- Padel Levels ---');

assert(getPadelLevel(0) === 'Newcomer', '0 → Newcomer');
assert(getPadelLevel(100) === 'Beginner', '100 → Beginner');
assert(getPadelLevel(300) === 'Intermediate', '300 → Intermediate');
assert(getPadelLevel(500) === 'Elite Amateur', '500 → Elite Amateur');
assert(getPadelLevel(612) === 'Semi-Pro', '612 → Semi-Pro');
assert(getPadelLevel(700) === 'Professional', '700 → Professional');
assert(getPadelLevel(900) === 'Legend', '900 → Legend');
assert(getPadelLevel(1000) === 'Legend', '1000 → Legend');

// ═══ RATING TIER ═══
console.log('\n--- Rating Tier ---');

assert(getRatingTier(100) === 0, '100 → tier 0');
assert(getRatingTier(300) === 1, '300 → tier 1');
assert(getRatingTier(500) === 2, '500 → tier 2');
assert(getRatingTier(700) === 3, '700 → tier 3');
assert(getRatingTier(900) === 4, '900 → tier 4');

// ═══ SHOT RATING COLOR ═══
console.log('\n--- Shot Rating Color ---');

assert(getShotRatingColor(80) === '#30D158', '80 → green');
assert(getShotRatingColor(55) === '#FFD60A', '55 → yellow');
assert(getShotRatingColor(40) === '#FF9500', '40 → orange');
assert(getShotRatingColor(20) === '#00D9FF', '20 → teal (growth)');

// ═══ SUMMARY ═══
console.log(`\n${'═'.repeat(50)}`);
console.log(`padelCalculations: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
