/**
 * Session Handler — processes SESSION_LOG events.
 *
 * Updates the athlete_daily_load pre-aggregation table for ACWR computation,
 * increments session count, and updates training age.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { recomputeACWR } from '../computations/acwrComputation';
import { recomputeDualLoad } from '../computations/dualLoadComputation';
import { recomputeCv } from '../computations/cvComputation';
import type { AthleteEvent, SessionLogPayload } from '../types';

/**
 * Handle a SESSION_LOG event:
 * 1. UPSERT daily load bucket (for fast ACWR queries)
 * 2. Recompute ACWR
 * 3. Update session count + last_session_at on snapshot
 */
export async function handleSessionLog(event: AthleteEvent): Promise<void> {
  const payload = event.payload as SessionLogPayload;
  const db = supabaseAdmin();

  const loadDate = event.occurred_at.slice(0, 10); // YYYY-MM-DD

  // ── Scheduled events: update projected load but skip session counts ──
  // Calendar bridge emits scheduled events with `scheduled: true` in payload.
  // These represent future/projected load, not completed sessions.
  const scheduledPayload = payload as any;
  if (scheduledPayload.scheduled) {
    const projectedLoad = scheduledPayload.training_load_au || 0;
    const cancelled = scheduledPayload.cancelled === true;

    const { data: existing } = await db
      .from('athlete_daily_load')
      .select('training_load_au, session_count')
      .eq('athlete_id', event.athlete_id)
      .eq('load_date', loadDate)
      .single();

    if (cancelled) {
      // Cancelled: zero out projected load only if no actual sessions exist for the date
      if (existing && existing.session_count === 0) {
        await db
          .from('athlete_daily_load')
          .update({ training_load_au: 0 })
          .eq('athlete_id', event.athlete_id)
          .eq('load_date', loadDate);
      }
    } else if (existing) {
      await db
        .from('athlete_daily_load')
        .update({ training_load_au: existing.training_load_au + projectedLoad })
        .eq('athlete_id', event.athlete_id)
        .eq('load_date', loadDate);
    } else {
      await db
        .from('athlete_daily_load')
        .insert({
          athlete_id: event.athlete_id,
          load_date: loadDate,
          training_load_au: projectedLoad,
          academic_load_au: 0,
          session_count: 0, // scheduled — not a completed session
        });
    }

    // Recompute ACWR and dual load with projected data
    await recomputeACWR(event.athlete_id);
    await recomputeDualLoad(event.athlete_id);
    // Skip: sessions_total, training_age_weeks, last_session_at, CV
    return;
  }

  const trainingLoadAU = payload.training_load_au || 0;

  // 1. UPSERT daily load bucket
  // Uses raw SQL via rpc because Supabase JS doesn't support ON CONFLICT DO UPDATE with addition
  // RPC may not exist in generated types yet — cast to bypass
  const { error: loadError } = await (db.rpc as Function)('upsert_daily_load', {
    p_athlete_id: event.athlete_id,
    p_load_date: loadDate,
    p_training_load_au: trainingLoadAU,
  });

  // Fallback: if RPC doesn't exist yet, do a manual upsert
  if (loadError) {
    // Try simple upsert — will overwrite rather than add, but acceptable for Phase 1
    const { data: existing } = await db
      .from('athlete_daily_load')
      .select('training_load_au, session_count')
      .eq('athlete_id', event.athlete_id)
      .eq('load_date', loadDate)
      .single();

    if (existing) {
      await db
        .from('athlete_daily_load')
        .update({
          training_load_au: existing.training_load_au + trainingLoadAU,
          session_count: existing.session_count + 1,
        })
        .eq('athlete_id', event.athlete_id)
        .eq('load_date', loadDate);
    } else {
      await db
        .from('athlete_daily_load')
        .insert({
          athlete_id: event.athlete_id,
          load_date: loadDate,
          training_load_au: trainingLoadAU,
          academic_load_au: 0,
          session_count: 1,
        });
    }
  }

  // 2. Recompute ACWR (reads from athlete_daily_load — fast 28-row scan)
  await recomputeACWR(event.athlete_id);

  // 3. Recompute dual load index (athletic + academic combined)
  await recomputeDualLoad(event.athlete_id);

  // 4. Update session totals + training age on snapshot
  const [sessionCountRes, firstSessionRes] = await Promise.all([
    db
      .from('athlete_events')
      .select('event_id', { count: 'exact', head: true })
      .eq('athlete_id', event.athlete_id)
      .eq('event_type', 'SESSION_LOG'),
    db
      .from('athlete_events')
      .select('occurred_at')
      .eq('athlete_id', event.athlete_id)
      .eq('event_type', 'SESSION_LOG')
      .order('occurred_at', { ascending: true })
      .limit(1)
      .single(),
  ]);

  // Training age = weeks since first ever SESSION_LOG
  let trainingAgeWeeks = 0;
  if (firstSessionRes.data?.occurred_at) {
    const firstDate = new Date(firstSessionRes.data.occurred_at);
    const now = new Date();
    const diffMs = now.getTime() - firstDate.getTime();
    trainingAgeWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  }

  await db
    .from('athlete_snapshots')
    .upsert({
      athlete_id: event.athlete_id,
      sessions_total: sessionCountRes.data?.length ?? 0,
      last_session_at: event.occurred_at,
      training_age_weeks: trainingAgeWeeks,
      snapshot_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' });

  // 5. Recompute CV completeness (sessions + training age affect score)
  await recomputeCv(event.athlete_id);
}
