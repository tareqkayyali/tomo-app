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
import { retrieveKnowledgeChunks } from '../rag/ragRetriever';
import { generateAugmentedContent } from '../rag/ragGenerator';
import type { AthleteEvent } from '../../events/types';
import type { RecPriority, RecommendationInsert } from '../types';

export async function computeReadinessRec(
  athleteId: string,
  event: AthleteEvent
): Promise<void> {
  const db = supabaseAdmin();

  // 1. Read latest snapshot
  const { data: snapshot } = await db
    .from('athlete_snapshots')
    .select('readiness_rag, readiness_score, acwr, atl_7day, ctl_28day, dual_load_index, sleep_quality, last_checkin_at')
    .eq('athlete_id', athleteId)
    .single();

  if (!snapshot) {
    console.log(`[RIE/Readiness] No snapshot for ${athleteId} — skipping`);
    return;
  }

  // 2. Get PHV growth stage (may be null for adults or un-assessed athletes)
  const phv = await getPlayerPHVStage(athleteId);

  // 3. Determine confidence based on data freshness
  const confidence = computeConfidence(snapshot.last_checkin_at, event.event_type);

  // 4. Evaluate decision matrix
  const rag = snapshot.readiness_rag as string | null;
  const acwr = snapshot.acwr as number | null;
  const isMidPhv = phv?.phvStage === 'mid_phv';
  const loadingMultiplier = phv?.loadingMultiplier ?? 1.0;

  let priority: RecPriority;
  let title: string;
  let bodyShort: string;
  let bodyLong: string;

  if (rag === 'RED' && isMidPhv) {
    priority = 1;
    title = 'Rest Day — Growth Phase';
    bodyShort = 'Your body is recovering and growing. Take a full rest day today.';
    bodyLong = `Your readiness is low and you're in a rapid growth phase. `
      + `During this time your body needs extra recovery. Skip any high-intensity training today. `
      + `Light stretching or a walk is fine. Your loading has been adjusted by ${Math.round((1 - loadingMultiplier) * 100)}%.`;
  } else if (rag === 'RED') {
    priority = 1;
    title = 'Rest Day Recommended';
    bodyShort = 'Your body needs recovery today. Take it easy and focus on rest.';
    bodyLong = `Your readiness score indicates fatigue or stress. `
      + `A rest day will help you bounce back stronger. `
      + `Focus on sleep, hydration, and light movement if anything.`;
  } else if (rag === 'AMBER' && acwr !== null && acwr > 1.3) {
    priority = 1;
    title = 'High Load + Low Readiness';
    bodyShort = 'Your training load is high and readiness is below normal. Reduce intensity today.';
    bodyLong = `Your ACWR is ${acwr?.toFixed(2)} (above 1.3) and your readiness is amber. `
      + `This compound risk increases injury likelihood. `
      + `Cap today at light intensity and monitor how you feel.`;
  } else if (rag === 'AMBER') {
    priority = 2;
    title = 'Light Session Suggested';
    bodyShort = 'You\'re not at your best today. Keep training light to moderate.';
    bodyLong = `Your readiness is amber — not bad, but not great either. `
      + `A lighter session will help you maintain consistency without overdoing it. `
      + `Consider technical work or recovery-focused training.`;
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
    title = 'Ready for High Intensity';
    bodyShort = 'You\'re in great shape today. Go for it!';
    bodyLong = `Your readiness is green and your load is manageable. `
      + `This is a great day for high-intensity work, speed sessions, or competitive play.`;
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
