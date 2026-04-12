/**
 * Readiness Recommendation Computer
 *
 * Generates readiness recommendations based on the athlete's current
 * wellness state, ACWR, and PHV growth stage.
 *
 * Decision matrix (first match wins):
 *   RED + mid_phv  → P1 "Rest Day — Growth Phase"
 *   RED            → P1 "Rest Day Recommended"
 *   AMBER + ACWR>1.3 → P1 "High Load + Low Readiness"
 *   AMBER          → P2 "Light Session Suggested"
 *   GREEN + mid_phv → P2 "Ready but Modified"
 *   GREEN          → P3 "Ready for High Intensity"
 *
 * Confidence levels:
 *   0.9 = recent checkin-based data
 *   0.7 = wearable-only (no checkin today)
 *   0.5 = stale data (> 24h since last checkin)
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getPlayerPHVStage } from '@/services/programs/phvCalculator';
import { supersedeExisting } from '../supersedeExisting';
import { REC_EXPIRY_HOURS, READINESS_STALE_HOURS } from '../constants';
// RAG migrated to Python LlamaIndex — graceful stubs (always return empty, fallback to static content)
const retrieveKnowledgeChunks = async (..._args: any[]): Promise<any[]> => [];
const generateAugmentedContent = async (..._args: any[]): Promise<{ body_short: string; body_long: string }> => ({ body_short: '', body_long: '' });
import type { AthleteEvent } from '../../events/types';
import type { RecPriority, RecommendationInsert } from '../types';

export async function computeReadinessRec(
  athleteId: string,
  event: AthleteEvent
): Promise<void> {
  const db = supabaseAdmin();

  // 1. Read latest snapshot (including CCRS fields when available)
  // Cast to any — CCRS columns not yet in generated types
  const { data: snapshot } = await (db as any)
    .from('athlete_snapshots')
    .select('readiness_rag, readiness_score, acwr, atl_7day, ctl_28day, dual_load_index, sleep_quality, last_checkin_at, ccrs, ccrs_confidence, ccrs_recommendation, ccrs_alert_flags, data_freshness')
    .eq('athlete_id', athleteId)
    .single();

  if (!snapshot) {
    console.log(`[RIE/Readiness] No snapshot for ${athleteId} — skipping`);
    return;
  }

  // 2. Check if athlete has training/match scheduled today
  const todayStr = new Date().toISOString().split('T')[0];
  const { data: todayTraining } = await db
    .from('calendar_events')
    .select('id')
    .eq('user_id', athleteId)
    .in('event_type', ['training', 'match', 'gym'])
    .gte('start_at', `${todayStr}T00:00:00`)
    .lte('start_at', `${todayStr}T23:59:59`)
    .limit(1);
  const hasTrainingToday = (todayTraining?.length ?? 0) > 0;

  // 4. Get PHV growth stage (may be null for adults or un-assessed athletes)
  const phv = await getPlayerPHVStage(athleteId);

  // 3. Determine confidence — prefer CCRS confidence when available
  const ccrsConfidence = snapshot.ccrs_confidence as string | null;
  const confidence = ccrsConfidence
    ? mapCCRSConfidence(ccrsConfidence)
    : computeConfidence(snapshot.last_checkin_at, event.event_type);

  // 4. Evaluate decision matrix
  const rag = snapshot.readiness_rag as string | null;
  const acwr = snapshot.acwr as number | null;
  const isMidPhv = phv?.phvStage === 'mid_phv';
  const loadingMultiplier = phv?.loadingMultiplier ?? 1.0;

  // Try to load CMS-managed confidence thresholds (non-blocking)
  try {
    const { getReadinessMatrixConfig } = await import("@/services/admin/performanceIntelligenceService");
    const matrixConfig = await getReadinessMatrixConfig();
    // Confidence thresholds are used in computeConfidence below — store for reference
    // (actual override of computeConfidence would require refactoring the function signature)
    void matrixConfig; // Config loaded into cache for future use
  } catch {
    // Continue with hardcoded defaults
  }

  let priority: RecPriority;
  let title: string;
  let bodyShort: string;
  let bodyLong: string;

  // CCRS-aware decision: use ccrs_recommendation when available for finer granularity
  const ccrsRec = snapshot.ccrs_recommendation as string | null;
  const ccrsScore = snapshot.ccrs as number | null;
  const ccrsAlertFlags = (snapshot.ccrs_alert_flags as string[] | null) ?? [];

  // CCRS BLOCKED overrides everything — hard safety cap (ACWR > 2.0 or extreme risk)
  if (ccrsRec === 'blocked') {
    priority = 1;
    title = hasTrainingToday ? 'Training Blocked — Recovery Required' : 'Full Recovery Day';
    bodyShort = hasTrainingToday
      ? 'Multiple risk factors detected. Skip training today — your body needs full recovery.'
      : 'Multiple risk indicators are elevated. Rest today and focus on recovery.';
    bodyLong = hasTrainingToday
      ? `Your composite readiness score is ${ccrsScore ?? 'very low'}/100 with critical flags: ${ccrsAlertFlags.join(', ') || 'multiple risk factors'}. Training is blocked until these indicators improve. Focus on sleep, hydration, and light movement only.`
      : `Your readiness score is ${ccrsScore ?? 'very low'}/100. No training today is the right call. Flags: ${ccrsAlertFlags.join(', ') || 'elevated risk'}. Prioritise full recovery.`;
  } else if (rag === 'RED' && isMidPhv) {
    priority = 1;
    title = hasTrainingToday ? 'Rest Day — Growth Phase' : 'Recovery Day — Growth Phase';
    bodyShort = hasTrainingToday
      ? 'Your body is recovering and growing. Take a full rest day today.'
      : 'Good call resting today. Your body is in a growth phase — prioritise sleep and nutrition.';
    bodyLong = hasTrainingToday
      ? `Your readiness is low and you're in a rapid growth phase. During this time your body needs extra recovery. Skip any high-intensity training today. Light stretching or a walk is fine. Your loading has been adjusted by ${Math.round((1 - loadingMultiplier) * 100)}%.`
      : `You have no training today — perfect timing. Your readiness is low and you're in a growth phase. Use today to sleep well, eat well, and let your body repair. Your loading multiplier is currently ${Math.round(loadingMultiplier * 100)}%.`;
  } else if (rag === 'RED') {
    priority = 1;
    title = hasTrainingToday ? 'Rest Day Recommended' : 'Good Day to Rest';
    bodyShort = hasTrainingToday
      ? 'Your body needs recovery today. Take it easy and focus on rest.'
      : 'No training today — your body will thank you. Focus on sleep and hydration.';
    bodyLong = hasTrainingToday
      ? `Your readiness score indicates fatigue or stress. A rest day will help you bounce back stronger. Focus on sleep, hydration, and light movement if anything.`
      : `Your readiness is low but you have no training scheduled — that's a good thing. Use today for full recovery: prioritise 8–9 hours of sleep, stay hydrated, and avoid any extra stress.`;
  } else if (rag === 'AMBER' && acwr !== null && acwr > 1.3) {
    if (hasTrainingToday) {
      priority = 1;
      title = 'High Load + Low Readiness';
      bodyShort = 'Your training load is high and readiness is below normal. Reduce intensity today.';
      bodyLong = `Your ACWR is ${acwr?.toFixed(2)} (above 1.3) and your readiness is amber. `
        + `This compound risk increases injury likelihood. `
        + `Cap today at light intensity and monitor how you feel.`;
    } else {
      priority = 2;
      title = 'Rest Day Helping You Recover';
      bodyShort = `Your load has been high (ACWR ${acwr?.toFixed(2)}) — today's rest is exactly what you need.`;
      bodyLong = `Your ACWR is ${acwr?.toFixed(2)} and readiness is amber, but you have no training today. `
        + `This is good — your body gets a chance to recover. Focus on sleep, nutrition, and light movement. `
        + `You should be in better shape for your next session.`;
    }
  } else if (rag === 'AMBER') {
    priority = 2;
    title = hasTrainingToday ? 'Light Session Suggested' : 'Moderate Day — Stay Active';
    bodyShort = hasTrainingToday
      ? 'You\'re not at your best today. Keep training light to moderate.'
      : 'No training today — some light movement like a walk will keep you feeling good.';
    bodyLong = hasTrainingToday
      ? `Your readiness is amber — not bad, but not great either. A lighter session will help you maintain consistency without overdoing it. Consider technical work or recovery-focused training.`
      : `Your readiness is amber and you have no training today. Consider a short walk or some light stretching to keep blood flowing without adding load.`;
  } else if (rag === 'GREEN' && isMidPhv) {
    priority = 2;
    title = 'Ready but Modified';
    bodyShort = `You're feeling good! Training adjusted for your growth phase.`;
    bodyLong = `Your readiness is green — great! However, you're in a growth spurt phase. `
      + `Your load has been automatically reduced by ${Math.round((1 - loadingMultiplier) * 100)}% `
      + `to protect your growing body. Focus on technique and speed rather than max effort.`;
  } else {
    // GREEN (default)
    priority = 3;
    title = hasTrainingToday ? 'Ready for High Intensity' : 'Ready — Rest Day Well Spent';
    bodyShort = hasTrainingToday
      ? 'You\'re in great shape today. Go for it!'
      : 'Your body is in great shape. Enjoy your rest day — you\'ll be ready to push hard next session.';
    bodyLong = hasTrainingToday
      ? `Your readiness is green and your load is manageable. This is a great day for high-intensity work, speed sessions, or competitive play.`
      : `Your readiness is green and load is under control. No training today — use it to stay fresh. You're in a good position heading into your next session.`;
  }

  // 5a. RAG augmentation (async, with fallback to static strings)
  let chunkIds: string[] = [];
  try {
    const phvStage = isMidPhv ? 'CIRCA' : (phv?.phvStage === 'post_phv' ? 'POST' : 'PRE');
    // Derive age group from snapshot — read DOB if available
    const { data: profileData } = await db
      .from('athlete_snapshots')
      .select('dob')
      .eq('athlete_id', athleteId)
      .single();

    let ageGroup = 'U17'; // default
    if (profileData?.dob) {
      const age = Math.floor((Date.now() - new Date(profileData.dob as string).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < 13) ageGroup = 'U13';
      else if (age < 15) ageGroup = 'U15';
      else if (age < 17) ageGroup = 'U17';
      else if (age < 19) ageGroup = 'U19';
      else ageGroup = 'ADULT';
    }

    const chunks = await retrieveKnowledgeChunks({
      rec_type: 'READINESS',
      phv_stage: phvStage,
      age_group: ageGroup,
      acwr: acwr,
      dual_load_index: snapshot.dual_load_index as number | null,
    });

    if (chunks.length > 0) {
      // Read full snapshot for generation context
      const { data: fullSnapshot } = await db
        .from('athlete_snapshots')
        .select('*')
        .eq('athlete_id', athleteId)
        .single();

      const augmented = await generateAugmentedContent(
        'READINESS', title, priority,
        (fullSnapshot ?? snapshot) as Record<string, unknown>,
        phv, chunks
      );
      bodyShort = augmented.body_short;
      bodyLong = augmented.body_long;
      chunkIds = chunks.map(c => c.chunk_id);
      console.log(`[RIE/Readiness] RAG augmented with ${chunks.length} chunks for ${athleteId}`);
    }
  } catch (err) {
    console.warn(`[RIE/Readiness] RAG augmentation failed, using static content:`, (err as Error).message);
  }

  // 5. Build evidence
  const evidence: Record<string, unknown> = {
    readiness_rag: rag,
    readiness_score: snapshot.readiness_score,
    acwr: acwr,
    phv_stage: phv?.phvStage ?? null,
    loading_multiplier: loadingMultiplier,
    sleep_quality: snapshot.sleep_quality,
    contributing_factors: buildContributingFactors(snapshot, phv),
  };

  // 6. Build snapshot context at creation time
  const context: Record<string, unknown> = {
    readiness_score: snapshot.readiness_score,
    readiness_rag: rag,
    acwr: acwr,
    atl_7day: snapshot.atl_7day,
    ctl_28day: snapshot.ctl_28day,
    dual_load_index: snapshot.dual_load_index,
  };

  // 7. Supersede existing READINESS recs
  await supersedeExisting(athleteId, 'READINESS');

  // 7b. Dedup guard — skip if an identical rec was just created (race condition from parallel events)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recentDup } = await (db as any)
    .from('athlete_recommendations')
    .select('rec_id')
    .eq('athlete_id', athleteId)
    .eq('rec_type', 'READINESS')
    .eq('status', 'PENDING')
    .eq('title', title)
    .gte('created_at', fiveMinAgo)
    .limit(1);
  if (recentDup && recentDup.length > 0) {
    console.log(`[RIE/Readiness] Dedup: skipping "${title}" for ${athleteId} (recent duplicate exists)`);
    return;
  }

  // 8. Insert new recommendation
  const expiryHours = REC_EXPIRY_HOURS.READINESS ?? 24;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const rec: RecommendationInsert = {
    athlete_id: athleteId,
    rec_type: 'READINESS',
    priority,
    title,
    body_short: bodyShort,
    body_long: bodyLong,
    confidence_score: confidence,
    evidence_basis: evidence,
    trigger_event_id: event.event_id,
    context,
    retrieved_chunk_ids: chunkIds,
    expires_at: expiresAt,
  };

  const { error } = await (db as any)
    .from('athlete_recommendations')
    .insert(rec);

  if (error) {
    console.error(`[RIE/Readiness] Insert failed for ${athleteId}:`, error.message);
    return;
  }

  console.log(`[RIE/Readiness] P${priority} "${title}" created for ${athleteId} (confidence: ${confidence})`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeConfidence(lastCheckinAt: string | null, eventType: string): number {
  if (!lastCheckinAt) return 0.5;

  const hoursSinceCheckin = (Date.now() - new Date(lastCheckinAt).getTime()) / (1000 * 60 * 60);

  if (hoursSinceCheckin > READINESS_STALE_HOURS) return 0.5;

  // If the triggering event is a wearable/vital (not a checkin), and
  // the last checkin is > 12h ago, confidence is moderate
  const wearableEventTypes = ['VITAL_READING', 'WEARABLE_SYNC', 'SLEEP_RECORD'];
  if (wearableEventTypes.includes(eventType) && hoursSinceCheckin > 12) return 0.7;

  return 0.9;
}

/**
 * Map CCRS 5-level confidence to a 0-1 score for recommendation confidence.
 */
function mapCCRSConfidence(ccrsConfidence: string): number {
  switch (ccrsConfidence) {
    case 'very_high': return 0.95;
    case 'high': return 0.85;
    case 'medium': return 0.70;
    case 'low': return 0.55;
    case 'estimated': return 0.40;
    default: return 0.50;
  }
}

function buildContributingFactors(
  snapshot: Record<string, unknown>,
  phv: { phvStage: string; loadingMultiplier: number } | null
): string[] {
  const factors: string[] = [];

  const rag = snapshot.readiness_rag as string | null;
  if (rag === 'RED') factors.push('Low readiness (RED)');
  else if (rag === 'AMBER') factors.push('Moderate readiness (AMBER)');
  else if (rag === 'GREEN') factors.push('Good readiness (GREEN)');

  const acwr = snapshot.acwr as number | null;
  if (acwr !== null) {
    if (acwr > 1.5) factors.push(`Training spike (ACWR ${acwr.toFixed(2)})`);
    else if (acwr > 1.3) factors.push(`Load building (ACWR ${acwr.toFixed(2)})`);
    else if (acwr < 0.8) factors.push(`Detraining risk (ACWR ${acwr.toFixed(2)})`);
  }

  if (phv?.phvStage === 'mid_phv') {
    factors.push('In growth spurt phase (mid-PHV)');
  }

  const sleepQuality = snapshot.sleep_quality as number | null;
  if (sleepQuality !== null && sleepQuality < 5) {
    factors.push('Poor sleep quality');
  }

  return factors;
}
