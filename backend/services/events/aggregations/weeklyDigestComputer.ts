/**
 * ════════════════════════════════════════════════════════════════════════════
 * Weekly Digest Computer
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Computes athlete_weekly_digest from athlete_daily_vitals + athlete_daily_load.
 * Called via:
 *   - Lazy recompute: when getAthleteState() detects stale digest (>6h)
 *   - Scheduled: Sunday night pg_cron job
 *
 * Aggregates 7 days of data into one summary row per ISO week.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Compute and upsert the weekly digest for the current ISO week.
 */
export async function computeWeeklyDigest(athleteId: string): Promise<void> {
  const db = supabaseAdmin();
  const now = new Date();

  // Get current ISO year and week
  const { isoYear, isoWeek } = getISOWeek(now);

  // Get the date range for this ISO week
  const weekStart = getISOWeekStart(isoYear, isoWeek);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const fromStr = weekStart.toISOString().split('T')[0];
  const toStr = weekEnd.toISOString().split('T')[0];

  // Fetch daily vitals for this week
  const { data: vitals } = await (db as any)
    .from('athlete_daily_vitals')
    .select('*')
    .eq('athlete_id', athleteId)
    .gte('vitals_date', fromStr)
    .lte('vitals_date', toStr);

  // Fetch daily load for this week
  const { data: loads } = await db
    .from('athlete_daily_load')
    .select('*')
    .eq('athlete_id', athleteId)
    .gte('load_date', fromStr)
    .lte('load_date', toStr);

  const vRows = (vitals ?? []) as Record<string, unknown>[];
  const lRows = (loads ?? []) as any[];

  // Compute aggregates
  const totalTrainingLoad = lRows.reduce((s, r) => s + Number(r.training_load_au ?? 0), 0);
  const totalAcademicLoad = lRows.reduce((s, r) => s + Number(r.academic_load_au ?? 0), 0);
  const sessionCount = lRows.reduce((s, r) => s + (r.session_count ?? 0), 0);

  const hrvValues = vRows.map(v => v.hrv_morning_ms).filter(v => v != null).map(Number);
  const sleepValues = vRows.map(v => v.sleep_hours).filter(v => v != null).map(Number);
  const energyValues = vRows.map(v => v.energy).filter(v => v != null).map(Number);
  const sorenessValues = vRows.map(v => v.soreness).filter(v => v != null).map(Number);
  const moodValues = vRows.map(v => v.mood).filter(v => v != null).map(Number);

  const avgHrv = hrvValues.length > 0 ? avg(hrvValues) : null;
  const avgSleep = sleepValues.length > 0 ? avg(sleepValues) : null;
  const avgEnergy = energyValues.length > 0 ? avg(energyValues) : null;
  const avgSoreness = sorenessValues.length > 0 ? avg(sorenessValues) : null;
  const avgMood = moodValues.length > 0 ? avg(moodValues) : null;

  // Readiness distribution
  let green = 0, amber = 0, red = 0;
  for (const v of vRows) {
    if (v.readiness_rag === 'GREEN') green++;
    else if (v.readiness_rag === 'AMBER') amber++;
    else if (v.readiness_rag === 'RED') red++;
  }

  // Wellness trend (simple: based on energy trend)
  let wellnessTrend: string = 'STABLE';
  if (energyValues.length >= 4) {
    const firstHalf = avg(energyValues.slice(0, Math.floor(energyValues.length / 2)));
    const secondHalf = avg(energyValues.slice(Math.floor(energyValues.length / 2)));
    const delta = secondHalf - firstHalf;
    if (delta > 0.5) wellnessTrend = 'IMPROVING';
    else if (delta < -0.5) wellnessTrend = 'DECLINING';
  }

  // Fetch previous week for trend computation
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevFromStr = prevWeekStart.toISOString().split('T')[0];
  const prevToStr = fromStr; // Previous week ends where this week starts

  const { data: prevLoads } = await db
    .from('athlete_daily_load')
    .select('training_load_au')
    .eq('athlete_id', athleteId)
    .gte('load_date', prevFromStr)
    .lt('load_date', prevToStr);

  const { data: prevVitals } = await (db as any)
    .from('athlete_daily_vitals')
    .select('hrv_morning_ms')
    .eq('athlete_id', athleteId)
    .gte('vitals_date', prevFromStr)
    .lt('vitals_date', prevToStr);

  const prevTotalLoad = (prevLoads ?? []).reduce((s: number, r: any) => s + Number(r.training_load_au ?? 0), 0);
  const prevHrvValues = ((prevVitals ?? []) as any[])
    .map(v => v.hrv_morning_ms)
    .filter(v => v != null)
    .map(Number);
  const prevAvgHrv = prevHrvValues.length > 0 ? avg(prevHrvValues) : null;

  const loadTrendPct = prevTotalLoad > 0
    ? Math.round(((totalTrainingLoad - prevTotalLoad) / prevTotalLoad) * 100 * 10) / 10
    : null;
  const hrvTrendPct = prevAvgHrv != null && avgHrv != null && prevAvgHrv > 0
    ? Math.round(((avgHrv - prevAvgHrv) / prevAvgHrv) * 100 * 10) / 10
    : null;

  // Upsert
  const { error } = await (db as any)
    .from('athlete_weekly_digest')
    .upsert({
      athlete_id:             athleteId,
      iso_year:               isoYear,
      iso_week:               isoWeek,
      total_training_load_au: totalTrainingLoad || null,
      total_academic_load_au: totalAcademicLoad || null,
      session_count:          sessionCount,
      avg_hrv_ms:             avgHrv,
      avg_resting_hr:         null, // TODO: add when RHR data available
      avg_sleep_hours:        avgSleep,
      avg_energy:             avgEnergy,
      avg_soreness:           avgSoreness,
      avg_mood:               avgMood,
      hrv_trend_pct:          hrvTrendPct,
      load_trend_pct:         loadTrendPct,
      wellness_trend:         wellnessTrend,
      green_days:             green,
      amber_days:             amber,
      red_days:               red,
      journal_completion_rate: null, // TODO: compute from journal data
      computed_at:            now.toISOString(),
    }, { onConflict: 'athlete_id,iso_year,iso_week' });

  if (error) {
    console.error('[WeeklyDigest] Upsert failed:', error.message, { athleteId });
  }
}


// ============================================================================
// HELPERS
// ============================================================================

function avg(values: number[]): number {
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

function getISOWeek(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { isoYear: d.getUTCFullYear(), isoWeek: weekNo };
}

function getISOWeekStart(isoYear: number, isoWeek: number): Date {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (isoWeek - 1) * 7);
  return weekStart;
}
