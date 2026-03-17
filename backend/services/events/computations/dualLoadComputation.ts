/**
 * Dual Load Index Computation — combines athletic + academic load into a
 * single 0-100 stress index on the athlete snapshot.
 *
 * Follows the same pattern as acwrComputation.ts:
 *   1. Read 7 days from athlete_daily_load
 *   2. Compute sums
 *   3. Write to athlete_snapshots
 *
 * The dual load index reflects total athlete stress — physical + cognitive.
 * Exam weeks amplify the academic component (established finding: cognitive
 * stress compounds physical fatigue disproportionately in youth athletes).
 */

import { supabaseAdmin } from '@/lib/supabase/admin';

export interface DualLoadResult {
  dual_load_index: number;     // 0-100
  academic_load_7day: number;  // raw 7-day sum
  athletic_load_7day: number;  // raw 7-day sum
}

/** Athletic load normalization: 500 AU = heavy training week (max 50 points) */
const ATHLETIC_MAX_AU = 500;

/** Academic load normalization: 300 AU = heavy exam week (max 50 points) */
const ACADEMIC_MAX_AU = 300;

/** Exam amplifier threshold: academic load above this triggers 1.3x multiplier */
const EXAM_AMPLIFIER_THRESHOLD = 200;
const EXAM_AMPLIFIER = 1.3;

/**
 * Recompute the dual load index from the athlete_daily_load table.
 * Writes dual_load_index, academic_load_7day, athletic_load_7day to snapshot.
 */
export async function recomputeDualLoad(athleteId: string): Promise<DualLoadResult> {
  const db = supabaseAdmin();

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const { data: dailyLoads } = await db
    .from('athlete_daily_load')
    .select('load_date, training_load_au, academic_load_au')
    .eq('athlete_id', athleteId)
    .gte('load_date', sevenDaysAgo)
    .order('load_date', { ascending: false });

  // Sum 7-day loads
  const athleticSum = (dailyLoads ?? []).reduce(
    (sum: number, d: any) => sum + (d.training_load_au || 0), 0
  );
  const academicSum = (dailyLoads ?? []).reduce(
    (sum: number, d: any) => sum + (d.academic_load_au || 0), 0
  );

  // Normalize to 0-50 scale each
  const athleticNorm = Math.min(50, Math.round((athleticSum / ATHLETIC_MAX_AU) * 50));

  let academicNorm = Math.round((academicSum / ACADEMIC_MAX_AU) * 50);
  // Exam amplifier: heavy academic weeks get extra weight
  if (academicSum > EXAM_AMPLIFIER_THRESHOLD) {
    academicNorm = Math.round(academicNorm * EXAM_AMPLIFIER);
  }
  academicNorm = Math.min(50, academicNorm);

  const dualLoadIndex = athleticNorm + academicNorm;

  const result: DualLoadResult = {
    dual_load_index: dualLoadIndex,
    academic_load_7day: Math.round(academicSum),
    athletic_load_7day: Math.round(athleticSum * 10) / 10,
  };

  await writeDualLoadToSnapshot(athleteId, result);
  return result;
}

async function writeDualLoadToSnapshot(
  athleteId: string,
  result: DualLoadResult,
): Promise<void> {
  const db = supabaseAdmin();
  await db
    .from('athlete_snapshots')
    .upsert({
      athlete_id: athleteId,
      dual_load_index: result.dual_load_index,
      academic_load_7day: result.academic_load_7day,
      athletic_load_7day: result.athletic_load_7day,
      snapshot_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' });
}
