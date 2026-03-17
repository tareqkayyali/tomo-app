/**
 * Supersede Existing Recommendations
 *
 * Before inserting a new recommendation, we mark any existing PENDING or
 * DELIVERED recs of the same type as SUPERSEDED. This ensures only one
 * active recommendation per type per athlete at any time.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { RecType } from './types';

/**
 * Mark all existing PENDING/DELIVERED recommendations of the given type
 * as SUPERSEDED for the specified athlete.
 */
export async function supersedeExisting(
  athleteId: string,
  recType: RecType
): Promise<void> {
  const db = supabaseAdmin();

  const { error } = await (db as any)
    .from('athlete_recommendations')
    .update({ status: 'SUPERSEDED' })
    .eq('athlete_id', athleteId)
    .eq('rec_type', recType)
    .in('status', ['PENDING', 'DELIVERED']);

  if (error) {
    console.error(`[RIE] Failed to supersede ${recType} for ${athleteId}:`, error.message);
  }
}
