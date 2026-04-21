/**
 * Load Warning Recommendation Computer
 *
 * Generates load-related recommendations based on ACWR, dual load index,
 * and PHV growth stage. Detects training spikes, combined overload, and
 * detraining risk.
 *
 * Decision matrix (first match wins):
 *   mid_phv + ACWR > 1.2  → P1 "Growth Phase Load Alert"
 *   ACWR > 1.5            → P1 "Training Spike Detected"
 *   dual_load > 80        → P2 "Combined Load High"
 *   ACWR > 1.3            → P2 "Load Building Quickly"
 *   ACWR < 0.8 + history  → P3 "Detraining Risk"
 *   Safe zone             → No rec created
 *
 * Confidence levels:
 *   0.85 = ≥14 days of load data
 *   0.65 = 7-13 days of data
 *   0.45 = <7 days of data
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getPlayerPHVStage } from '@/services/programs/phvCalculator';
import { supersedeExisting } from '../supersedeExisting';
import { REC_EXPIRY_HOURS } from '../constants';
// RAG migrated to Python LlamaIndex — graceful stubs (always return empty, fallback to static content)
const retrieveKnowledgeChunks = async (..._args: any[]): Promise<any[]> => [];
const generateAugmentedContent = async (..._args: any[]): Promise<{ body_short: string; body_long: string }> => ({ body_short: '', body_long: '' });
import type { AthleteEvent } from '../../events/types';
import type { RecPriority, RecommendationInsert } from '../types';
import { insertRecommendationWithNotify } from '../notifyRec';

export async function computeLoadWarningRec(
  athleteId: string,
  event: AthleteEvent
): Promise<void> {
  const db = supabaseAdmin();

  // 1. Read latest snapshot
  // athlete_mode not yet in generated types — use (db as any)
  const { data: snapshot } = await (db as any)
    .from('athlete_snapshots')
    .select('acwr, atl_7day, ctl_28day, dual_load_index, injury_risk_flag, athletic_load_7day, academic_load_7day, athlete_mode, ccrs_alert_flags, ccrs, ccrs_recommendation')
    .eq('athlete_id', athleteId)
    .single();

  if (!snapshot) {
    console.log(`[RIE/LoadWarning] No snapshot for ${athleteId} — skipping`);
    return;
  }

  const acwr = snapshot.acwr as number | null;
  const dualLoad = snapshot.dual_load_index as number | null;
  const ctl28 = snapshot.ctl_28day as number | null;
  const atl7 = snapshot.atl_7day as number | null;

  // If no ACWR data at all, skip
  if (acwr === null && dualLoad === null) {
    console.log(`[RIE/LoadWarning] No load data for ${athleteId} — skipping`);
    return;
  }

  // 2. Get PHV growth stage
  const phv = await getPlayerPHVStage(athleteId);
  const isMidPhv = phv?.phvStage === 'mid_phv';
  const loadingMultiplier = phv?.loadingMultiplier ?? 1.0;

  // 3. Determine confidence based on load data history
  const confidence = await computeConfidence(athleteId, db);

  // 3b. Mode-aware thresholds — rest mode is more conservative
  const athleteMode = (snapshot as Record<string, unknown>).athlete_mode as string | null;
  const isRestMode = athleteMode === 'rest';
  const acwrP1Threshold = isRestMode ? 1.2 : 1.5;
  const acwrP2Threshold = isRestMode ? 1.1 : 1.3;
  const phvAcwrThreshold = isRestMode ? 1.0 : 1.2;
  const dualLoadThreshold = isRestMode ? 65 : 80;

  // 4. Evaluate decision matrix (first match wins)
  let priority: RecPriority | null = null;
  let title = '';
  let bodyShort = '';
  let bodyLong = '';

  // CCRS ACWR_BLOCKED flag — ACWR > 2.0 hard cap from cascading readiness formula
  const ccrsAlertFlags = ((snapshot as Record<string, unknown>).ccrs_alert_flags as string[] | null) ?? [];
  const ccrsScore = (snapshot as Record<string, unknown>).ccrs as number | null;
  if (ccrsAlertFlags.includes('ACWR_BLOCKED')) {
    priority = 1;
    title = 'Extreme Load — Training Blocked';
    bodyShort = 'Your training load ratio is critically high. All high-intensity training is blocked until it drops.';
    bodyLong = `Your ACWR is ${acwr?.toFixed(2) ?? 'critically high'} — well above the safe ceiling. `
      + `Your composite readiness score is capped at ${ccrsScore ?? 40}/100. `
      + `This level of training spike has a very high injury risk. `
      + `Only light movement, stretching, or complete rest until your load normalises.`;
  } else if (isMidPhv && acwr !== null && acwr > phvAcwrThreshold) {
    // Lower threshold during growth spurt
    priority = 1;
    title = 'Growth Phase Load Alert';
    bodyShort = 'Your training load is high for your growth phase. Reduce intensity today.';
    bodyLong = `Your ACWR is ${acwr.toFixed(2)} which exceeds the safe threshold of ${phvAcwrThreshold} `
      + `during your growth spurt. Young athletes in rapid growth are more vulnerable to `
      + `overuse injuries. Your load should be reduced by ${Math.round((1 - loadingMultiplier) * 100)}%. `
      + `Focus on skill work and avoid maximal efforts.`;
  } else if (acwr !== null && acwr > acwrP1Threshold) {
    priority = 1;
    title = 'Training Spike Detected';
    bodyShort = 'Your recent training load has spiked. High injury risk — reduce immediately.';
    bodyLong = `Your ACWR is ${acwr.toFixed(2)} (danger zone is above ${acwrP1Threshold}). `
      + `This means your recent training is significantly higher than your body is used to. `
      + `Research shows this dramatically increases injury risk. `
      + `Reduce training volume and intensity over the next 48 hours.`;
  } else if (dualLoad !== null && dualLoad > dualLoadThreshold) {
    priority = 2;
    title = 'Combined Load High';
    bodyShort = 'Your athletic + academic load is high. Balance is key this week.';
    bodyLong = `Your dual load index is ${dualLoad}/100 — that's a lot on your plate. `
      + `Athletic load: ${snapshot.athletic_load_7day ?? 'N/A'} AU, `
      + `Academic load: ${snapshot.academic_load_7day ?? 'N/A'} AU. `
      + `Consider reducing training volume or speaking with your coach about load management.`;
  } else if (acwr !== null && acwr > acwrP2Threshold) {
    priority = 2;
    title = 'Load Building Quickly';
    bodyShort = 'Your training load is climbing. Stay aware and don\'t push too hard.';
    bodyLong = `Your ACWR is ${acwr.toFixed(2)} (amber zone is ${acwrP2Threshold}–${acwrP1Threshold}). `
      + `You've been training harder than your recent average. `
      + `This isn't dangerous yet, but keep monitoring. `
      + `If you feel any soreness or fatigue, take it easier tomorrow.`;
  } else if (acwr !== null && acwr < 0.8 && ctl28 !== null && ctl28 > 0) {
    // Only warn about detraining if athlete has training history
    priority = 3;
    title = 'Detraining Risk';
    bodyShort = 'Your training has dropped below your usual level. Stay consistent!';
    bodyLong = `Your ACWR is ${acwr.toFixed(2)} (below the 0.8 safe zone floor). `
      + `This means you're training less than your body expects. `
      + `While rest is important, too much time off can lead to fitness loss. `
      + `Try to maintain at least moderate activity to keep your base.`;
  } else {
    // Safe zone — no recommendation needed
    return;
  }

  // 5a. RAG augmentation (async, with fallback to static strings)
  let chunkIds: string[] = [];
  try {
    const phvStage = isMidPhv ? 'CIRCA' : (phv?.phvStage === 'post_phv' ? 'POST' : 'PRE');
    const { data: profileData } = await db
      .from('athlete_snapshots')
      .select('dob')
      .eq('athlete_id', athleteId)
      .single();

    let ageGroup = 'U17';
    if (profileData?.dob) {
      const age = Math.floor((Date.now() - new Date(profileData.dob as string).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < 13) ageGroup = 'U13';
      else if (age < 15) ageGroup = 'U15';
      else if (age < 17) ageGroup = 'U17';
      else if (age < 19) ageGroup = 'U19';
      else ageGroup = 'ADULT';
    }

    const chunks = await retrieveKnowledgeChunks({
      rec_type: 'LOAD_WARNING',
      phv_stage: phvStage,
      age_group: ageGroup,
      acwr: acwr,
      dual_load_index: dualLoad,
    });

    if (chunks.length > 0) {
      const { data: fullSnapshot } = await db
        .from('athlete_snapshots')
        .select('*')
        .eq('athlete_id', athleteId)
        .single();

      const augmented = await generateAugmentedContent(
        'LOAD_WARNING', title, priority!,
        (fullSnapshot ?? snapshot) as Record<string, unknown>,
        phv, chunks
      );
      bodyShort = augmented.body_short;
      bodyLong = augmented.body_long;
      chunkIds = chunks.map(c => c.chunk_id);
      console.log(`[RIE/LoadWarning] RAG augmented with ${chunks.length} chunks for ${athleteId}`);
    }
  } catch (err) {
    console.warn(`[RIE/LoadWarning] RAG augmentation failed, using static content:`, (err as Error).message);
  }

  // 5. Build evidence
  const evidence: Record<string, unknown> = {
    acwr,
    atl_7day: atl7,
    ctl_28day: ctl28,
    dual_load_index: dualLoad,
    injury_risk_flag: snapshot.injury_risk_flag,
    phv_stage: phv?.phvStage ?? null,
    loading_multiplier: loadingMultiplier,
    contributing_factors: buildContributingFactors(snapshot, phv),
    athlete_mode: athleteMode,
  };

  // 6. Build snapshot context
  const context: Record<string, unknown> = {
    acwr,
    atl_7day: atl7,
    ctl_28day: ctl28,
    dual_load_index: dualLoad,
    athletic_load_7day: snapshot.athletic_load_7day,
    academic_load_7day: snapshot.academic_load_7day,
  };

  // 7. Supersede existing LOAD_WARNING recs
  await supersedeExisting(athleteId, 'LOAD_WARNING');

  // 8. Insert new recommendation
  const expiryHours = REC_EXPIRY_HOURS.LOAD_WARNING ?? 48;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const rec: RecommendationInsert = {
    athlete_id: athleteId,
    rec_type: 'LOAD_WARNING',
    priority: priority!,
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

  const insertedId = await insertRecommendationWithNotify(db as any, rec);

  if (!insertedId) {
    console.error(`[RIE/LoadWarning] Insert failed for ${athleteId}`);
    return;
  }

  console.log(`[RIE/LoadWarning] P${priority} "${title}" created for ${athleteId} (confidence: ${confidence})`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function computeConfidence(athleteId: string, db: ReturnType<typeof supabaseAdmin>): Promise<number> {
  // Count days of load data in the last 28 days
  const twentyEightDaysAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const { count } = await db
    .from('athlete_daily_load')
    .select('*', { count: 'exact', head: true })
    .eq('athlete_id', athleteId)
    .gte('load_date', twentyEightDaysAgo);

  const days = count ?? 0;

  if (days >= 14) return 0.85;
  if (days >= 7) return 0.65;
  return 0.45;
}

function buildContributingFactors(
  snapshot: Record<string, unknown>,
  phv: { phvStage: string; loadingMultiplier: number } | null
): string[] {
  const factors: string[] = [];
  const acwr = snapshot.acwr as number | null;
  const dualLoad = snapshot.dual_load_index as number | null;

  if (acwr !== null) {
    if (acwr > 1.5) factors.push(`ACWR spike at ${acwr.toFixed(2)} (danger zone)`);
    else if (acwr > 1.3) factors.push(`ACWR elevated at ${acwr.toFixed(2)} (amber zone)`);
    else if (acwr < 0.8) factors.push(`ACWR low at ${acwr.toFixed(2)} (detraining risk)`);
  }

  if (dualLoad !== null && dualLoad > 80) {
    factors.push(`High combined load (${dualLoad}/100)`);
  }

  if (phv?.phvStage === 'mid_phv') {
    factors.push('In growth spurt — thresholds lowered for safety');
  }

  const injuryFlag = snapshot.injury_risk_flag as string | null;
  if (injuryFlag === 'RED') {
    factors.push('Injury risk flag is RED');
  } else if (injuryFlag === 'AMBER') {
    factors.push('Injury risk flag is AMBER');
  }

  return factors;
}
