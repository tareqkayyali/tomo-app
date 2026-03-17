/**
 * Drill Handler — processes DRILL_COMPLETED events.
 *
 * Increments drills_completed counter in mastery_scores on the athlete snapshot.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AthleteEvent } from '../types';

interface DrillPayload {
  drill_name?: string;
  drill_id?: string;
  [key: string]: unknown;
}

/**
 * Handle DRILL_COMPLETED events.
 * - Increment mastery_scores.drills_completed
 */
export async function handleDrillCompleted(event: AthleteEvent): Promise<void> {
  const payload = event.payload as DrillPayload;
  const db = supabaseAdmin();

  // Read current mastery_scores
  const { data: snapshot } = await db
    .from('athlete_snapshots')
    .select('mastery_scores')
    .eq('athlete_id', event.athlete_id)
    .single();

  const mastery: Record<string, number> = (snapshot?.mastery_scores as Record<string, number>) || {};
  const currentCount = (mastery.drills_completed as number) || 0;

  mastery.drills_completed = currentCount + 1;

  await db
    .from('athlete_snapshots')
    .upsert({
      athlete_id: event.athlete_id,
      mastery_scores: mastery as unknown as Record<string, number>,
      snapshot_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' });
}
