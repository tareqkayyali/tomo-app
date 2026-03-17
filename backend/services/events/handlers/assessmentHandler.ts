/**
 * Assessment Handler — processes ASSESSMENT_RESULT and PHV_MEASUREMENT events.
 *
 * Updates mastery scores, strength benchmarks, speed profile, and PHV stage
 * on the athlete snapshot.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { recomputeCv } from '../computations/cvComputation';
import type { AthleteEvent, AssessmentResultPayload, PhvMeasurementPayload } from '../types';

// Test type → snapshot field mapping
const SPEED_TESTS = ['sprint_10m', 'sprint_20m', 'sprint_30m', 'sprint_40m', '5_10_5', 'illinois_agility'];
const STRENGTH_TESTS = ['back_squat_1rm', 'bench_press_1rm', 'deadlift_1rm', 'pull_ups', 'push_ups'];

/**
 * Handle ASSESSMENT_RESULT events.
 * Updates mastery_scores, strength_benchmarks, or speed_profile depending on test type.
 */
export async function handleAssessmentResult(event: AthleteEvent): Promise<void> {
  const payload = event.payload as AssessmentResultPayload;
  const db = supabaseAdmin();

  // Fetch current snapshot to merge scores
  const { data: snapshot } = await db
    .from('athlete_snapshots')
    .select('mastery_scores, strength_benchmarks, speed_profile')
    .eq('athlete_id', event.athlete_id)
    .single();

  const mastery = (snapshot?.mastery_scores as Record<string, number>) || {};
  const strength = (snapshot?.strength_benchmarks as Record<string, number>) || {};
  const speed = (snapshot?.speed_profile as Record<string, number>) || {};

  const testType = payload.test_type;
  const value = payload.primary_value;

  // Route to appropriate profile field
  if (SPEED_TESTS.includes(testType)) {
    speed[testType] = value;
  } else if (STRENGTH_TESTS.includes(testType)) {
    strength[testType] = value;
  }

  // Always update mastery (percentile-based if available)
  if (payload.percentile != null) {
    mastery[testType] = payload.percentile;
  } else {
    // Store raw value as mastery score placeholder
    mastery[testType] = value;
  }

  // Merge derived metrics
  if (payload.derived_metrics) {
    for (const [key, val] of Object.entries(payload.derived_metrics)) {
      mastery[key] = val;
    }
  }

  await db
    .from('athlete_snapshots')
    .upsert({
      athlete_id: event.athlete_id,
      mastery_scores: mastery,
      strength_benchmarks: strength,
      speed_profile: speed,
      snapshot_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' });

  // If payload includes height/weight, trigger PHV recompute
  if (payload.height_cm && payload.weight_kg) {
    await updatePhvFromMeasurement(event.athlete_id, {
      height_cm: payload.height_cm,
      weight_kg: payload.weight_kg,
    });
  }

  // Recompute CV — assessments affect speed/strength/mastery completeness
  await recomputeCv(event.athlete_id);
}

/**
 * Handle PHV_MEASUREMENT events.
 * Computes PHV offset and stage, updates snapshot.
 */
export async function handlePhvMeasurement(event: AthleteEvent): Promise<void> {
  const payload = event.payload as PhvMeasurementPayload;
  await updatePhvFromMeasurement(event.athlete_id, payload);
}

/**
 * Shared PHV update logic — used by both ASSESSMENT_RESULT (with height/weight)
 * and dedicated PHV_MEASUREMENT events.
 */
async function updatePhvFromMeasurement(
  athleteId: string,
  measurement: { height_cm: number; weight_kg: number; sitting_height_cm?: number; leg_length_cm?: number },
): Promise<void> {
  const db = supabaseAdmin();

  // If we have full Mirwald data, compute PHV offset
  // Otherwise just store the anthropometric data
  const update = {
    athlete_id: athleteId,
    height_cm: measurement.height_cm,
    weight_kg: measurement.weight_kg,
    snapshot_at: new Date().toISOString(),
  };

  if (measurement.sitting_height_cm) {
    // Full PHV computation requires: height, sitting height, weight, age, sex
    // The phvCalculator.ts service handles this — but it needs profile data.
    // For now, store the raw measurements. Full PHV integration in Phase 5.
    // We still update the snapshot with what we have.
  }

  await db
    .from('athlete_snapshots')
    .upsert(update, { onConflict: 'athlete_id' });
}
