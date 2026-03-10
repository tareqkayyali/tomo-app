/**
 * Tests for padelMockData.ts
 * Validates data structure integrity and demo data consistency.
 */

import {
  getDNACard,
  getShotRatings,
  getProMilestones,
  getShotDefinition,
  SPORT_OPTIONS,
  SHOT_DEFINITIONS,
  DEMO_PHYSICAL_METRICS,
} from '../padelMockData';
import { calculateOverallRating, getDNATier } from '../padelCalculations';
import { DNA_ATTRIBUTE_ORDER, SHOT_ORDER } from '../../types/padel';
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

// ═══ SPORT OPTIONS ═══
console.log('\n--- Sport Options ---');

assert(SPORT_OPTIONS.length === 4, '4 sport options');
assert(SPORT_OPTIONS[0].value === 'padel', 'Padel is first');
assert(SPORT_OPTIONS[0].available === true, 'Padel is available');
assert(SPORT_OPTIONS.filter(s => s.available).length === 1, 'Only padel is available');
assert(SPORT_OPTIONS.every(s => s.icon && s.label && s.color), 'All options have icon, label, color');

// ═══ SHOT DEFINITIONS ═══
console.log('\n--- Shot Definitions ---');

for (const shot of SHOT_ORDER) {
  const def = SHOT_DEFINITIONS[shot];
  assert(!!def, `${shot} definition exists`);
  assert(def.subMetrics.length === 3, `${shot} has 3 sub-metrics`);
  assert(!!def.name && !!def.category && !!def.description, `${shot} has name/category/desc`);
  assert(!!def.icon, `${shot} has icon`);
}

assert(getShotDefinition('bandeja')!.name === 'Bandeja', 'getShotDefinition returns correct shot');
assert(getShotDefinition('smash')!.category !== '', 'getShotDefinition has category');

// ═══ DNA CARD ═══
console.log('\n--- DNA Card Data ---');

const dna = getDNACard();
assert(dna.userId === 'osama-kayyali', 'userId is osama-kayyali');
assert(dna.overallRating >= 0 && dna.overallRating <= 99, 'Overall rating 0-99');

// Verify all 6 attributes exist
for (const attr of DNA_ATTRIBUTE_ORDER) {
  const data = dna.attributes[attr];
  assert(!!data, `${attr} exists`);
  assert(data.score >= 0 && data.score <= 99, `${attr} score in range`);
  assert(data.sources.length > 0, `${attr} has sources`);
  assert(data.sourcesAvailable <= data.sourcesTotal, `${attr} sources available <= total`);
}

// Verify overall matches calculation
const attrScores: Record<DNAAttribute, number> = {} as any;
for (const attr of DNA_ATTRIBUTE_ORDER) {
  attrScores[attr] = dna.attributes[attr].score;
}
const calculated = calculateOverallRating(attrScores);
assert(
  Math.abs(dna.overallRating - calculated) <= 1,
  `Overall ${dna.overallRating} matches calculated ${calculated}`,
);

// Verify tier matches
const expectedTier = getDNATier(dna.overallRating);
assert(dna.tier === expectedTier, `Tier ${dna.tier} matches calculated ${expectedTier}`);

// Verify padel rating range
assert(dna.padelRating >= 0 && dna.padelRating <= 1000, 'Padel rating 0-1000');
assert(!!dna.padelLevel, 'Padel level is set');

// Verify history exists
assert(dna.history.length > 0, 'History has entries');
assert(dna.history.every(h => h.date && h.overall >= 0 && h.rating >= 0), 'History entries valid');

// ═══ SHOT RATINGS ═══
console.log('\n--- Shot Ratings ---');

const shots = getShotRatings();
assert(shots.userId === 'osama-kayyali', 'Shot userId matches');

for (const shot of SHOT_ORDER) {
  const data = shots.shots[shot];
  assert(!!data, `${shot} shot data exists`);
  assert(data.rating >= 0 && data.rating <= 100, `${shot} rating 0-100`);
  assert(data.sessionsLogged >= 0, `${shot} sessions >= 0`);
  assert(!!data.lastUpdated, `${shot} has lastUpdated`);

  // Verify sub-metrics exist (3 per shot)
  const subKeys = Object.keys(data.subMetrics);
  assert(subKeys.length === 3, `${shot} has 3 sub-metric values`);
  for (const key of subKeys) {
    const val = data.subMetrics[key];
    assert(val >= 1 && val <= 10, `${shot}.${key} = ${val} is 1-10`);
  }
}

// Verify overall mastery is average of 8 shots
const shotAvg = SHOT_ORDER.reduce((sum, s) => sum + shots.shots[s].rating, 0) / 8;
assert(
  Math.abs(shots.overallShotMastery - Math.round(shotAvg)) <= 1,
  `Overall mastery ${shots.overallShotMastery} matches avg ${Math.round(shotAvg)}`,
);

// Variety index
assert(shots.shotVarietyIndex >= 0 && shots.shotVarietyIndex <= 100, 'Variety index 0-100');

// Strongest/weakest
assert(
  shots.shots[shots.strongestShot].rating >= shots.shots[shots.weakestShot].rating,
  'Strongest >= weakest',
);

// ═══ PRO MILESTONES ═══
console.log('\n--- Pro Milestones ---');

const menMilestones = getProMilestones('men');
const womenMilestones = getProMilestones('women');

assert(menMilestones.length > 0, 'Men milestones exist');
assert(womenMilestones.length > 0, 'Women milestones exist');
assert(menMilestones[0].rating === 1000, 'Top men milestone is 1000');
assert(womenMilestones[0].rating === 1000, 'Top women milestone is 1000');

// Sorted descending
for (let i = 1; i < menMilestones.length; i++) {
  assert(
    menMilestones[i].rating <= menMilestones[i - 1].rating,
    `Men milestones sorted descending at index ${i}`,
  );
}

// All have name and reason
assert(
  menMilestones.every(m => m.name && m.reason && m.gender === 'men'),
  'All men milestones valid',
);
assert(
  womenMilestones.every(m => m.name && m.reason && m.gender === 'women'),
  'All women milestones valid',
);

// ═══ PHYSICAL METRICS ═══
console.log('\n--- Physical Metrics ---');

assert(DEMO_PHYSICAL_METRICS.length > 0, 'Physical metrics exist');
assert(
  DEMO_PHYSICAL_METRICS.every(m => m.name && m.unit && m.dna && m.rating >= 0),
  'All physical metrics valid',
);

// ═══ SUMMARY ═══
console.log(`\n${'═'.repeat(50)}`);
console.log(`padelMockData: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
