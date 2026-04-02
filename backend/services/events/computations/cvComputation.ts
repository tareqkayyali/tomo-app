/**
 * CV Completeness Computation — scores how "complete" an athlete's profile is.
 *
 * Pure function (no DB): takes a snapshot, returns 0-100 score.
 * DB wrapper: reads snapshot, computes, writes cv_completeness + new CV fields back.
 *
 * Scoring breakdown (100 total):
 *   Profile basics (sport, position, height, weight, dob): 15 pts
 *   PHV data: 5 pts
 *   Speed profile (≥2 tests): 15 pts
 *   Strength benchmarks (≥2 tests): 15 pts
 *   Mastery scores (≥3 entries): 10 pts
 *   Session history (sessions_total ≥ 20): 10 pts
 *   Training age (training_age_weeks ≥ 8): 10 pts
 *   Wellness history: 5 pts
 *   Coachability index: 5 pts
 *   Competition data: 10 pts
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AthleteSnapshot } from '../types';
import { computeCoachabilityIndex } from '../../cv/coachabilityIndex';

// ── Pure computation ──────────────────────────────────────────────────

export function computeCvCompleteness(snapshot: Partial<AthleteSnapshot>): number {
  let score = 0;

  // Profile basics — 3 pts each, max 15
  if (snapshot.sport) score += 3;
  if (snapshot.position) score += 3;
  if (snapshot.height_cm) score += 3;
  if (snapshot.weight_kg) score += 3;
  if (snapshot.dob) score += 3;

  // PHV — 5 pts
  if (snapshot.phv_stage) score += 5;

  // Speed profile — 15 pts if ≥2 tests, partial for 1
  const speedCount = Object.keys(snapshot.speed_profile ?? {}).length;
  if (speedCount >= 2) score += 15;
  else if (speedCount === 1) score += 8;

  // Strength benchmarks — 15 pts if ≥2 tests, partial for 1
  const strengthCount = Object.keys(snapshot.strength_benchmarks ?? {}).length;
  if (strengthCount >= 2) score += 15;
  else if (strengthCount === 1) score += 8;

  // Mastery scores — 10 pts if ≥3 entries, partial for fewer
  const masteryCount = Object.keys(snapshot.mastery_scores ?? {}).length;
  if (masteryCount >= 3) score += 10;
  else if (masteryCount >= 1) score += Math.round((masteryCount / 3) * 10);

  // Session history — 10 pts if ≥20 sessions, proportional for fewer
  const sessions = snapshot.sessions_total ?? 0;
  score += Math.min(10, Math.round((sessions / 20) * 10));

  // Training age — 10 pts if ≥8 weeks, proportional for fewer
  const trainingWeeks = snapshot.training_age_weeks ?? 0;
  score += Math.min(10, Math.round((trainingWeeks / 8) * 10));

  // Wellness history — 5 pts
  if (snapshot.wellness_7day_avg != null) score += 5;

  // Coachability index — 5 pts
  if (snapshot.coachability_index != null) score += 5;

  // Competition data — 10 pts (check mastery_scores for competitions_played)
  const mastery = snapshot.mastery_scores ?? {};
  if ((mastery as Record<string, number>).competitions_played >= 1) score += 10;

  return Math.min(100, score);
}

// ── DB wrapper ────────────────────────────────────────────────────────

/**
 * Recompute and persist cv_completeness + coachability fields for an athlete.
 * Called after events that change profile completeness (assessments, sessions, etc.)
 */
export async function recomputeCv(athleteId: string): Promise<number> {
  const db = supabaseAdmin();

  const [{ data: snapshot }, { data: journals }, { data: careerCount }] = await Promise.all([
    db.from('athlete_snapshots').select('*').eq('athlete_id', athleteId).single(),
    (db as any).from('training_journals').select('post_outcome, journal_state')
      .eq('athlete_id', athleteId).eq('journal_state', 'complete').limit(100),
    (db as any).from('cv_career_entries').select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId),
  ]);

  if (!snapshot) return 0;

  const cvScore = computeCvCompleteness(snapshot as unknown as Partial<AthleteSnapshot>);

  // Compute coachability index from journals + snapshot
  const coachability = computeCoachabilityIndex(
    snapshot as any,
    (journals ?? []) as any[]
  );

  // Compute training_age_months from training_age_weeks
  const trainingAgeMonths = Math.round((snapshot.training_age_weeks ?? 0) / 4.33);

  // Update snapshot with all CV-related computed fields
  const updates: Record<string, unknown> = {
    cv_completeness: cvScore,
    training_age_months: trainingAgeMonths,
    career_entry_count: careerCount ?? 0,
  };

  if (coachability) {
    updates.coachability_index = coachability.score;
    updates.coachability_target_rate = coachability.components.target_achievement_rate;
    updates.coachability_adaptation = coachability.components.adaptation_velocity;
    updates.coachability_responsiveness = coachability.components.coach_responsiveness;
  }

  await db
    .from('athlete_snapshots')
    .update(updates)
    .eq('athlete_id', athleteId);

  return cvScore;
}
