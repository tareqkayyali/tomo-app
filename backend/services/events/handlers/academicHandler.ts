/**
 * Academic Handler — processes ACADEMIC_EVENT and STUDY_SESSION_LOG events.
 *
 * Updates academic load on the daily load table and recomputes dual-load index.
 * Angle 2 (Dual-Load Intelligence) of the Athlete Data Fabric.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AthleteEvent, AcademicEventPayload, StudySessionLogPayload } from '../types';
import { recomputeDualLoad } from '../computations/dualLoadComputation';

/**
 * Handle ACADEMIC_EVENT and STUDY_SESSION_LOG events.
 * Updates academic_load_au in athlete_daily_load for dual-load computation.
 */
export async function handleAcademicEvent(event: AthleteEvent): Promise<void> {
  const db = supabaseAdmin();
  const loadDate = event.occurred_at.slice(0, 10);

  // ── Scheduled events from calendar bridge ──
  // These represent projected academic load (future exam, study block).
  // Update daily load table but use the bridge-provided load values.
  const scheduledPayload = event.payload as any;
  if (scheduledPayload.scheduled) {
    const academicLoad = scheduledPayload.academic_load_au || 0;
    const cancelled = scheduledPayload.cancelled === true;

    if (cancelled) {
      // Zero out projected academic load for cancelled events
      const { data: existing } = await db
        .from('athlete_daily_load')
        .select('academic_load_au, session_count')
        .eq('athlete_id', event.athlete_id)
        .eq('load_date', loadDate)
        .single();

      if (existing && existing.session_count === 0) {
        await db
          .from('athlete_daily_load')
          .update({ academic_load_au: 0 })
          .eq('athlete_id', event.athlete_id)
          .eq('load_date', loadDate);
      }
    } else if (academicLoad > 0) {
      const { data: existing } = await db
        .from('athlete_daily_load')
        .select('academic_load_au')
        .eq('athlete_id', event.athlete_id)
        .eq('load_date', loadDate)
        .single();

      if (existing) {
        await db
          .from('athlete_daily_load')
          .update({ academic_load_au: existing.academic_load_au + academicLoad })
          .eq('athlete_id', event.athlete_id)
          .eq('load_date', loadDate);
      } else {
        await db
          .from('athlete_daily_load')
          .insert({
            athlete_id: event.athlete_id,
            load_date: loadDate,
            training_load_au: 0,
            academic_load_au: academicLoad,
            session_count: 0,
          });
      }
    }

    // Recompute dual load with projected data
    await recomputeDualLoad(event.athlete_id);
    return;
  }

  let academicLoadAU = 0;

  if (event.event_type === 'ACADEMIC_EVENT') {
    const payload = event.payload as AcademicEventPayload;
    academicLoadAU = payload.academic_load_score ?? (payload.estimated_prep_hours ?? 1) * 10;
  } else if (event.event_type === 'STUDY_SESSION_LOG') {
    const payload = event.payload as StudySessionLogPayload;
    // Study sessions contribute based on duration (1 hour = 10 AU)
    academicLoadAU = (payload.duration_min / 60) * 10;
  }

  if (academicLoadAU <= 0) return;

  // UPSERT into daily load table
  const { data: existing } = await db
    .from('athlete_daily_load')
    .select('academic_load_au')
    .eq('athlete_id', event.athlete_id)
    .eq('load_date', loadDate)
    .single();

  if (existing) {
    await db
      .from('athlete_daily_load')
      .update({
        academic_load_au: existing.academic_load_au + academicLoadAU,
      })
      .eq('athlete_id', event.athlete_id)
      .eq('load_date', loadDate);
  } else {
    await db
      .from('athlete_daily_load')
      .insert({
        athlete_id: event.athlete_id,
        load_date: loadDate,
        training_load_au: 0,
        academic_load_au: academicLoadAU,
        session_count: 0,
      });
  }

  // Recompute dual load index (academic + athletic combined) — also updates academic_load_7day
  await recomputeDualLoad(event.athlete_id);
}
