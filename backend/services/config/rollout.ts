/**
 * ════════════════════════════════════════════════════════════════════════════
 * Rollout Cohort Assignment
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Deterministic hash-based assignment so an athlete either consistently
 * sees the CMS config or consistently sees the hardcoded DEFAULT within a
 * rollout window — never flipping between them on successive requests.
 *
 * Uses Node's built-in `crypto.createHash('sha256')` rather than a
 * dependency. SHA-256 is overkill for a cohort decision but keeps the
 * distribution uniform across the 0–99 bucket space without sampling bias.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { createHash } from 'crypto';

/**
 * Returns true if the athlete lands inside the rollout cohort for this
 * config key, using a stable hash so repeat calls for the same athlete +
 * key always resolve the same way.
 *
 * Semantics:
 *   - rolloutPercentage === 100 → always true (no filtering)
 *   - rolloutPercentage === 0   → always false
 *   - athleteId undefined (e.g. admin preview, background job) →
 *     returns `rolloutPercentage === 100` so unknown callers never land on
 *     a partial rollout payload.
 *   - sportFilter present and athlete's sport not in it → false.
 */
export function isInRollout(params: {
  athleteId:         string | undefined;
  athleteSport:      string | null | undefined;
  configKey:         string;
  rolloutPercentage: number;
  sportFilter:       string[] | null | undefined;
}): boolean {
  const { athleteId, athleteSport, configKey, rolloutPercentage, sportFilter } = params;

  if (rolloutPercentage <= 0) return false;
  if (rolloutPercentage >= 100 && (!sportFilter || sportFilter.length === 0)) return true;

  // Sport filter: reject if the row targets specific sports and ours isn't one.
  if (sportFilter && sportFilter.length > 0) {
    if (!athleteSport || !sportFilter.includes(athleteSport)) return false;
  }

  // No athlete context → treat as "unknown caller", only accept full-rollout rows.
  if (!athleteId) return rolloutPercentage >= 100;

  const bucket = stableBucket(`${athleteId}|${configKey}`);
  return bucket < rolloutPercentage;
}

/**
 * Map a string input to a bucket in [0, 100). Exported for test coverage
 * and for the admin preview tool so ops can see which athletes a given
 * rollout percentage will include.
 */
export function stableBucket(input: string): number {
  const digest = createHash('sha256').update(input).digest();
  // First 4 bytes → 32-bit unsigned int → mod 100
  const u32 = digest.readUInt32BE(0);
  return u32 % 100;
}
