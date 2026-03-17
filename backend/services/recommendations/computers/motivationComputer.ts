/**
 * Motivation Recommendation Computer
 *
 * Generates positive reinforcement recommendations for achievements,
 * streaks, milestones, and personal bests.
 *
 * SPECIAL: Motivation recs do NOT supersede — multiple can coexist.
 * This lets athletes see a stream of positive achievements.
 *
 * Decision matrix (first match wins):
 *   MILESTONE_HIT event                 → P4 "{milestone_title}"
 *   is_new_pb in ASSESSMENT_RESULT      → P4 "New Personal Best!"
 *   streak_days hits milestone           → P4 "{N}-Day Streak!"
 *   sessions_total hits milestone        → P4 "{N} Sessions Completed!"
 *   cv_completeness crosses threshold    → P4 "CV {pct}% Complete!"
 *   training_age_weeks hits milestone    → P4 "{N} Weeks of Training!"
 *   Otherwise                           → No rec
 *
 * Confidence: 1.0 (fact-based, no estimation)
 * Expiry: 48h
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { REC_EXPIRY_HOURS } from '../constants';
import type { AthleteEvent } from '../../events/types';
import type { RecommendationInsert } from '../types';

/** Streak milestones that trigger a motivation rec */
const STREAK_MILESTONES = [7, 14, 30, 60, 90, 180, 365];

/** Session count milestones */
const SESSION_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

/** CV completeness thresholds */
const CV_MILESTONES = [25, 50, 75, 100];

/** Training age milestones (weeks) */
const TRAINING_AGE_MILESTONES = [4, 12, 26, 52, 104];

export async function computeMotivationRec(
  athleteId: string,
  event: AthleteEvent
): Promise<void> {
  const db = supabaseAdmin();

  // 1. Read latest snapshot
  const { data: snapshot } = await db
    .from('athlete_snapshots')
    .select('streak_days, sessions_total, training_age_weeks, cv_completeness, mastery_scores')
    .eq('athlete_id', athleteId)
    .single();

  if (!snapshot) {
    console.log(`[RIE/Motivation] No snapshot for ${athleteId} — skipping`);
    return;
  }

  const payload = event.payload as Record<string, unknown>;

  // 2. Evaluate decision matrix — build a rec if any condition matches
  let title = '';
  let bodyShort = '';
  let bodyLong = '';
  let matched = false;

  // Check 1: MILESTONE_HIT event
  if (event.event_type === 'MILESTONE_HIT') {
    const milestoneTitle = payload?.title as string ?? 'Milestone Achieved!';
    const milestoneDesc = payload?.description as string;
    title = milestoneTitle;
    bodyShort = milestoneDesc ?? `You just hit a milestone: ${milestoneTitle}. Keep it up!`;
    bodyLong = `${milestoneDesc ?? milestoneTitle} `
      + `Every milestone is a sign of dedication. You're building something great — `
      + `keep showing up and the results will follow.`;
    matched = true;
  }

  // Check 2: New PB in ASSESSMENT_RESULT
  if (!matched && event.event_type === 'ASSESSMENT_RESULT' && payload?.is_new_pb === true) {
    const testType = payload?.test_type as string ?? 'assessment';
    const formattedTest = testType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    title = 'New Personal Best!';
    bodyShort = `You set a new PB in ${formattedTest}! Your hard work is paying off.`;
    bodyLong = `Congratulations on your new personal best in ${formattedTest}! `
      + `PBs are proof that your training is working. `
      + `Take a moment to celebrate this achievement, then keep pushing toward the next one.`;
    matched = true;
  }

  // Check 3: Streak milestones
  if (!matched) {
    const streakDays = snapshot.streak_days as number;
    if (STREAK_MILESTONES.includes(streakDays)) {
      // Verify this is a new milestone (wasn't already recorded)
      const alreadyRecorded = await hasRecentMotivationRec(athleteId, `${streakDays}-Day Streak`, db);
      if (!alreadyRecorded) {
        title = `${streakDays}-Day Streak!`;
        bodyShort = `You've trained ${streakDays} days in a row! Incredible consistency.`;
        bodyLong = `${streakDays} consecutive days of training — that's elite-level consistency! `
          + getStreakMessage(streakDays)
          + ` Keep the streak alive!`;
        matched = true;
      }
    }
  }

  // Check 4: Session count milestones
  if (!matched) {
    const sessionsTotal = snapshot.sessions_total as number;
    if (SESSION_MILESTONES.includes(sessionsTotal)) {
      const alreadyRecorded = await hasRecentMotivationRec(athleteId, `${sessionsTotal} Sessions`, db);
      if (!alreadyRecorded) {
        title = `${sessionsTotal} Sessions Completed!`;
        bodyShort = `You've completed ${sessionsTotal} training sessions! That's real dedication.`;
        bodyLong = `${sessionsTotal} sessions logged — every single one has made you a better athlete. `
          + `Not many people have your level of commitment. `
          + getSessionMessage(sessionsTotal);
        matched = true;
      }
    }
  }

  // Check 5: CV completeness milestones
  if (!matched) {
    const cvCompleteness = snapshot.cv_completeness as number | null;
    if (cvCompleteness !== null) {
      const crossedMilestone = CV_MILESTONES.find(m => {
        // Check if we just crossed this threshold
        return cvCompleteness >= m && cvCompleteness < m + 5;
      });
      if (crossedMilestone) {
        const alreadyRecorded = await hasRecentMotivationRec(athleteId, `CV ${crossedMilestone}%`, db);
        if (!alreadyRecorded) {
          title = `CV ${crossedMilestone}% Complete!`;
          bodyShort = `Your athletic CV just hit ${crossedMilestone}%! ${getCvMessage(crossedMilestone)}`;
          bodyLong = `Your athletic CV is now ${crossedMilestone}% complete. `
            + getCvDetailMessage(crossedMilestone);
          matched = true;
        }
      }
    }
  }

  // Check 6: Training age milestones
  if (!matched) {
    const trainingAgeWeeks = snapshot.training_age_weeks as number;
    if (TRAINING_AGE_MILESTONES.includes(trainingAgeWeeks)) {
      const monthsEquiv = Math.round(trainingAgeWeeks / 4.33);
      const label = trainingAgeWeeks >= 52
        ? `${Math.round(trainingAgeWeeks / 52)} Year${trainingAgeWeeks >= 104 ? 's' : ''}`
        : `${trainingAgeWeeks} Weeks`;
      const alreadyRecorded = await hasRecentMotivationRec(athleteId, `${label} of Training`, db);
      if (!alreadyRecorded) {
        title = `${label} of Training!`;
        bodyShort = `You've been training for ${label.toLowerCase()}! Your journey is inspiring.`;
        bodyLong = `${label} of consistent training — that's a real achievement. `
          + `Training age is one of the strongest predictors of athletic development. `
          + `Every week you put in builds your foundation stronger. Keep going!`;
        matched = true;
      }
    }
  }

  if (!matched) {
    // No motivation rec needed
    return;
  }

  // 3. Build evidence
  const evidence: Record<string, unknown> = {
    streak_days: snapshot.streak_days,
    sessions_total: snapshot.sessions_total,
    training_age_weeks: snapshot.training_age_weeks,
    cv_completeness: snapshot.cv_completeness,
    trigger_event_type: event.event_type,
    is_new_pb: payload?.is_new_pb ?? false,
  };

  // 4. Build context
  const context: Record<string, unknown> = {
    streak_days: snapshot.streak_days,
    sessions_total: snapshot.sessions_total,
    training_age_weeks: snapshot.training_age_weeks,
    cv_completeness: snapshot.cv_completeness,
  };

  // 5. NO supersede for motivation recs — multiple can coexist

  // 6. Insert new recommendation
  const expiryHours = REC_EXPIRY_HOURS.MOTIVATION ?? 48;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const rec: RecommendationInsert = {
    athlete_id: athleteId,
    rec_type: 'MOTIVATION',
    priority: 4, // Always P4 (informational)
    title,
    body_short: bodyShort,
    body_long: bodyLong,
    confidence_score: 1.0, // Fact-based, no estimation
    evidence_basis: evidence,
    trigger_event_id: event.event_id,
    context,
    expires_at: expiresAt,
  };

  const { error } = await (db as any)
    .from('athlete_recommendations')
    .insert(rec);

  if (error) {
    console.error(`[RIE/Motivation] Insert failed for ${athleteId}:`, error.message);
    return;
  }

  console.log(`[RIE/Motivation] P4 "${title}" created for ${athleteId}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a motivation rec with similar title was already created in last 48h */
async function hasRecentMotivationRec(
  athleteId: string,
  titleFragment: string,
  db: ReturnType<typeof supabaseAdmin>
): Promise<boolean> {
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data } = await (db as any)
    .from('athlete_recommendations')
    .select('rec_id')
    .eq('athlete_id', athleteId)
    .eq('rec_type', 'MOTIVATION')
    .ilike('title', `%${titleFragment}%`)
    .gte('created_at', twoDaysAgo)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

function getStreakMessage(days: number): string {
  if (days >= 90) return 'Three months of daily commitment — you\'re in the top tier of dedication.';
  if (days >= 60) return 'Two months straight — your body and mind are adapting beautifully.';
  if (days >= 30) return 'A full month! Habits are forming and gains are compounding.';
  if (days >= 14) return 'Two weeks of consistency is where real change starts happening.';
  return 'A full week — the hardest part is starting, and you\'ve nailed it.';
}

function getSessionMessage(sessions: number): string {
  if (sessions >= 250) return 'You\'re a veteran now. Use that experience to train smarter, not just harder.';
  if (sessions >= 100) return 'Triple digits! You\'re building serious athletic capital.';
  if (sessions >= 50) return 'Half a century of sessions — your consistency is your superpower.';
  if (sessions >= 25) return 'Twenty-five sessions in the bank. You\'re building a strong foundation.';
  return 'The first ten are the hardest. You\'re officially on your way!';
}

function getCvMessage(pct: number): string {
  if (pct >= 100) return 'Your profile is complete!';
  if (pct >= 75) return 'Almost there — strong profile!';
  if (pct >= 50) return 'Halfway there — great progress!';
  return 'Great start — keep building!';
}

function getCvDetailMessage(pct: number): string {
  if (pct >= 75) {
    return 'This is an impressive athletic profile that showcases your abilities. '
      + 'Consider sharing it with coaches or scouts. Keep your benchmarks fresh with regular retests.';
  }
  if (pct >= 50) {
    return 'You\'re building a solid athletic profile. To push past 75%, focus on completing '
      + 'remaining assessments and maintaining consistent training logs.';
  }
  return 'You\'ve taken the first steps in building your athletic profile. '
    + 'Complete phone tests and log your training to see rapid progress.';
}
