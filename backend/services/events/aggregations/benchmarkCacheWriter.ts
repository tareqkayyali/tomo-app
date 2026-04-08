/**
 * ════════════════════════════════════════════════════════════════════════════
 * Benchmark Cache Writer
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Maintains athlete_benchmark_cache — a cached benchmark profile that
 * avoids recomputing normative lookups on every screen load.
 *
 * Invalidation triggers:
 *   - ASSESSMENT_RESULT event (new test score)
 *   - Position change on athlete profile
 *   - Age band change on athlete profile
 *
 * Recomputation: Calls the existing benchmarkService to compute the full
 * profile, then persists it to the cache table.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/admin';

export interface BenchmarkCacheUpdate {
  overall_percentile?:   number;
  strengths?:            string[];
  gaps?:                 string[];
  strength_attributes?:  string[];
  gap_attributes?:       string[];
  results_json?:         Record<string, unknown>;
  age_band?:             string;
  position?:             string;
  sport?:                string;
  trigger_event_id?:     string;
}

/**
 * Upsert the benchmark cache for an athlete.
 * Called after benchmark profile is computed.
 */
export async function upsertBenchmarkCache(
  athleteId: string,
  update: BenchmarkCacheUpdate,
): Promise<void> {
  const db = supabaseAdmin();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days backup expiry

  const { error } = await (db as any)
    .from('athlete_benchmark_cache')
    .upsert({
      athlete_id:          athleteId,
      overall_percentile:  update.overall_percentile ?? null,
      strengths:           update.strengths ?? [],
      gaps:                update.gaps ?? [],
      strength_attributes: update.strength_attributes ?? [],
      gap_attributes:      update.gap_attributes ?? [],
      results_json:        update.results_json ?? null,
      age_band:            update.age_band ?? null,
      position:            update.position ?? null,
      sport:               update.sport ?? null,
      computed_at:         now.toISOString(),
      expires_at:          expiresAt.toISOString(),
      trigger_event_id:    update.trigger_event_id ?? null,
    }, { onConflict: 'athlete_id' });

  if (error) {
    console.error('[BenchmarkCacheWriter] Upsert failed:', error.message, { athleteId });
  }
}

/**
 * Invalidate the benchmark cache for an athlete.
 * Forces recomputation on next getAthleteState() call.
 */
export async function invalidateBenchmarkCache(athleteId: string): Promise<void> {
  const db = supabaseAdmin();

  const { error } = await (db as any)
    .from('athlete_benchmark_cache')
    .update({ expires_at: new Date().toISOString() })
    .eq('athlete_id', athleteId);

  if (error) {
    console.error('[BenchmarkCacheWriter] Invalidation failed:', error.message, { athleteId });
  }
}
