/**
 * Get Recommendations — Reader for Layer 4
 *
 * Queries athlete_recommendations with role-based visibility filtering.
 * Used by the API route and Tomo Chat integration.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Recommendation, GetRecommendationsOptions } from './types';

/**
 * Fetch recommendations for an athlete with role-based visibility.
 *
 * @param athleteId - The athlete's user ID
 * @param options   - Query filters (role, recTypes, limit, includeExpired)
 * @returns Array of recommendations ordered by priority (urgent first), then newest first
 */
export async function getRecommendations(
  athleteId: string,
  options?: GetRecommendationsOptions
): Promise<Recommendation[]> {
  const {
    role = 'ATHLETE',
    recTypes,
    limit = 10,
    includeExpired = false,
  } = options ?? {};

  const db = supabaseAdmin();

  let query = (db as any)
    .from('athlete_recommendations')
    .select('*')
    .eq('athlete_id', athleteId);

  // Status filter: default to active recs only
  if (includeExpired) {
    query = query.in('status', ['PENDING', 'DELIVERED', 'EXPIRED']);
  } else {
    query = query.in('status', ['PENDING', 'DELIVERED']);
  }

  // Role-based visibility
  switch (role) {
    case 'ATHLETE':
      query = query.eq('visible_to_athlete', true);
      break;
    case 'COACH':
      query = query.eq('visible_to_coach', true);
      break;
    case 'PARENT':
      query = query.eq('visible_to_parent', true);
      break;
  }

  // Optional rec type filter
  if (recTypes && recTypes.length > 0) {
    query = query.in('rec_type', recTypes);
  }

  // Order: most urgent first, then newest
  query = query
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error(`[RIE] getRecommendations failed for ${athleteId}:`, error.message);
    return [];
  }

  const recs = (data ?? []) as unknown as Recommendation[];

  // Filter out recs whose expires_at has passed (belt-and-suspenders on top of DB status).
  // The event pipeline marks recs EXPIRED in the DB, but this catches any race window.
  const now = Date.now();
  const filtered = recs.filter((r) => {
    const expiresAt = (r as any).expires_at as string | null;
    if (expiresAt && new Date(expiresAt).getTime() < now) return false;
    return true;
  });

  return filtered;
}
