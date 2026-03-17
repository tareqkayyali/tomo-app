/**
 * Injury Handler — processes INJURY_FLAG and INJURY_CLEARED events.
 *
 * Updates injury_risk_flag on the athlete snapshot.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AthleteEvent } from '../types';

/**
 * Handle INJURY_FLAG / INJURY_CLEARED events.
 * - INJURY_FLAG → sets injury_risk_flag = 'RED'
 * - INJURY_CLEARED → sets injury_risk_flag = 'GREEN'
 */
export async function handleInjuryEvent(event: AthleteEvent): Promise<void> {
  const db = supabaseAdmin();

  const flag = event.event_type === 'INJURY_FLAG' ? 'RED' : 'GREEN';

  await db
    .from('athlete_snapshots')
    .upsert({
      athlete_id: event.athlete_id,
      injury_risk_flag: flag,
      snapshot_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' });
}
