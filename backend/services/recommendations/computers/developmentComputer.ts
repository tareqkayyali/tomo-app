/**
 * Development Recommendation Computer
 *
 * Generates development-related recommendations based on assessment results,
 * benchmark profiles, and mastery progression.
 *
 * Decision matrix (first match wins):
 *   New PB in assessment          → P3 "New PB in {test}! Next target: {band}"
 *   Metric within 5pts of band    → P3 "Close to {band} in {test}"
 *   Metric dropped a band         → P2 "{test} Dropped — Refocus"
 *   No mastery scores at all      → P4 "Start Building Your Profile"
 *   Otherwise                     → No rec
 *
 * Confidence levels:
 *   0.9  = fresh assessment (< 30 days)
 *   0.6  = stale assessment (> 30 days)
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getPlayerBenchmarkProfile } from '@/services/benchmarkService';
import { supersedeExisting } from '../supersedeExisting';
import { REC_EXPIRY_HOURS } from '../constants';
import type { AthleteEvent } from '../../events/types';
import type { RecPriority, RecommendationInsert } from '../types';
import { insertRecommendationWithNotify } from '../notifyRec';

/** Zone ordering for band comparison */
const ZONE_ORDER: Record<string, number> = {
  below: 0,
  developing: 1,
  average: 2,
  good: 3,
  elite: 4,
};

const ZONE_LABELS: Record<string, string> = {
  below: 'Developing',
  developing: 'Average',
  average: 'Good',
  good: 'Elite',
  elite: 'Elite+',
};

export async function computeDevelopmentRec(
  athleteId: string,
  event: AthleteEvent
): Promise<void> {
  const db = supabaseAdmin();

  // 1. Read snapshot for mastery data
  const { data: snapshot } = await db
    .from('athlete_snapshots')
    .select('mastery_scores, strength_benchmarks, speed_profile, cv_completeness')
    .eq('athlete_id', athleteId)
    .single();

  if (!snapshot) {
    console.log(`[RIE/Development] No snapshot for ${athleteId} — skipping`);
    return;
  }

  // 2. Extract event payload for PB detection
  const payload = event.payload as Record<string, unknown>;
  const isNewPb = payload?.is_new_pb === true;
  const testType = payload?.test_type as string | undefined;
  const percentile = payload?.percentile as number | undefined;
  const zone = payload?.zone as string | undefined;

  // 3. Get benchmark profile for gaps analysis
  const benchmarkProfile = await getPlayerBenchmarkProfile(athleteId);

  // 4. Check if athlete has any mastery data
  const masteryScores = snapshot.mastery_scores as Record<string, number> | null;
  const strengthBenchmarks = snapshot.strength_benchmarks as Record<string, number> | null;
  const speedProfile = snapshot.speed_profile as Record<string, number> | null;
  const hasAnyData = (masteryScores && Object.keys(masteryScores).length > 0)
    || (strengthBenchmarks && Object.keys(strengthBenchmarks).length > 0)
    || (speedProfile && Object.keys(speedProfile).length > 0);

  // 5. Determine confidence
  const confidence = 0.9; // Assessment-triggered is always fresh

  // 6. Evaluate decision matrix (first match wins)
  let priority: RecPriority | null = null;
  let title = '';
  let bodyShort = '';
  let bodyLong = '';

  if (isNewPb && testType) {
    // New personal best
    const nextBand = zone ? ZONE_LABELS[zone] ?? 'next level' : 'next level';
    priority = 3;
    title = `New PB in ${formatTestName(testType)}!`;
    bodyShort = `You just set a new personal best! Next target: ${nextBand}.`;
    bodyLong = `Congratulations! Your ${formatTestName(testType)} result is a new personal best`
      + (percentile ? ` (${Math.round(percentile)}th percentile)` : '') + `. `
      + `Keep this momentum going. Your next goal is to reach the ${nextBand} band. `
      + `Focus on consistent training and retest in 4-6 weeks.`;
  } else if (benchmarkProfile && zone && testType) {
    // Check for close-to-next-band or regression
    const currentZoneIndex = ZONE_ORDER[zone] ?? -1;
    const nextZone = Object.entries(ZONE_ORDER).find(([, v]) => v === currentZoneIndex + 1)?.[0];

    // Look for this metric in the profile to check proximity to next band
    const matchingResult = benchmarkProfile.results.find(
      r => r.metricKey === testType || r.metricLabel.toLowerCase().includes(testType.toLowerCase())
    );

    if (matchingResult && nextZone) {
      // Check if within 5 percentile points of next band boundary
      const nextBandThreshold = getNextBandThreshold(currentZoneIndex);
      if (percentile && nextBandThreshold && (nextBandThreshold - percentile) <= 5) {
        const nextBandLabel = ZONE_LABELS[zone] ?? 'next level';
        priority = 3;
        title = `Close to ${nextBandLabel} in ${formatTestName(testType)}`;
        bodyShort = `You're just ${Math.round(nextBandThreshold - percentile)} points away from ${nextBandLabel}!`;
        bodyLong = `Your ${formatTestName(testType)} is at the ${Math.round(percentile)}th percentile — `
          + `only ${Math.round(nextBandThreshold - percentile)} points from reaching ${nextBandLabel}. `
          + `A focused training block could push you over. Talk to your coach about specific drills.`;
      }
    }

    // Check for regression (dropped a band) — compare with previous assessments
    if (!priority && matchingResult) {
      const previousZone = await getPreviousZone(athleteId, testType, db);
      if (previousZone !== null && ZONE_ORDER[zone] < ZONE_ORDER[previousZone]) {
        priority = 2;
        title = `${formatTestName(testType)} Dropped — Refocus`;
        bodyShort = `Your ${formatTestName(testType)} has dropped from ${previousZone} to ${zone}. Time to refocus.`;
        bodyLong = `Your latest ${formatTestName(testType)} assessment shows a drop from `
          + `${previousZone} to ${zone} band. This could be due to detraining, fatigue, or other factors. `
          + `Don't worry — schedule focused work and retest in 3-4 weeks. `
          + `Consistency is key to bouncing back.`;
      }
    }
  }

  // Fallback: no data at all
  if (!priority && !hasAnyData) {
    priority = 4;
    title = 'Start Building Your Profile';
    bodyShort = 'Complete your first assessment to unlock development insights.';
    bodyLong = `You haven't completed any assessments yet. Phone tests (jump, sprint, agility) `
      + `take just 2-3 minutes and unlock your athletic profile with percentile rankings, `
      + `strengths, and development areas. Open the Assess tab to get started!`;
  }

  if (!priority) {
    // No development rec needed
    return;
  }

  // 7. Build evidence
  const evidence: Record<string, unknown> = {
    test_type: testType,
    is_new_pb: isNewPb,
    percentile,
    zone,
    has_mastery_data: hasAnyData,
    benchmark_strengths: benchmarkProfile?.strengths ?? [],
    benchmark_gaps: benchmarkProfile?.gaps ?? [],
    cv_completeness: snapshot.cv_completeness,
  };

  // 8. Build context
  const context: Record<string, unknown> = {
    mastery_scores: masteryScores,
    strength_benchmarks: strengthBenchmarks,
    speed_profile: speedProfile,
    cv_completeness: snapshot.cv_completeness,
  };

  // 9. Supersede existing DEVELOPMENT recs
  await supersedeExisting(athleteId, 'DEVELOPMENT');

  // 10. Insert new recommendation
  const expiryHours = REC_EXPIRY_HOURS.DEVELOPMENT ?? 168;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const rec: RecommendationInsert = {
    athlete_id: athleteId,
    rec_type: 'DEVELOPMENT',
    priority: priority!,
    title,
    body_short: bodyShort,
    body_long: bodyLong,
    confidence_score: confidence,
    evidence_basis: evidence,
    trigger_event_id: event.event_id,
    context,
    expires_at: expiresAt,
  };

  const insertedId = await insertRecommendationWithNotify(db as any, rec);

  if (!insertedId) {
    console.error(`[RIE/Development] Insert failed for ${athleteId}`);
    return;
  }

  console.log(`[RIE/Development] P${priority} "${title}" created for ${athleteId} (confidence: ${confidence})`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTestName(testType: string): string {
  return testType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Get the percentile threshold for the next band above current */
function getNextBandThreshold(currentZoneIndex: number): number | null {
  // Band boundaries by percentile: below<10, developing<25, average<50, good<75, elite<90
  const thresholds = [10, 25, 50, 75, 90];
  if (currentZoneIndex >= 0 && currentZoneIndex < thresholds.length) {
    return thresholds[currentZoneIndex];
  }
  return null;
}

/** Look up the previous zone for a metric from the second-most-recent assessment */
async function getPreviousZone(
  athleteId: string,
  testType: string,
  db: ReturnType<typeof supabaseAdmin>
): Promise<string | null> {
  const { data } = await (db as any)
    .from('athlete_events')
    .select('payload')
    .eq('athlete_id', athleteId)
    .eq('event_type', 'ASSESSMENT_RESULT')
    .order('occurred_at', { ascending: false })
    .limit(2);

  if (!data || data.length < 2) return null;

  // The second result is the previous assessment
  const prevPayload = data[1].payload as Record<string, unknown>;
  if (prevPayload?.test_type === testType) {
    return (prevPayload?.zone as string) ?? null;
  }

  return null;
}
