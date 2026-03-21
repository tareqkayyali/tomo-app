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

  // Filter out READINESS-based recs that were generated from stale checkin data.
  // Check if the rec's context has a last_checkin_at that's >24h old, or if
  // the rec itself is older than 24h and is a readiness-dependent type.
  const READINESS_DEPENDENT_TYPES = ['READINESS', 'LOAD_WARNING', 'RECOVERY'];
  const STALE_HOURS = 24;

  // Fetch latest checkin timestamp from snapshot to compare
  const { data: snap } = await (db as any)
    .from('athlete_snapshots')
    .select('last_checkin_at')
    .eq('athlete_id', athleteId)
    .maybeSingle();

  const lastCheckinAt = snap?.last_checkin_at as string | null;
  const checkinAgeHours = lastCheckinAt
    ? (Date.now() - new Date(lastCheckinAt).getTime()) / 3600000
    : null;
  const hasStaleCheckin = checkinAgeHours == null || checkinAgeHours > STALE_HOURS;

  if (hasStaleCheckin) {
    // Remove readiness-dependent recs that don't have a "Check In" action
    return recs.filter((r) => {
      if (!READINESS_DEPENDENT_TYPES.includes(r.rec_type)) return true;
      // Keep if it's explicitly a "do your checkin" rec
      const action = (r.context as any)?.action;
      if (action?.type === 'Checkin') return true;
      // Filter out stale readiness recs
      return false;
    });
  }

  return recs;
}
