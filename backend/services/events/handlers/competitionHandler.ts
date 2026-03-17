/**
 * Competition Handler — processes COMPETITION_RESULT events.
 *
 * Increments competitions_played in mastery_scores and stores last result.
 * Triggers CV recompute (competitions boost completeness).
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { recomputeCv } from '../computations/cvComputation';
import type { AthleteEvent } from '../types';

interface CompetitionPayload {
  result?: 'W' | 'L' | 'D';
  competition_name?: string;
  [key: string]: unknown;
}

/**
 * Handle COMPETITION_RESULT events.
 * - Increment mastery_scores.competitions_played
 * - Store mastery_scores.last_competition_result (W/L/D)
 * - Recompute CV completeness
 */
export async function handleCompetitionResult(event: AthleteEvent): Promise<void> {
  const payload = event.payload as CompetitionPayload;
  const db = supabaseAdmin();

  // Read current mastery_scores
  const { data: snapshot } = await db
    .from('athlete_snapshots')
    .select('mastery_scores')
    .eq('athlete_id', event.athlete_id)
    .single();

  const mastery: Record<string, string | number> = (snapshot?.mastery_scores as Record<string, string | number>) || {};
  const currentPlayed = (mastery.competitions_played as number) || 0;

  mastery.competitions_played = currentPlayed + 1;
  if (payload.result) {
    mastery.last_competition_result = payload.result;
  }

  await db
    .from('athlete_snapshots')
    .upsert({
      athlete_id: event.athlete_id,
      mastery_scores: mastery as unknown as Record<string, number>,
      snapshot_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' });

  // Competitions boost CV completeness
  await recomputeCv(event.athlete_id);
}
