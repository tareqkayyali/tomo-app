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
import { computeTrainingScience } from '@/services/snapshot/trainingScienceComputed';
import { computeTrend, computeTrendPct } from '@/services/snapshot/trendUtils';
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
      .maybeSingle();

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
      .maybeSingle();

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
      .maybeSingle(),
  ]);

  // Training age = weeks since first ever SESSION_LOG
  let trainingAgeWeeks = 0;
  if (firstSessionRes.data?.occurred_at) {
    const firstDate = new Date(firstSessionRes.data.occurred_at);
    const now = new Date();
    const diffMs = now.getTime() - firstDate.getTime();
    trainingAgeWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  }

  // Compute streak: count consecutive days with activity going backwards from today.
  // Uses a single query to fetch distinct active dates (last 365 days), then counts
  // consecutive days in JS. 1 DB call instead of up to 365.
  let streakDays = 0;
  try {
    const today = new Date();
    const yearAgo = new Date(today);
    yearAgo.setDate(today.getDate() - 365);

    const { data: activeDays } = await (db as any)
      .from('athlete_events')
      .select('occurred_at')
      .eq('athlete_id', event.athlete_id)
      .in('event_type', ['SESSION_LOG', 'WELLNESS_CHECKIN'])
      .gte('occurred_at', yearAgo.toISOString())
      .order('occurred_at', { ascending: false });

    if (activeDays && activeDays.length > 0) {
      // Extract unique dates (YYYY-MM-DD)
      const uniqueDates = new Set<string>();
      for (const row of activeDays) {
        uniqueDates.add(new Date(row.occurred_at).toISOString().slice(0, 10));
      }

      // Count consecutive days backwards from today
      for (let i = 0; i < 365; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() - i);
        const dateStr = checkDate.toISOString().slice(0, 10);
        if (uniqueDates.has(dateStr)) {
          streakDays++;
        } else if (i > 0) {
          break; // streak broken
        }
      }
    }
  } catch (e) {
    console.warn('[sessionHandler] streak computation failed:', e);
  }

  await db
    .from('athlete_snapshots')
    .upsert({
      athlete_id: event.athlete_id,
      sessions_total: sessionCountRes.count ?? 0,
      last_session_at: event.occurred_at,
      training_age_weeks: trainingAgeWeeks,
      streak_days: streakDays,
      snapshot_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' });

  // 5. Recompute CV completeness (sessions + training age affect score)
  await recomputeCv(event.athlete_id);

  // 6. Snapshot 360: Training science + load trends
  await enrichSessionSnapshot(db, event.athlete_id, loadDate);
}

/**
 * Enrich snapshot with Snapshot 360 session fields:
 * training_monotony, training_strain, load_trend_7d_pct, days_since_last_session, body_feel_trend_7d
 */
async function enrichSessionSnapshot(
  db: any,
  athleteId: string,
  loadDate: string
): Promise<void> {
  const enrichment: Record<string, unknown> = {
    athlete_id: athleteId,
    snapshot_at: new Date().toISOString(),
  };

  // Fetch 7-day daily loads for training science (Banister model)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const { data: dailyLoads } = await db
    .from('athlete_daily_load')
    .select('training_load_au, load_date')
    .eq('athlete_id', athleteId)
    .gte('load_date', sevenDaysAgo)
    .order('load_date', { ascending: true });

  if (dailyLoads && dailyLoads.length > 0) {
    const loads = dailyLoads.map((d: any) => d.training_load_au as number);
    const science = computeTrainingScience({ dailyLoads: loads });
    if (science.training_monotony !== null) {
      enrichment.training_monotony = science.training_monotony;
    }
    if (science.training_strain !== null) {
      enrichment.training_strain = science.training_strain;
    }

    // Load trend percentage
    const loadValues = dailyLoads.map((d: any) => d.training_load_au as number | null);
    const loadTrend = computeTrendPct(loadValues);
    if (loadTrend !== null) {
      enrichment.load_trend_7d_pct = loadTrend;
    }
  }

  // ACWR trend from recent snapshot history (last 7 ACWR values)
  const { data: recentSnapshots } = await db
    .from('athlete_snapshots')
    .select('acwr')
    .eq('athlete_id', athleteId)
    .not('acwr', 'is', null)
    .limit(1);

  // days_since_last_session
  const { data: lastSession } = await db
    .from('athlete_events')
    .select('occurred_at')
    .eq('athlete_id', athleteId)
    .eq('event_type', 'SESSION_LOG')
    .order('occurred_at', { ascending: false })
    .limit(2); // Get previous session (current one is this event)

  if (lastSession && lastSession.length >= 2) {
    const prevDate = new Date(lastSession[1].occurred_at);
    const daysSince = Math.floor((Date.now() - prevDate.getTime()) / 86400000);
    enrichment.days_since_last_session = daysSince;
  } else {
    enrichment.days_since_last_session = 0; // First session ever or first today
  }

  // body_feel_trend_7d from post-session journals
  const { data: recentJournals } = await db
    .from('training_journals')
    .select('body_feel')
    .eq('athlete_id', athleteId)
    .eq('journal_type', 'post')
    .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .order('created_at', { ascending: true });

  if (recentJournals && recentJournals.length > 0) {
    const bodyFeelValues = recentJournals
      .map((j: any) => j.body_feel as number | null)
      .filter((v: any): v is number => v != null);
    if (bodyFeelValues.length > 0) {
      const avg = bodyFeelValues.reduce((a: number, b: number) => a + b, 0) / bodyFeelValues.length;
      enrichment.body_feel_trend_7d = Math.round(avg * 10) / 10;
    }
  }

  if (Object.keys(enrichment).length > 2) {
    await db
      .from('athlete_snapshots')
      .upsert(enrichment, { onConflict: 'athlete_id' });
  }
}
