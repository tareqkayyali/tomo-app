/**
 * CV Opportunity Recommendation Computer
 *
 * Generates CV/profile-completeness recommendations to encourage
 * athletes to build and maintain their athletic profile.
 *
 * Decision matrix (first match wins):
 *   cv_completeness < 25                 → P3 "Build Your Athletic CV"
 *   Key position metric missing          → P3 "Missing Key Test: {metric}"
 *   cv_completeness crossed 50/75        → P4 "CV Milestone: {pct}% Complete"
 *   Good metric stale >90 days           → P3 "Retest {metric} — Keep It Fresh"
 *   Otherwise                            → No rec
 *
 * Confidence: 0.8 (fact-based, profile data)
 * Expiry: 14 days
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getPlayerBenchmarkProfile } from '@/services/benchmarkService';
import { supersedeExisting } from '../supersedeExisting';
import { REC_EXPIRY_HOURS } from '../constants';
import type { AthleteEvent } from '../../events/types';
import type { RecPriority, RecommendationInsert } from '../types';

export async function computeCvOpportunityRec(
  athleteId: string,
  event: AthleteEvent
): Promise<void> {
  const db = supabaseAdmin();

  // 1. Read latest snapshot
  const { data: snapshot } = await db
    .from('athlete_snapshots')
    .select('cv_completeness, mastery_scores, strength_benchmarks, speed_profile, sport, position')
    .eq('athlete_id', athleteId)
    .single();

  if (!snapshot) {
    console.log(`[RIE/CVOpportunity] No snapshot for ${athleteId} — skipping`);
    return;
  }

  const cvCompleteness = snapshot.cv_completeness as number | null;
  const confidence = 0.8;

  // 2. Get benchmark profile to identify gaps
  const benchmarkProfile = await getPlayerBenchmarkProfile(athleteId);

  // 3. Evaluate decision matrix (first match wins)
  let priority: RecPriority | null = null;
  let title = '';
  let bodyShort = '';
  let bodyLong = '';

  if (cvCompleteness !== null && cvCompleteness < 25) {
    priority = 3;
    title = 'Build Your Athletic CV';
    bodyShort = `Your athletic CV is only ${Math.round(cvCompleteness)}% complete. Start building it now!`;
    bodyLong = `Your athletic CV is at ${Math.round(cvCompleteness)}% — there's a lot of room to grow. `
      + `A complete profile helps coaches see your strengths and track your development. `
      + `Start with the basics: complete a phone test (jump, sprint, agility) to get your `
      + `first benchmarks, and make sure your profile info (height, weight, position) is up to date.`;
  } else if (benchmarkProfile && benchmarkProfile.gaps.length > 0) {
    // Gaps = metrics with low percentile (< 40th). These are TRAINING gaps, not missing tests.
    const topGap = benchmarkProfile.gaps[0];
    priority = 3;
    title = `Improve Your ${topGap}`;
    bodyShort = `Your ${topGap} is a development area. Targeted training programs can help you level up.`;
    bodyLong = `Your ${topGap} benchmark is below the 40th percentile for ${snapshot.position ?? 'your position'} in ${snapshot.sport ?? 'your sport'}. `
      + `This is one of your biggest areas for improvement. Focus on specific training programs `
      + `and drills designed to improve this metric. Consistent targeted work over 4-6 weeks `
      + `can make a significant difference.`;
  } else if (cvCompleteness !== null) {
    // Check for milestone crossings (50% or 75%)
    // We detect this by checking if the current event pushed CV above threshold
    const prevCompleteness = await getPreviousCvCompleteness(athleteId, db);
    const crossed50 = prevCompleteness !== null && prevCompleteness < 50 && cvCompleteness >= 50;
    const crossed75 = prevCompleteness !== null && prevCompleteness < 75 && cvCompleteness >= 75;

    if (crossed75) {
      priority = 4;
      title = 'CV Milestone: 75% Complete!';
      bodyShort = 'Your athletic CV is 75% complete! You\'re building an impressive profile.';
      bodyLong = `Congratulations! Your athletic CV just crossed the 75% mark. `
        + `You now have a strong profile that showcases your abilities. `
        + `Keep maintaining your data with regular assessments and session logs. `
        + `Consider sharing your CV with coaches or scouts.`;
    } else if (crossed50) {
      priority = 4;
      title = 'CV Milestone: 50% Complete!';
      bodyShort = 'Your athletic CV is halfway done! Keep building your profile.';
      bodyLong = `Great progress! Your athletic CV is now 50% complete. `
        + `You're building a solid foundation. To keep growing, focus on: `
        + `regular training sessions, completing assessments, and maintaining consistency. `
        + `The next milestones are at 75% and 100%.`;
    }
  }

  // Check for stale metrics (good results >90 days old)
  if (!priority && benchmarkProfile) {
    const staleMetric = await findStaleMetric(athleteId, benchmarkProfile, db);
    if (staleMetric) {
      priority = 3;
      title = `Retest ${staleMetric} — Keep It Fresh`;
      bodyShort = `Your ${staleMetric} result is over 90 days old. Retest to keep your CV current.`;
      bodyLong = `Your ${staleMetric} benchmark was recorded over 90 days ago. `
        + `Athletic profiles are most valuable when they reflect your current abilities. `
        + `Retesting regularly shows progression and keeps your data relevant for coaches. `
        + `Schedule a retest this week!`;
    }
  }

  if (!priority) {
    // No CV opportunity rec needed
    return;
  }

  // 4. Build evidence
  const evidence: Record<string, unknown> = {
    cv_completeness: cvCompleteness,
    benchmark_gaps: benchmarkProfile?.gaps ?? [],
    benchmark_strengths: benchmarkProfile?.strengths ?? [],
    overall_percentile: benchmarkProfile?.overallPercentile ?? null,
    sport: snapshot.sport,
    position: snapshot.position,
  };

  // 5. Build context with appropriate action
  // If gaps exist (low scores), point to programs. If CV incomplete, point to tests.
  const hasLowScoreGaps = benchmarkProfile && benchmarkProfile.gaps.length > 0;
  const action = hasLowScoreGaps
    ? { type: "Test", params: { initialTab: "programs" }, label: "Browse Programs" }
    : { type: "Test", params: { initialTab: "metrics" }, label: "Run a Test" };

  const context: Record<string, unknown> = {
    cv_completeness: cvCompleteness,
    mastery_scores: snapshot.mastery_scores,
    strength_benchmarks: snapshot.strength_benchmarks,
    speed_profile: snapshot.speed_profile,
    action,
  };

  // 6. Supersede existing CV_OPPORTUNITY recs
  await supersedeExisting(athleteId, 'CV_OPPORTUNITY');

  // 7. Insert new recommendation
  const expiryHours = REC_EXPIRY_HOURS.CV_OPPORTUNITY ?? 336;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const rec: RecommendationInsert = {
    athlete_id: athleteId,
    rec_type: 'CV_OPPORTUNITY',
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

  const { error } = await (db as any)
    .from('athlete_recommendations')
    .insert(rec);

  if (error) {
    console.error(`[RIE/CVOpportunity] Insert failed for ${athleteId}:`, error.message);
    return;
  }

  console.log(`[RIE/CVOpportunity] P${priority} "${title}" created for ${athleteId} (confidence: ${confidence})`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the previous CV completeness from the second-most-recent snapshot */
async function getPreviousCvCompleteness(
  athleteId: string,
  db: ReturnType<typeof supabaseAdmin>
): Promise<number | null> {
  // Check last ASSESSMENT_RESULT event's snapshot context for prev CV value
  const { data: prevEvents } = await (db as any)
    .from('athlete_recommendations')
    .select('context')
    .eq('athlete_id', athleteId)
    .eq('rec_type', 'CV_OPPORTUNITY')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prevEvents?.context?.cv_completeness !== undefined) {
    return prevEvents.context.cv_completeness as number;
  }
  return null;
}

/** Find a benchmark metric with good results that's over 90 days old */
async function findStaleMetric(
  athleteId: string,
  benchmarkProfile: { results: Array<{ metricKey: string; metricLabel: string; zone: string }> },
  db: ReturnType<typeof supabaseAdmin>
): Promise<string | null> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Find good/elite results
  const goodResults = benchmarkProfile.results.filter(
    r => r.zone === 'good' || r.zone === 'elite'
  );

  for (const result of goodResults) {
    // Check if the latest assessment for this metric is older than 90 days
    const { data: latestAssessment } = await (db as any)
      .from('athlete_events')
      .select('occurred_at')
      .eq('athlete_id', athleteId)
      .eq('event_type', 'ASSESSMENT_RESULT')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestAssessment && latestAssessment.occurred_at < ninetyDaysAgo) {
      return result.metricLabel;
    }
  }

  return null;
}
