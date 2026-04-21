/**
 * Triangle Alert Recommendation Computer
 *
 * Generates stakeholder alignment recommendations based on coach assessments,
 * parent input, and triangle flags. Some recs are coach-only visibility.
 *
 * Decision matrix (first match wins):
 *   TRIANGLE_FLAG severity=HIGH         → P1 "Triangle Alert — Needs Attention"
 *   wellness_trend=DECLINING + ACWR>1.3 → P2 "Load-Wellness Mismatch"
 *   Parent input >3 in 3d               → P3 "Parent Engagement High" (coach-only)
 *   coachability_index <4.0 declining   → P3 "Coachability Trend Declining" (coach-only)
 *   dual_load_index >85                 → P2 "Impossible Week Detected"
 *   Otherwise                           → No rec
 *
 * Confidence: 0.7 (pattern-based)
 * Expiry: 72h
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { supersedeExisting } from '../supersedeExisting';
import { REC_EXPIRY_HOURS } from '../constants';
import type { AthleteEvent } from '../../events/types';
import type { RecPriority, RecommendationInsert } from '../types';
import { insertRecommendationWithNotify } from '../notifyRec';

export async function computeTriangleAlertRec(
  athleteId: string,
  event: AthleteEvent
): Promise<void> {
  const db = supabaseAdmin();

  // 1. Read latest snapshot
  const { data: snapshot } = await db
    .from('athlete_snapshots')
    .select('triangle_rag, wellness_trend, dual_load_index, acwr, coachability_index, readiness_rag')
    .eq('athlete_id', athleteId)
    .single();

  if (!snapshot) {
    console.log(`[RIE/TriangleAlert] No snapshot for ${athleteId} — skipping`);
    return;
  }

  // 2. Extract event payload
  const payload = event.payload as Record<string, unknown>;
  const flagSeverity = payload?.severity as string | undefined;
  const flagType = payload?.flag_type as string | undefined;
  const flagDescription = payload?.description as string | undefined;

  // 3. Count recent parent inputs (last 3 days)
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { count: parentInputCount } = await (db as any)
    .from('athlete_events')
    .select('*', { count: 'exact', head: true })
    .eq('athlete_id', athleteId)
    .eq('event_type', 'PARENT_INPUT')
    .gte('occurred_at', threeDaysAgo);

  // 4. Read snapshot fields
  const wellnessTrend = snapshot.wellness_trend as string | null;
  const acwr = snapshot.acwr as number | null;
  const dualLoad = snapshot.dual_load_index as number | null;
  const coachabilityIndex = snapshot.coachability_index as number | null;

  const confidence = 0.7;

  // 5. Evaluate decision matrix (first match wins)
  let priority: RecPriority | null = null;
  let title = '';
  let bodyShort = '';
  let bodyLong = '';
  let visibleToAthlete = true;
  let visibleToCoach = true;
  let visibleToParent = true;

  if (event.event_type === 'TRIANGLE_FLAG' && flagSeverity === 'HIGH') {
    priority = 1;
    title = 'Triangle Alert — Needs Attention';
    bodyShort = 'A high-priority concern has been flagged. Action needed from the support team.';
    bodyLong = `A ${flagType ?? 'concern'} flag has been raised with HIGH severity. `
      + (flagDescription ? `Details: "${flagDescription}". ` : '')
      + `This requires attention from the athlete's support triangle (athlete, coach, parent). `
      + `Consider scheduling a check-in conversation to align on next steps. `
      + `The athlete's wellbeing should be the top priority.`;
  } else if (wellnessTrend === 'DECLINING' && acwr !== null && acwr > 1.3) {
    priority = 2;
    title = 'Load-Wellness Mismatch';
    bodyShort = 'Training load is climbing while wellness is declining. This needs monitoring.';
    bodyLong = `The athlete's wellness trend is declining while their ACWR is elevated at ${acwr.toFixed(2)}. `
      + `This mismatch — pushing harder while feeling worse — is a classic overtraining signal. `
      + `The coach should consider reducing load and the support team should check in on `
      + `sleep, stress, and overall wellbeing.`;
  } else if ((parentInputCount ?? 0) > 3) {
    // Coach-only visibility
    priority = 3;
    title = 'Parent Engagement High';
    bodyShort = `${parentInputCount} parent inputs in the last 3 days. Consider a check-in.`;
    bodyLong = `There have been ${parentInputCount} parent inputs in the past 3 days, which is `
      + `higher than usual. This could indicate concerns about the athlete's wellbeing, `
      + `schedule conflicts, or academic pressure. Consider reaching out to the parent `
      + `for a brief alignment conversation.`;
    visibleToAthlete = false;
    visibleToParent = false;
  } else if (coachabilityIndex !== null && coachabilityIndex < 4.0) {
    // Check if it's declining by looking at previous recs
    const prevCoachability = await getPreviousCoachability(athleteId, db);
    const isDeclining = prevCoachability !== null && coachabilityIndex < prevCoachability;

    if (isDeclining) {
      // Coach-only visibility
      priority = 3;
      title = 'Coachability Trend Declining';
      bodyShort = `Coachability index is ${coachabilityIndex.toFixed(1)} and declining. May need a conversation.`;
      bodyLong = `The athlete's coachability index has dropped to ${coachabilityIndex.toFixed(1)}/10 `
        + `(previous: ${prevCoachability!.toFixed(1)}/10). A declining coachability trend `
        + `can indicate disengagement, frustration, or external stressors. `
        + `Consider a 1:1 conversation to understand what's going on and how to re-engage.`;
      visibleToAthlete = false;
      visibleToParent = false;
    }
  }

  // Fallback: extreme dual load
  if (!priority && dualLoad !== null && dualLoad > 85) {
    priority = 2;
    title = 'Impossible Week Detected';
    bodyShort = 'Combined academic + athletic load is extremely high. Something needs to give.';
    bodyLong = `The athlete's dual load index is ${dualLoad}/100 — this is an "impossible week" where `
      + `both academic and athletic demands are at extreme levels. `
      + `The support triangle should coordinate: can any training be reduced? `
      + `Can academic deadlines be adjusted? The athlete needs support, not just instruction.`;
  }

  if (!priority) {
    // No triangle alert rec needed
    return;
  }

  // 6. Build evidence
  const evidence: Record<string, unknown> = {
    triangle_rag: snapshot.triangle_rag,
    wellness_trend: wellnessTrend,
    acwr,
    dual_load_index: dualLoad,
    coachability_index: coachabilityIndex,
    parent_input_count_3d: parentInputCount ?? 0,
    flag_severity: flagSeverity,
    flag_type: flagType,
    flag_description: flagDescription,
    readiness_rag: snapshot.readiness_rag,
  };

  // 7. Build context
  const context: Record<string, unknown> = {
    triangle_rag: snapshot.triangle_rag,
    wellness_trend: wellnessTrend,
    acwr,
    dual_load_index: dualLoad,
    coachability_index: coachabilityIndex,
  };

  // 8. Supersede existing TRIANGLE_ALERT recs
  await supersedeExisting(athleteId, 'TRIANGLE_ALERT');

  // 9. Insert new recommendation
  const expiryHours = REC_EXPIRY_HOURS.TRIANGLE_ALERT ?? 72;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const rec: RecommendationInsert = {
    athlete_id: athleteId,
    rec_type: 'TRIANGLE_ALERT',
    priority: priority!,
    title,
    body_short: bodyShort,
    body_long: bodyLong,
    confidence_score: confidence,
    evidence_basis: evidence,
    trigger_event_id: event.event_id,
    context,
    visible_to_athlete: visibleToAthlete,
    visible_to_coach: visibleToCoach,
    visible_to_parent: visibleToParent,
    expires_at: expiresAt,
  };

  const insertedId = await insertRecommendationWithNotify(db as any, rec);

  if (!insertedId) {
    console.error(`[RIE/TriangleAlert] Insert failed for ${athleteId}`);
    return;
  }

  console.log(`[RIE/TriangleAlert] P${priority} "${title}" created for ${athleteId} (confidence: ${confidence}, athlete-visible: ${visibleToAthlete})`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the previous coachability index from the most recent triangle alert context */
async function getPreviousCoachability(
  athleteId: string,
  db: ReturnType<typeof supabaseAdmin>
): Promise<number | null> {
  const { data } = await (db as any)
    .from('athlete_recommendations')
    .select('context')
    .eq('athlete_id', athleteId)
    .eq('rec_type', 'TRIANGLE_ALERT')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.context?.coachability_index !== undefined) {
    return data.context.coachability_index as number;
  }
  return null;
}
