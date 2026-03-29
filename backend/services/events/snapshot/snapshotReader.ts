/**
 * Snapshot Reader — reads athlete snapshots with role-based filtering.
 *
 * Provides O(1) access to pre-computed athlete state for all UI components,
 * AI agents (contextBuilder), and Triangle views (coach/parent dashboards).
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { filterSnapshotByRole } from './visibilityFilter';
import type { AthleteSnapshot, TriangleRole } from '../types';

/**
 * Read a single athlete's snapshot, filtered by the requesting user's role.
 *
 * @param athleteId  - The athlete whose snapshot to read
 * @param role       - The role of the person reading (ATHLETE, COACH, PARENT)
 * @returns Filtered snapshot, or null if no snapshot exists yet
 */
export async function readSnapshot(
  athleteId: string,
  role: TriangleRole = 'ATHLETE',
): Promise<Partial<AthleteSnapshot> | null> {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from('athlete_snapshots')
    .select('*')
    .eq('athlete_id', athleteId)
    .single();

  if (error || !data) return null;

  return filterSnapshotByRole(data as unknown as AthleteSnapshot, role);
}

/**
 * Read snapshots for multiple athletes (coach dashboard view).
 * Returns role-filtered snapshots for all linked athletes.
 */
export async function readMultipleSnapshots(
  athleteIds: string[],
  role: TriangleRole = 'COACH',
): Promise<Partial<AthleteSnapshot>[]> {
  if (athleteIds.length === 0) return [];

  const db = supabaseAdmin();

  const { data, error } = await db
    .from('athlete_snapshots')
    .select('*')
    .in('athlete_id', athleteIds);

  if (error || !data) return [];

  return data.map((snapshot: any) => filterSnapshotByRole(snapshot as AthleteSnapshot, role));
}
