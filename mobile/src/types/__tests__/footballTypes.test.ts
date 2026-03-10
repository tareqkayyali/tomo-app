/**
 * Tests for football.ts type definitions
 * Validates data integrity of all football constants.
 * Run: npx tsx src/types/__tests__/footballTypes.test.ts
 */

import {
  FOOTBALL_ATTRIBUTE_ORDER,
  FOOTBALL_ATTRIBUTE_LABELS,
  FOOTBALL_ATTRIBUTE_FULL_NAMES,
  FOOTBALL_ATTRIBUTE_CONFIG,
  FOOTBALL_SKILL_ORDER,
  FOOTBALL_SKILL_CONFIG,
  FOOTBALL_POSITION_WEIGHTS,
  FOOTBALL_POSITION_LABELS,
  FOOTBALL_RATING_LEVELS,
} from '../football';
import type { FootballAttribute, FootballPosition, FootballSkill } from '../football';

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
    console.error(`  FAIL: ${label} — got ${actual}, expected ${expected}`);
  }
}

// ─── ATTRIBUTES ─────────────────────────────────────────────
console.log('\n--- Attribute Order ---');
assertEq(FOOTBALL_ATTRIBUTE_ORDER.length, 6, 'FOOTBALL_ATTRIBUTE_ORDER has 6 entries');

console.log('--- Attribute Labels & Names ---');
for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
  assert(FOOTBALL_ATTRIBUTE_LABELS[attr].length === 3, `${attr} label is 3 chars`);
  assert(FOOTBALL_ATTRIBUTE_FULL_NAMES[attr].length > 0, `${attr} has full name`);
}

// ─── SUB-ATTRIBUTE COUNTS ───────────────────────────────────
console.log('--- Sub-Attribute Counts (7 each) ---');
for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
  const config = FOOTBALL_ATTRIBUTE_CONFIG[attr];
  assertEq(config.subAttributes.length, 7, `${attr} has 7 sub-attributes`);
}

// ─── SUB-ATTRIBUTE WEIGHT SUMS ──────────────────────────────
console.log('--- Sub-Attribute Weight Sums (1.0 each) ---');
for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
  const config = FOOTBALL_ATTRIBUTE_CONFIG[attr];
  const sum = config.subAttributes.reduce((s, sa) => s + sa.weight, 0);
  assert(
    Math.abs(sum - 1.0) < 0.001,
    `${attr} sub-attribute weights sum to 1.0 (got ${sum.toFixed(4)})`,
  );
}

// ─── ATTRIBUTE CONFIG FIELDS ────────────────────────────────
console.log('--- Attribute Config Fields ---');
for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
  const config = FOOTBALL_ATTRIBUTE_CONFIG[attr];
  assertEq(config.maxValue, 99, `${attr} maxValue is 99`);
  assert(config.color.startsWith('#'), `${attr} color is hex`);
  assert(config.description.length > 0, `${attr} has description`);
  assert(config.label === config.abbreviation, `${attr} label matches abbreviation`);
  for (const sa of config.subAttributes) {
    assert(sa.name.length > 0, `${attr}/${sa.name} has name`);
    assert(sa.unit.length > 0, `${attr}/${sa.name} has unit`);
    assert(sa.weight > 0 && sa.weight <= 1, `${attr}/${sa.name} weight in (0,1]`);
  }
}

// ─── SKILLS ─────────────────────────────────────────────────
console.log('--- Skill Order ---');
assertEq(FOOTBALL_SKILL_ORDER.length, 8, 'FOOTBALL_SKILL_ORDER has 8 entries');

console.log('--- Skill Sub-Metric Counts (3 each) ---');
for (const skill of FOOTBALL_SKILL_ORDER) {
  const config = FOOTBALL_SKILL_CONFIG[skill];
  assertEq(config.subMetrics.length, 3, `${skill} has 3 sub-metrics`);
  assert(config.name.length > 0, `${skill} has name`);
  assert(config.category.length > 0, `${skill} has category`);
  assert(config.icon.length > 0, `${skill} has icon`);
  assertEq(config.type, skill, `${skill} type matches key`);
  for (const sm of config.subMetrics) {
    assert(sm.key.length > 0, `${skill}/${sm.label} has key`);
    assert(sm.unit.length > 0, `${skill}/${sm.label} has unit`);
  }
}

// ─── POSITIONS ──────────────────────────────────────────────
console.log('--- Position Labels ---');
const positions: FootballPosition[] = ['GK', 'CB', 'FB', 'CM', 'CAM', 'WM', 'ST'];
for (const pos of positions) {
  assert(FOOTBALL_POSITION_LABELS[pos].length > 0, `${pos} has label`);
}

console.log('--- Position Weight Sums (1.0 each) ---');
for (const pos of positions) {
  const weights = FOOTBALL_POSITION_WEIGHTS[pos];
  const sum = FOOTBALL_ATTRIBUTE_ORDER.reduce((s, attr) => s + weights[attr], 0);
  assert(
    Math.abs(sum - 1.0) < 0.001,
    `${pos} position weights sum to 1.0 (got ${sum.toFixed(4)})`,
  );
}

// ─── RATING LEVELS ──────────────────────────────────────────
console.log('--- Rating Levels ---');
assertEq(FOOTBALL_RATING_LEVELS.length, 10, '10 rating levels');

console.log('--- Rating Level Coverage (0-1000, no gaps) ---');
assertEq(FOOTBALL_RATING_LEVELS[0].minRating, 0, 'First level starts at 0');
assertEq(
  FOOTBALL_RATING_LEVELS[FOOTBALL_RATING_LEVELS.length - 1].maxRating,
  1000,
  'Last level ends at 1000',
);

for (let i = 0; i < FOOTBALL_RATING_LEVELS.length - 1; i++) {
  const current = FOOTBALL_RATING_LEVELS[i];
  const next = FOOTBALL_RATING_LEVELS[i + 1];
  assertEq(
    current.maxRating + 1,
    next.minRating,
    `No gap between ${current.name} (${current.maxRating}) and ${next.name} (${next.minRating})`,
  );
}

for (const level of FOOTBALL_RATING_LEVELS) {
  assert(level.name.length > 0, `${level.name} has name`);
  assert(level.description.length > 0, `${level.name} has description`);
  assert(level.color.startsWith('#'), `${level.name} color is hex`);
  assert(level.minRating <= level.maxRating, `${level.name} min <= max`);
}

// ─── NO DUPLICATE VALUES ────────────────────────────────────
console.log('--- No Duplicate Values ---');

// Attribute order has no duplicates
const attrSet = new Set(FOOTBALL_ATTRIBUTE_ORDER);
assertEq(attrSet.size, FOOTBALL_ATTRIBUTE_ORDER.length, 'No duplicate attributes in FOOTBALL_ATTRIBUTE_ORDER');

// Skill order has no duplicates
const skillSet = new Set(FOOTBALL_SKILL_ORDER);
assertEq(skillSet.size, FOOTBALL_SKILL_ORDER.length, 'No duplicate skills in FOOTBALL_SKILL_ORDER');

// No duplicate label abbreviations
const labels = FOOTBALL_ATTRIBUTE_ORDER.map(a => FOOTBALL_ATTRIBUTE_LABELS[a]);
const labelSet = new Set(labels);
assertEq(labelSet.size, labels.length, 'No duplicate attribute labels');

// No duplicate position labels
const posLabels = positions.map(p => FOOTBALL_POSITION_LABELS[p]);
const posLabelSet = new Set(posLabels);
assertEq(posLabelSet.size, posLabels.length, 'No duplicate position labels');

// No duplicate rating level names
const levelNames = FOOTBALL_RATING_LEVELS.map(l => l.name);
const levelNameSet = new Set(levelNames);
assertEq(levelNameSet.size, levelNames.length, 'No duplicate rating level names');

// No duplicate sub-attribute names within each attribute
for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
  const config = FOOTBALL_ATTRIBUTE_CONFIG[attr];
  const subNames = config.subAttributes.map(sa => sa.name);
  const subNameSet = new Set(subNames);
  assertEq(subNameSet.size, subNames.length, `${attr} has no duplicate sub-attribute names`);
}

// No duplicate skill sub-metric keys within each skill
for (const skill of FOOTBALL_SKILL_ORDER) {
  const config = FOOTBALL_SKILL_CONFIG[skill];
  const smKeys = config.subMetrics.map(sm => sm.key);
  const smKeySet = new Set(smKeys);
  assertEq(smKeySet.size, smKeys.length, `${skill} has no duplicate sub-metric keys`);
}

// ═══ SUMMARY ════════════════════════════════════════════════
const total = passed + failed;
console.log(`\n${'═'.repeat(50)}`);
console.log(`footballTypes: ${passed}/${total} tests passed`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
