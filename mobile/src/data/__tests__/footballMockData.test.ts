/**
 * Tests for footballMockData.ts
 * Validates player profiles, skills, history, and normative data integrity.
 * Run: npx tsx src/data/__tests__/footballMockData.test.ts
 */

import {
  FOOTBALL_MOCK_PLAYERS,
  FOOTBALL_MOCK_SKILLS,
  FOOTBALL_MOCK_HISTORY,
  FOOTBALL_NORMATIVE_DATA,
  getMockPlayer,
  getMockPlayerSkills,
  getMockPlayerHistory,
  getMetricNorm,
  getMetricMeanForAge,
} from '../footballMockData';
import {
  FOOTBALL_ATTRIBUTE_ORDER,
  FOOTBALL_SKILL_ORDER,
  FOOTBALL_POSITION_WEIGHTS,
  FOOTBALL_RATING_LEVELS,
  FOOTBALL_SKILL_CONFIG,
} from '../../types/football';
import type { FootballAttribute, FootballSkill } from '../../types/football';

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

// ─── PLAYER COUNT & STRUCTURE ───────────────────────────────
console.log('\n--- Mock Players ---');
assertEq(FOOTBALL_MOCK_PLAYERS.length, 7, '7 mock players');

const playerIds = FOOTBALL_MOCK_PLAYERS.map(p => p.id);
assert(playerIds.includes('rising-striker'), 'Has rising-striker');
assert(playerIds.includes('creative-midfielder'), 'Has creative-midfielder');
assert(playerIds.includes('solid-centre-back'), 'Has solid-centre-back');
assert(playerIds.includes('explosive-winger'), 'Has explosive-winger');
assert(playerIds.includes('complete-goalkeeper'), 'Has complete-goalkeeper');
assert(playerIds.includes('versatile-fullback'), 'Has versatile-fullback');

// ─── PLAYER ATTRIBUTES ─────────────────────────────────────
console.log('--- Player Attributes ---');
for (const player of FOOTBALL_MOCK_PLAYERS) {
  for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
    const score = player.card.attributes[attr].score;
    assert(score >= 0 && score <= 99, `${player.id} ${attr} in 0-99 (${score})`);
    assert(player.card.attributes[attr].sourcesTotal === 7, `${player.id} ${attr} sourcesTotal = 7`);
    assert(
      player.card.attributes[attr].sourcesAvailable <= 7,
      `${player.id} ${attr} sourcesAvailable <= 7`,
    );
  }
}

// ─── OVERALL RATING VERIFICATION ────────────────────────────
console.log('--- Overall Rating Verification ---');
for (const player of FOOTBALL_MOCK_PLAYERS) {
  const weights = FOOTBALL_POSITION_WEIGHTS[player.position];
  let expected = 0;
  for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
    expected += player.card.attributes[attr].score * weights[attr];
  }
  expected = Math.round(expected);
  assertClose(
    player.card.overallRating,
    expected,
    `${player.id} overall ${player.card.overallRating} matches calc ${expected}`,
  );
}

// ─── RATING LEVEL CONSISTENCY ───────────────────────────────
console.log('--- Rating Level Consistency ---');
for (const player of FOOTBALL_MOCK_PLAYERS) {
  const rating = player.card.footballRating;
  const level = FOOTBALL_RATING_LEVELS.find(
    l => rating >= l.minRating && rating <= l.maxRating,
  );
  assert(level !== undefined, `${player.id} rating ${rating} has a level`);
  if (level) {
    assertEq(
      player.card.footballLevel,
      level.name,
      `${player.id} level "${player.card.footballLevel}" matches rating ${rating}`,
    );
  }
}

// ─── NEXT MILESTONE ─────────────────────────────────────────
console.log('--- Next Milestone ---');
for (const player of FOOTBALL_MOCK_PLAYERS) {
  const ms = player.card.nextMilestone;
  if (ms) {
    assert(ms.rating > player.card.footballRating, `${player.id} milestone rating > current`);
    assertEq(ms.pointsNeeded, ms.rating - player.card.footballRating, `${player.id} pointsNeeded correct`);
  }
}

// ─── CARD HISTORY ───────────────────────────────────────────
console.log('--- Card History ---');
for (const player of FOOTBALL_MOCK_PLAYERS) {
  const h = player.card.history;
  assert(h.length >= 3, `${player.id} card history >= 3 entries`);
  for (let i = 1; i < h.length; i++) {
    assert(h[i].date >= h[i - 1].date, `${player.id} card history dates ascending`);
  }
  // Last entry should match current
  const last = h[h.length - 1];
  assertEq(last.overall, player.card.overallRating, `${player.id} last history overall matches card`);
  assertEq(last.rating, player.card.footballRating, `${player.id} last history rating matches card`);
}

// ─── SKILLS DATA ────────────────────────────────────────────
console.log('--- Mock Skills ---');
for (const player of FOOTBALL_MOCK_PLAYERS) {
  const skills = FOOTBALL_MOCK_SKILLS[player.id];
  assert(skills !== undefined, `${player.id} has skills data`);
  if (!skills) continue;

  for (const skill of FOOTBALL_SKILL_ORDER) {
    const data = skills[skill];
    assert(data !== undefined, `${player.id} has ${skill}`);
    if (!data) continue;

    assert(data.rating >= 0 && data.rating <= 100, `${player.id} ${skill} rating 0-100`);
    assert(data.sessionsLogged >= 0, `${player.id} ${skill} sessions >= 0`);
    assert(data.history.length >= 1, `${player.id} ${skill} has history`);

    // Verify 3 sub-metrics with correct keys
    const expectedKeys = FOOTBALL_SKILL_CONFIG[skill].subMetrics.map(sm => sm.key);
    for (const key of expectedKeys) {
      assert(
        key in data.subMetrics,
        `${player.id} ${skill} has sub-metric "${key}"`,
      );
    }
    assertEq(
      Object.keys(data.subMetrics).length,
      3,
      `${player.id} ${skill} has exactly 3 sub-metrics`,
    );
  }
}

// ─── HISTORY DATA ───────────────────────────────────────────
console.log('--- Mock History ---');
for (const player of FOOTBALL_MOCK_PLAYERS) {
  const history = FOOTBALL_MOCK_HISTORY[player.id];
  assert(history !== undefined, `${player.id} has history data`);
  if (!history) continue;

  assert(history.length >= 4, `${player.id} history >= 4 entries (covers ~30 days)`);

  // Check dates ascending
  for (let i = 1; i < history.length; i++) {
    assert(history[i].date > history[i - 1].date, `${player.id} history dates ascending`);
  }

  // Check all entries have 6 attributes
  for (const entry of history) {
    for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
      assert(attr in entry.attributes, `${player.id} history has ${attr}`);
      const val = entry.attributes[attr];
      assert(val >= 0 && val <= 99, `${player.id} history ${attr} in 0-99`);
    }
    assert(entry.overall >= 0 && entry.overall <= 99, `${player.id} history overall in 0-99`);
    assert(entry.pathwayRating >= 0 && entry.pathwayRating <= 1000, `${player.id} history rating in 0-1000`);
  }

  // Last entry should match current card
  const last = history[history.length - 1];
  for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
    assertEq(
      last.attributes[attr],
      player.card.attributes[attr].score,
      `${player.id} last history ${attr} matches card`,
    );
  }
}

// ─── MONOTONICALLY-IMPROVING TRENDS ────────────────────────
console.log('--- Monotonic Improvement Trends ---');
for (const player of FOOTBALL_MOCK_PLAYERS) {
  const history = FOOTBALL_MOCK_HISTORY[player.id];
  if (!history || history.length < 2) continue;

  // Overall should be non-decreasing across snapshots
  let overallImproving = true;
  for (let i = 1; i < history.length; i++) {
    if (history[i].overall < history[i - 1].overall) {
      overallImproving = false;
      break;
    }
  }
  assert(overallImproving, `${player.id} history overall is non-decreasing`);

  // Pathway rating should be non-decreasing
  let ratingImproving = true;
  for (let i = 1; i < history.length; i++) {
    if (history[i].pathwayRating < history[i - 1].pathwayRating) {
      ratingImproving = false;
      break;
    }
  }
  assert(ratingImproving, `${player.id} history pathwayRating is non-decreasing`);

  // At least some attributes should show improvement (last > first)
  const firstEntry = history[0];
  const lastEntry = history[history.length - 1];
  let improvedCount = 0;
  for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
    if (lastEntry.attributes[attr] >= firstEntry.attributes[attr]) {
      improvedCount++;
    }
  }
  assert(improvedCount >= 4, `${player.id} at least 4 of 6 attributes improved or stable`);
}

// ─── NORMATIVE DATA ─────────────────────────────────────────
console.log('--- Normative Data ---');
assertEq(FOOTBALL_NORMATIVE_DATA.length, 42, '42 metric norms');

// 7 per attribute
for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
  const count = FOOTBALL_NORMATIVE_DATA.filter(n => n.attribute === attr).length;
  assertEq(count, 7, `${attr} has 7 metric norms`);
}

// Each norm has 11 entries (ages 13-23)
for (const norm of FOOTBALL_NORMATIVE_DATA) {
  assertEq(norm.means.length, 11, `${norm.name} has 11 means`);
  assertEq(norm.sds.length, 11, `${norm.name} has 11 sds`);
  assert(norm.unit.length > 0, `${norm.name} has unit`);
  assert(
    norm.direction === 'higher' || norm.direction === 'lower',
    `${norm.name} direction is valid`,
  );
  for (let i = 0; i < 11; i++) {
    assert(norm.sds[i] > 0, `${norm.name} sd[${i}] > 0`);
  }
}

// Verify improvement with age for representative metrics
const sprint30 = FOOTBALL_NORMATIVE_DATA.find(n => n.name === '30m Sprint')!;
assert(sprint30.means[0] > sprint30.means[10], '30m Sprint improves (lower) with age');

const shotPower = FOOTBALL_NORMATIVE_DATA.find(n => n.name === 'Shot Power')!;
assert(shotPower.means[0] < shotPower.means[10], 'Shot Power improves (higher) with age');

const yoyo = FOOTBALL_NORMATIVE_DATA.find(n => n.name === 'Yo-Yo IR1 Distance')!;
assert(yoyo.means[0] < yoyo.means[10], 'Yo-Yo IR1 improves with age');

const cmj = FOOTBALL_NORMATIVE_DATA.find(n => n.name === 'CMJ Jump Height')!;
assert(cmj.means[0] < cmj.means[10], 'CMJ improves with age');

// ─── GETTER FUNCTIONS ───────────────────────────────────────
console.log('--- Getter Functions ---');
assert(getMockPlayer('rising-striker') !== undefined, 'getMockPlayer finds rising-striker');
assert(getMockPlayer('nonexistent') === undefined, 'getMockPlayer returns undefined for unknown');

assert(getMockPlayerSkills('creative-midfielder') !== undefined, 'getMockPlayerSkills works');
assert(getMockPlayerHistory('solid-centre-back') !== undefined, 'getMockPlayerHistory works');

assert(getMetricNorm('30m Sprint') !== undefined, 'getMetricNorm finds 30m Sprint');
assert(getMetricNorm('Nonexistent') === undefined, 'getMetricNorm returns undefined for unknown');

// getMetricMeanForAge
const mean13 = getMetricMeanForAge('30m Sprint', 13);
const mean23 = getMetricMeanForAge('30m Sprint', 23);
assert(mean13 !== undefined && mean23 !== undefined, 'getMetricMeanForAge returns values');
assert(mean13! > mean23!, '30m Sprint mean at 13 > mean at 23 (improves)');

// Edge cases
assertEq(getMetricMeanForAge('30m Sprint', 10), sprint30.means[0], 'Age below 13 clamps to 13');
assertEq(getMetricMeanForAge('30m Sprint', 30), sprint30.means[10], 'Age above 23 clamps to 23');
assert(getMetricMeanForAge('Nonexistent', 15) === undefined, 'Unknown metric returns undefined');

// ─── PROFILE DIVERSITY ──────────────────────────────────────
console.log('--- Profile Diversity ---');
const positions = new Set(FOOTBALL_MOCK_PLAYERS.map(p => p.position));
assert(positions.size >= 5, 'At least 5 unique positions');

const ages = FOOTBALL_MOCK_PLAYERS.map(p => p.age);
assert(Math.min(...ages) <= 15, 'Has young player (<=15)');
assert(Math.max(...ages) >= 18, 'Has older player (>=18)');

const levels = new Set(FOOTBALL_MOCK_PLAYERS.map(p => p.card.footballLevel));
assert(levels.size >= 3, 'At least 3 unique levels');

// ═══ SUMMARY ════════════════════════════════════════════════
const total = passed + failed;
console.log(`\n${'═'.repeat(50)}`);
console.log(`footballMockData: ${passed}/${total} tests passed`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
