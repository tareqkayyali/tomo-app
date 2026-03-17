/**
 * Visibility Filter — role-based field filtering for athlete snapshots.
 *
 * Angle 4 (The Triangle): Athletes see everything, coaches see performance data,
 * parents see wellness traffic lights only.
 */

import { SNAPSHOT_VISIBILITY } from '../constants';
import type { AthleteSnapshot, TriangleRole } from '../types';

/**
 * Filter a snapshot to only include fields visible to the given role.
 *
 * - ATHLETE: full access (returns unchanged)
 * - COACH: performance + readiness (no academic breakdown, no private journal)
 * - PARENT: traffic lights + wellness trend (no raw biometrics)
 */
export function filterSnapshotByRole(
  snapshot: AthleteSnapshot,
  role: TriangleRole,
): Partial<AthleteSnapshot> {
  // Athletes see everything
  if (role === 'ATHLETE') return snapshot;

  const allowedFields = SNAPSHOT_VISIBILITY[role] as readonly string[];
  const filtered: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (field in snapshot) {
      filtered[field] = (snapshot as unknown as Record<string, unknown>)[field];
    }
  }

  return filtered as Partial<AthleteSnapshot>;
}
