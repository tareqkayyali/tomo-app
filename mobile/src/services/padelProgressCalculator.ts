/**
 * Padel Progress Calculator
 *
 * Pure functions that transform raw padel_shot_results into the
 * ShotRatingsData shape expected by PadelProgressContent.
 *
 * No React, no side effects — just math.
 */

import type { ShotType, ShotRatingsData, ShotData } from '../types/padel';
import type { PadelShotResult } from '../types/padelShots';

const ALL_SHOT_TYPES: ShotType[] = [
  'bandeja', 'vibora', 'smash', 'chiquita', 'lob', 'bajada', 'volley', 'serve',
];

/**
 * Compute ShotRatingsData from raw padel shot results.
 * Groups by shot_type, uses latest result + builds history.
 */
export function computePadelShotRatings(
  results: PadelShotResult[],
): ShotRatingsData | null {
  if (results.length === 0) return null;

  // Group by shot type
  const byType = new Map<string, PadelShotResult[]>();
  for (const r of results) {
    const existing = byType.get(r.shotType) || [];
    existing.push(r);
    byType.set(r.shotType, existing);
  }

  // Sort each group by createdAt desc
  for (const [, group] of byType) {
    group.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // Build shots data
  const shots: Partial<Record<ShotType, ShotData>> = {};
  const shotOveralls: number[] = [];

  for (const shotType of ALL_SHOT_TYPES) {
    const group = byType.get(shotType);
    if (!group || group.length === 0) continue;

    const latest = group[0];
    const rating = latest.overall;
    shotOveralls.push(rating);

    // Build history (oldest first)
    const history = [...group]
      .reverse()
      .map((r) => ({ date: r.date, rating: r.overall }));

    // Compute trend (latest vs 2nd latest)
    const trend = group.length >= 2
      ? group[0].overall - group[1].overall
      : 0;

    shots[shotType as ShotType] = {
      rating,
      subMetrics: latest.subMetrics as Record<string, number>,
      trend,
      sessionsLogged: group.length,
      lastUpdated: latest.date,
      history,
    };
  }

  if (shotOveralls.length === 0) return null;

  // Overall shot mastery = average of all shot ratings
  const overallShotMastery = Math.round(
    shotOveralls.reduce((a, b) => a + b, 0) / shotOveralls.length,
  );

  // Shot variety index: % of shot types with at least 1 result and rating > 30
  const qualifyingShots = ALL_SHOT_TYPES.filter((st) => {
    const data = shots[st];
    return data && data.rating > 30;
  });
  const shotVarietyIndex = Math.round((qualifyingShots.length / ALL_SHOT_TYPES.length) * 100);

  // Strongest & weakest
  let strongestShot: ShotType = 'bandeja';
  let weakestShot: ShotType = 'bandeja';
  let maxRating = -1;
  let minRating = 101;

  for (const [type, data] of Object.entries(shots)) {
    if (data && data.rating > maxRating) {
      maxRating = data.rating;
      strongestShot = type as ShotType;
    }
    if (data && data.rating < minRating) {
      minRating = data.rating;
      weakestShot = type as ShotType;
    }
  }

  return {
    userId: results[0].userId || '',
    overallShotMastery,
    shots: shots as Record<ShotType, ShotData>,
    shotVarietyIndex,
    strongestShot,
    weakestShot,
  };
}
