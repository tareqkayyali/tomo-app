/**
 * Football Progress Calculator
 *
 * Pure functions that transform raw football_test_results into the
 * FootballCardData shape expected by FootballProgressContent.
 *
 * No React, no side effects — just math.
 */

import type {
  FootballAttribute,
  FootballPosition,
  FootballCardData,
  FootballAttributeData,
} from '../types/football';
import {
  FOOTBALL_ATTRIBUTE_ORDER,
  FOOTBALL_RATING_LEVELS,
} from '../types/football';
import {
  calculateOverallRating,
  calculatePathwayRating,
  getFootballRatingLevel,
} from './footballCalculations';
import type { FootballTestResult } from '../types/footballTests';
import type { FootballHistoryEntry } from '../types/football';

// ═══ TEST → ATTRIBUTE MAPPING ═══

const TEST_ATTRIBUTE_MAP: Record<string, FootballAttribute[]> = {
  sprint: ['pace'],
  jump: ['physicality', 'defending'],
  endurance: ['physicality'],
  agility: ['dribbling'],
  shooting: ['shooting'],
  passing: ['passing'],
  strength: ['defending', 'physicality'],
  selfAssessment: ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physicality'],
};

const TEST_LABEL_MAP: Record<string, string> = {
  sprint: 'Sprint Test',
  jump: 'Jump Test',
  endurance: 'Endurance Test',
  agility: 'Agility Test',
  shooting: 'Shooting Test',
  passing: 'Passing Test',
  strength: 'Strength Test',
  selfAssessment: 'Skill Assessment',
};

// ═══ MAIN COMPUTATION ═══

/**
 * Compute a FootballCardData from raw test results.
 * Uses the stored percentile (0-100) from each test result as the attribute score source.
 */
export function computeFootballCard(
  results: FootballTestResult[],
  userId: string,
  age: number,
  position: FootballPosition,
): FootballCardData {
  // 1. Group results by test_type, sorted newest first
  const byType = new Map<string, FootballTestResult[]>();
  for (const r of results) {
    const existing = byType.get(r.testType) || [];
    existing.push(r);
    byType.set(r.testType, existing);
  }

  // Sort each group by createdAt desc
  for (const [, group] of byType) {
    group.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // 2. Compute attribute scores
  const attrPercentiles: Record<FootballAttribute, number[]> = {
    pace: [], shooting: [], passing: [], dribbling: [], defending: [], physicality: [],
  };
  const attrSources: Record<FootballAttribute, string[]> = {
    pace: [], shooting: [], passing: [], dribbling: [], defending: [], physicality: [],
  };

  for (const [testType, group] of byType) {
    const attrs = TEST_ATTRIBUTE_MAP[testType];
    if (!attrs) continue;

    const latest = group[0];
    const pct = latest.percentile ?? 0;

    for (const attr of attrs) {
      attrPercentiles[attr].push(pct);
      const label = TEST_LABEL_MAP[testType] || testType;
      if (!attrSources[attr].includes(label)) {
        attrSources[attr].push(label);
      }
    }
  }

  // 3. Build attribute data
  const attributes = {} as Record<FootballAttribute, FootballAttributeData>;
  const attributeScores = {} as Record<FootballAttribute, number>;

  for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
    const pcts = attrPercentiles[attr];
    const score = pcts.length > 0
      ? Math.min(99, Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length * 0.99))
      : 0;

    // Compute trend: compare latest vs 2nd-latest across all contributing tests
    let trend = 0;
    for (const [testType, group] of byType) {
      const testAttrs = TEST_ATTRIBUTE_MAP[testType];
      if (!testAttrs?.includes(attr) || group.length < 2) continue;
      const latestPct = group[0].percentile ?? 0;
      const prevPct = group[1].percentile ?? 0;
      trend += Math.round((latestPct - prevPct) * 0.99);
    }
    // Average trend across contributing tests
    const contributingTests = [...byType.entries()]
      .filter(([tt]) => TEST_ATTRIBUTE_MAP[tt]?.includes(attr))
      .filter(([, g]) => g.length >= 2);
    if (contributingTests.length > 0) {
      trend = Math.round(trend / contributingTests.length);
    }

    attributes[attr] = {
      score,
      trend,
      sources: attrSources[attr],
      sourcesAvailable: attrSources[attr].length,
      sourcesTotal: 7,
    };
    attributeScores[attr] = score;
  }

  // 4. Overall rating (position-weighted)
  const overallRating = calculateOverallRating(attributeScores, position);

  // 5. Pathway rating
  const pathwayRating = calculatePathwayRating(overallRating, age, 'intermediate', 'club');

  // 6. Level + next milestone
  const level = getFootballRatingLevel(pathwayRating);
  const nextLevel = FOOTBALL_RATING_LEVELS.find((l) => l.minRating > pathwayRating);
  const nextMilestone = nextLevel
    ? { name: nextLevel.name, rating: nextLevel.minRating, pointsNeeded: nextLevel.minRating - pathwayRating }
    : null;

  // 7. Find latest date
  const latestDate = results.reduce((latest, r) => {
    const d = r.createdAt || r.date;
    return d > latest ? d : latest;
  }, '');

  return {
    userId,
    overallRating,
    attributes,
    position,
    footballRating: pathwayRating,
    footballLevel: level.name,
    nextMilestone,
    updatedAt: latestDate,
    history: [], // filled by computeFootballHistory
  };
}

/**
 * Build weekly history snapshots from all test results.
 * Groups results into calendar weeks and computes cumulative attribute scores
 * up to each week.
 */
export function computeFootballHistory(
  results: FootballTestResult[],
  position: FootballPosition,
  age: number,
): FootballHistoryEntry[] {
  if (results.length === 0) return [];

  // Sort by date ascending
  const sorted = [...results].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // Group into weeks (ISO week start = Monday)
  const weekMap = new Map<string, FootballTestResult[]>();
  for (const r of sorted) {
    const d = new Date(r.createdAt);
    // Get Monday of this week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const weekKey = monday.toISOString().slice(0, 10);

    const existing = weekMap.get(weekKey) || [];
    existing.push(r);
    weekMap.set(weekKey, existing);
  }

  // Build cumulative snapshots per week
  const history: FootballHistoryEntry[] = [];
  const cumulativeLatest = new Map<string, FootballTestResult>(); // latest per test_type

  for (const [weekDate, weekResults] of weekMap) {
    // Update cumulative latest with this week's results
    for (const r of weekResults) {
      const existing = cumulativeLatest.get(r.testType);
      if (!existing || new Date(r.createdAt) > new Date(existing.createdAt)) {
        cumulativeLatest.set(r.testType, r);
      }
    }

    // Compute attributes from cumulative state
    const attrPcts: Record<FootballAttribute, number[]> = {
      pace: [], shooting: [], passing: [], dribbling: [], defending: [], physicality: [],
    };

    for (const [testType, result] of cumulativeLatest) {
      const attrs = TEST_ATTRIBUTE_MAP[testType];
      if (!attrs) continue;
      for (const attr of attrs) {
        attrPcts[attr].push(result.percentile ?? 0);
      }
    }

    const attributes = {} as Record<FootballAttribute, number>;
    for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
      const pcts = attrPcts[attr];
      attributes[attr] = pcts.length > 0
        ? Math.min(99, Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length * 0.99))
        : 0;
    }

    const overall = calculateOverallRating(attributes, position);
    const pathwayRating = calculatePathwayRating(overall, age, 'intermediate', 'club');

    history.push({ date: weekDate, attributes, overall, pathwayRating });
  }

  return history;
}
