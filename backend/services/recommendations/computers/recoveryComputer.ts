/**
 * Recovery Recommendation Computer
 *
 * Generates recovery-related recommendations based on recent sessions,
 * sleep quality, wellness trends, and PHV growth stage.
 *
 * Decision matrix (first match wins):
 *   Post-match (<6h) + mid_phv     → P1 "Match Recovery — Growth Phase"
 *   Post-match (<6h)               → P2 "Post-Match Recovery Protocol"
 *   Hard session + poor sleep      → P2 "Recovery Needed — Poor Sleep"
 *   Hard session (<4h, RPE≥8)      → P3 "Recovery Window Open"
 *   wellness_trend DECLINING 3+d   → P2 "Recovery Trend Alert"
 *   Well recovered (GREEN+sleep>7) → P4 "Well Recovered" (informational)
 *   Otherwise                      → No rec
 *
 * Confidence levels:
 *   0.85 = session-triggered (fresh training data)
 *   0.70 = sleep-triggered (wearable/checkin)
 *   0.50 = checkin-only (no session context)
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getPlayerPHVStage } from '@/services/programs/phvCalculator';
import { supersedeExisting } from '../supersedeExisting';
import { REC_EXPIRY_HOURS } from '../constants';
import type { AthleteEvent } from '../../events/types';
import type { RecPriority, RecommendationInsert } from '../types';

export async function computeRecoveryRec(
  athleteId: string,
  event: AthleteEvent
): Promise<void> {
  const db = supabaseAdmin();

  // 1. Read latest snapshot
  const { data: snapshot } = await db
    .from('athlete_snapshots')
    .select('readiness_rag, readiness_score, acwr, sleep_quality, wellness_trend, last_session_at, athletic_load_7day')
    .eq('athlete_id', athleteId)
    .single();

  if (!snapshot) {
    console.log(`[RIE/Recovery] No snapshot for ${athleteId} — skipping`);
    return;
  }

  // 2. Get PHV growth stage
  const phv = await getPlayerPHVStage(athleteId);
  const isMidPhv = phv?.phvStage === 'mid_phv';
  const loadingMultiplier = phv?.loadingMultiplier ?? 1.0;

  // 3. Check for recent session context
  const lastSessionAt = snapshot.last_session_at as string | null;
  const hoursSinceSession = lastSessionAt
    ? (Date.now() - new Date(lastSessionAt).getTime()) / (1000 * 60 * 60)
    : null;

  // 4. Get latest SESSION_LOG or COMPETITION_RESULT event for RPE/type context
  const { data: recentSessionEvent } = await (db as any)
    .from('athlete_events')
    .select('event_type, payload')
    .eq('athlete_id', athleteId)
    .in('event_type', ['SESSION_LOG', 'COMPETITION_RESULT'])
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const isPostMatch = recentSessionEvent?.event_type === 'COMPETITION_RESULT'
    || recentSessionEvent?.payload?.session_type === 'MATCH';
  const sessionRpe = recentSessionEvent?.payload?.session_rpe as number | null;

  // 5. Read snapshot fields
  const sleepQuality = snapshot.sleep_quality as number | null;
  const wellnessTrend = snapshot.wellness_trend as string | null;
  const readinessRag = snapshot.readiness_rag as string | null;

  // 6. Determine confidence
  let confidence = 0.5;
  if (event.event_type === 'SESSION_LOG' || event.event_type === 'COMPETITION_RESULT') {
    confidence = 0.85;
  } else if (event.event_type === 'SLEEP_RECORD') {
    confidence = 0.7;
  }

  // 7. Evaluate decision matrix (first match wins)
  let priority: RecPriority | null = null;
  let title = '';
  let bodyShort = '';
  let bodyLong = '';

  if (isPostMatch && hoursSinceSession !== null && hoursSinceSession < 6 && isMidPhv) {
    priority = 1;
    title = 'Match Recovery — Growth Phase';
    bodyShort = 'Post-match recovery is critical during your growth phase. Full rest today.';
    bodyLong = `You played a match within the last ${Math.round(hoursSinceSession)} hours and you're `
      + `in a rapid growth phase. Your body needs extra recovery time. `
      + `Focus on: hydration, nutrition (protein within 30 min), sleep (9+ hours), `
      + `and avoid any high-intensity activity for at least 48 hours. `
      + `Your load has been adjusted by ${Math.round((1 - loadingMultiplier) * 100)}%.`;
  } else if (isPostMatch && hoursSinceSession !== null && hoursSinceSession < 6) {
    priority = 2;
    title = 'Post-Match Recovery Protocol';
    bodyShort = 'Match day recovery is key. Hydrate, refuel, and rest well tonight.';
    bodyLong = `You completed a match ${Math.round(hoursSinceSession)} hours ago. `
      + `The next 24 hours are your recovery window. Focus on: `
      + `protein-rich meal within 30 minutes, 2-3L water, light stretching, and 8+ hours sleep. `
      + `Avoid hard training for at least 24 hours.`;
  } else if (
    hoursSinceSession !== null && hoursSinceSession < 4
    && sessionRpe !== null && sessionRpe >= 8
    && sleepQuality !== null && sleepQuality < 5
  ) {
    priority = 2;
    title = 'Recovery Needed — Poor Sleep';
    bodyShort = 'You trained hard and slept poorly. Prioritize rest and recovery today.';
    bodyLong = `Your last session was tough (RPE ${sessionRpe}/10) and your sleep quality is low `
      + `(${sleepQuality}/10). This combination slows recovery significantly. `
      + `Consider a rest day or very light technical work only. `
      + `Aim for 9+ hours of sleep tonight.`;
  } else if (
    hoursSinceSession !== null && hoursSinceSession < 4
    && sessionRpe !== null && sessionRpe >= 8
  ) {
    priority = 3;
    title = 'Recovery Window Open';
    bodyShort = 'Great effort! Your recovery window is open — refuel and hydrate now.';
    bodyLong = `Your last session was high intensity (RPE ${sessionRpe}/10) about `
      + `${Math.round(hoursSinceSession)} hours ago. The first few hours post-session are `
      + `critical for recovery. Eat a protein-rich meal, stay hydrated, and consider `
      + `light stretching or foam rolling.`;
  } else if (wellnessTrend === 'DECLINING') {
    priority = 2;
    title = 'Recovery Trend Alert';
    bodyShort = 'Your wellness has been declining. Your body is telling you to slow down.';
    bodyLong = `Your wellness scores have been trending down over the past several days. `
      + `This could be a sign of accumulated fatigue, stress, or inadequate recovery. `
      + `Consider reducing training intensity this week and focusing on sleep, `
      + `nutrition, and stress management.`;
  } else if (
    readinessRag === 'GREEN'
    && sleepQuality !== null && sleepQuality > 7
    && (hoursSinceSession === null || hoursSinceSession > 24)
  ) {
    priority = 4;
    title = 'Well Recovered';
    bodyShort = 'You\'re fully recovered and ready to go! Great job taking care of your body.';
    bodyLong = `Your readiness is green, sleep quality is great (${sleepQuality}/10), `
      + `and you've had adequate rest time. You're in an ideal state for high-intensity `
      + `training or competition. Make the most of it!`;
  } else {
    // No recovery rec needed
    return;
  }

  // 8. Build evidence
  const evidence: Record<string, unknown> = {
    readiness_rag: readinessRag,
    sleep_quality: sleepQuality,
    wellness_trend: wellnessTrend,
    hours_since_session: hoursSinceSession ? Math.round(hoursSinceSession * 10) / 10 : null,
    session_rpe: sessionRpe,
    is_post_match: isPostMatch,
    phv_stage: phv?.phvStage ?? null,
    loading_multiplier: loadingMultiplier,
  };

  // 9. Build context
  const context: Record<string, unknown> = {
    readiness_rag: readinessRag,
    sleep_quality: sleepQuality,
    wellness_trend: wellnessTrend,
    acwr: snapshot.acwr,
    athletic_load_7day: snapshot.athletic_load_7day,
    last_session_at: lastSessionAt,
  };

  // 10. Supersede existing RECOVERY recs
  await supersedeExisting(athleteId, 'RECOVERY');

  // 11. Insert new recommendation
  const expiryHours = REC_EXPIRY_HOURS.RECOVERY ?? 12;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const rec: RecommendationInsert = {
    athlete_id: athleteId,
    rec_type: 'RECOVERY',
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
    console.error(`[RIE/Recovery] Insert failed for ${athleteId}:`, error.message);
    return;
  }

  console.log(`[RIE/Recovery] P${priority} "${title}" created for ${athleteId} (confidence: ${confidence})`);
}
