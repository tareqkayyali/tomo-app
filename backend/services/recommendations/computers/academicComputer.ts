/**
 * Academic Recommendation Computer
 *
 * Generates academic-load-related recommendations to help athletes
 * balance school/exam commitments with training load.
 *
 * Decision matrix (first match wins):
 *   Exam ≤3 days + dual_load>70       → P1 "Exam Week — Reduce Training"
 *   Exam ≤7 days + dual_load>60       → P2 "Exam Approaching — Plan Ahead"
 *   academic_load_7day > 250 AU        → P2 "Heavy Study Week — Balance Load"
 *   dual_load_index > 80              → P2 "Academic + Athletic Overlap"
 *   Exam logged, load normal          → P4 "Exam Noted — Schedule Adjusted"
 *   Otherwise                         → No rec
 *
 * Confidence levels:
 *   0.85 = parent-entered academic event
 *   0.75 = athlete-entered academic event
 *   0.60 = load-data-only (no explicit academic event)
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { supersedeExisting } from '../supersedeExisting';
import { REC_EXPIRY_HOURS } from '../constants';
import type { AthleteEvent } from '../../events/types';
import type { RecPriority, RecommendationInsert } from '../types';

export async function computeAcademicRec(
  athleteId: string,
  event: AthleteEvent
): Promise<void> {
  const db = supabaseAdmin();

  // 1. Read latest snapshot
  const { data: snapshot } = await db
    .from('athlete_snapshots')
    .select('dual_load_index, academic_load_7day, athletic_load_7day')
    .eq('athlete_id', athleteId)
    .single();

  if (!snapshot) {
    console.log(`[RIE/Academic] No snapshot for ${athleteId} — skipping`);
    return;
  }

  // 2. Extract event payload
  const payload = event.payload as Record<string, unknown>;
  const academicEventType = payload?.academic_event_type as string | undefined;
  const subject = payload?.subject as string | undefined;
  const estimatedPrepHours = payload?.estimated_prep_hours as number | undefined;
  const enteredBy = payload?.entered_by as string | undefined;

  // 3. Check for upcoming exams in next 14 days
  const fourteenDaysFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: upcomingExams } = await (db as any)
    .from('athlete_events')
    .select('payload, occurred_at')
    .eq('athlete_id', athleteId)
    .eq('event_type', 'ACADEMIC_EVENT')
    .gte('occurred_at', now)
    .lte('occurred_at', fourteenDaysFromNow)
    .order('occurred_at', { ascending: true });

  const examEvents = (upcomingExams ?? []).filter(
    (e: { payload: Record<string, unknown> }) => e.payload?.academic_event_type === 'EXAM'
  );

  // 4. Find nearest exam
  let daysToNearestExam: number | null = null;
  let nearestExamSubject: string | null = null;
  if (examEvents.length > 0) {
    const nearestExam = examEvents[0] as { payload: Record<string, unknown>; occurred_at: string };
    daysToNearestExam = Math.ceil(
      (new Date(nearestExam.occurred_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    nearestExamSubject = nearestExam.payload?.subject as string ?? null;
  }

  // Also check if the current event IS an exam
  if (academicEventType === 'EXAM' && !daysToNearestExam) {
    // The event itself might be the upcoming exam
    const eventDate = new Date(event.occurred_at ?? Date.now());
    if (eventDate.getTime() > Date.now()) {
      daysToNearestExam = Math.ceil(
        (eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      nearestExamSubject = subject ?? null;
    }
  }

  // 5. Read load data
  const dualLoad = snapshot.dual_load_index as number | null;
  const academicLoad = snapshot.academic_load_7day as number | null;
  const athleticLoad = snapshot.athletic_load_7day as number | null;

  // 6. Determine confidence
  let confidence = 0.6;
  if (enteredBy === 'PARENT') confidence = 0.85;
  else if (enteredBy === 'ATHLETE') confidence = 0.75;

  // 7. Evaluate decision matrix (first match wins)
  let priority: RecPriority | null = null;
  let title = '';
  let bodyShort = '';
  let bodyLong = '';

  if (daysToNearestExam !== null && daysToNearestExam <= 3 && dualLoad !== null && dualLoad > 70) {
    priority = 1;
    title = 'Exam Week — Reduce Training';
    const examInfo = nearestExamSubject ? ` (${nearestExamSubject})` : '';
    bodyShort = `Exam in ${daysToNearestExam} day${daysToNearestExam !== 1 ? 's' : ''}${examInfo}. Reduce training to light only.`;
    bodyLong = `You have an exam in ${daysToNearestExam} day${daysToNearestExam !== 1 ? 's' : ''}${examInfo} `
      + `and your combined load is high (${dualLoad}/100). `
      + `Reduce training to light sessions or recovery-only this week. `
      + `Your academic performance matters — a lighter training week won't hurt your fitness `
      + `but will help you focus and perform better in exams.`;
  } else if (daysToNearestExam !== null && daysToNearestExam <= 7 && dualLoad !== null && dualLoad > 60) {
    priority = 2;
    title = 'Exam Approaching — Plan Ahead';
    const examInfo = nearestExamSubject ? ` (${nearestExamSubject})` : '';
    bodyShort = `Exam in ${daysToNearestExam} days${examInfo}. Start planning your study/training balance.`;
    bodyLong = `You have an exam coming up in ${daysToNearestExam} days${examInfo} `
      + `and your dual load is elevated (${dualLoad}/100). `
      + `Start front-loading your training now so you can taper down as the exam approaches. `
      + (estimatedPrepHours ? `You've estimated ${estimatedPrepHours}h of prep — ` : '')
      + `Plan your study blocks around training, not the other way around this week.`;
  } else if (academicLoad !== null && academicLoad > 250) {
    priority = 2;
    title = 'Heavy Study Week — Balance Load';
    bodyShort = 'Your academic load is high this week. Consider lighter training sessions.';
    bodyLong = `Your academic load is ${academicLoad} AU over the past 7 days — that's a heavy study week. `
      + `Combined with your athletic load (${athleticLoad ?? 'N/A'} AU), `
      + `your total stress is significant. Consider dropping one training session or `
      + `reducing intensity to keep your overall load manageable.`;
  } else if (dualLoad !== null && dualLoad > 80) {
    priority = 2;
    title = 'Academic + Athletic Overlap';
    bodyShort = 'Both your academic and athletic loads are high. Something needs to give.';
    bodyLong = `Your dual load index is ${dualLoad}/100 — that means both school and sport `
      + `are demanding a lot from you right now. `
      + `Academic load: ${academicLoad ?? 'N/A'} AU, Athletic load: ${athleticLoad ?? 'N/A'} AU. `
      + `Talk to your coach about reducing training volume, or see if any study commitments can be rescheduled.`;
  } else if (academicEventType === 'EXAM') {
    priority = 4;
    title = 'Exam Noted — Schedule Adjusted';
    const examInfo = nearestExamSubject ? ` for ${nearestExamSubject}` : '';
    bodyShort = `Your exam${examInfo} has been noted. Training will be adjusted around it.`;
    bodyLong = `Your upcoming exam${examInfo} has been logged. `
      + `Your training schedule will be automatically adjusted as the date approaches. `
      + `Current load levels look manageable, so no changes needed right now. `
      + `Keep up the great balance!`;
  } else {
    // No academic rec needed
    return;
  }

  // 8. Build evidence
  const evidence: Record<string, unknown> = {
    dual_load_index: dualLoad,
    academic_load_7day: academicLoad,
    athletic_load_7day: athleticLoad,
    academic_event_type: academicEventType,
    days_to_nearest_exam: daysToNearestExam,
    nearest_exam_subject: nearestExamSubject,
    estimated_prep_hours: estimatedPrepHours,
    upcoming_exam_count: examEvents.length,
    entered_by: enteredBy,
  };

  // 9. Build context
  const context: Record<string, unknown> = {
    dual_load_index: dualLoad,
    academic_load_7day: academicLoad,
    athletic_load_7day: athleticLoad,
  };

  // 10. Supersede existing ACADEMIC recs
  await supersedeExisting(athleteId, 'ACADEMIC');

  // 11. Insert new recommendation
  const expiryHours = REC_EXPIRY_HOURS.ACADEMIC ?? 72;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const rec: RecommendationInsert = {
    athlete_id: athleteId,
    rec_type: 'ACADEMIC',
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
    console.error(`[RIE/Academic] Insert failed for ${athleteId}:`, error.message);
    return;
  }

  console.log(`[RIE/Academic] P${priority} "${title}" created for ${athleteId} (confidence: ${confidence})`);
}
