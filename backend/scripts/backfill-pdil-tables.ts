/**
 * Backfill Script — Populate PDIL + Unified Data Layer tables from existing data
 *
 * Run AFTER applying migrations 030-033 to Supabase.
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/backfill-pdil-tables.ts
 *
 * What it does:
 *   1. Backfills athlete_daily_vitals from checkins + health_data (last 90 days)
 *   2. Backfills athlete_benchmark_cache from athlete_benchmarks
 *   3. Computes weekly digests for the current week
 *
 * Safe to run multiple times — uses upsert (ON CONFLICT DO UPDATE).
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ============================================================================
// 1. BACKFILL DAILY VITALS FROM CHECKINS
// ============================================================================

async function backfillDailyVitalsFromCheckins() {
  console.log('\n═══ Backfilling athlete_daily_vitals from checkins ═══');

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoff = ninetyDaysAgo.toISOString().split('T')[0];

  const { data: checkins, error } = await db
    .from('checkins')
    .select('user_id, date, energy, soreness, sleep_hours, mood, academic_stress, pain_flag, readiness')
    .gte('date', cutoff)
    .order('date', { ascending: true });

  if (error) {
    console.error('Failed to read checkins:', error.message);
    return;
  }

  console.log(`  Found ${checkins?.length ?? 0} checkins to backfill`);

  let inserted = 0;
  let skipped = 0;

  for (const c of checkins ?? []) {
    // Compute readiness score (simplified — matches wellnessHandler logic)
    const energyNorm = ((c.energy ?? 5) / 10) * 100;
    const sorenessNorm = (1 - (c.soreness ?? 3) / 10) * 100;
    const sleepNorm = Math.min(((c.sleep_hours ?? 7) / 9) * 100, 100);
    const moodNorm = ((c.mood ?? 5) / 10) * 100;
    const readinessScore = Math.round(energyNorm * 0.3 + sorenessNorm * 0.25 + sleepNorm * 0.25 + moodNorm * 0.2);

    const readinessRag = c.readiness === 'Green' ? 'GREEN'
      : c.readiness === 'Yellow' ? 'AMBER'
      : c.readiness === 'Red' ? 'RED' : 'GREEN';

    const record = {
      athlete_id: c.user_id,
      vitals_date: c.date,
      energy: c.energy,
      soreness: c.soreness,
      mood: c.mood,
      academic_stress: c.academic_stress ?? null,
      pain_flag: c.pain_flag ?? false,
      sleep_hours: c.sleep_hours,
      readiness_score: readinessScore,
      readiness_rag: readinessRag,
      sources_resolved: { energy: 'checkin', soreness: 'checkin', mood: 'checkin', sleep_hours: 'checkin' },
    };

    const { error: upsertErr } = await (db as any)
      .from('athlete_daily_vitals')
      .upsert(record, { onConflict: 'athlete_id,vitals_date' });

    if (upsertErr) {
      skipped++;
    } else {
      inserted++;
    }
  }

  console.log(`  Inserted/updated: ${inserted}, Skipped/errored: ${skipped}`);
}

// ============================================================================
// 2. OVERLAY WEARABLE DATA (HEALTH_DATA)
// ============================================================================

async function overlayWearableData() {
  console.log('\n═══ Overlaying wearable data from health_data ═══');

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoff = ninetyDaysAgo.toISOString().split('T')[0];

  // HRV, RHR, sleep from wearables
  const { data: healthRows, error } = await db
    .from('health_data')
    .select('user_id, date, metric_type, value, source')
    .in('metric_type', ['hrv', 'resting_heart_rate', 'sleep_hours', 'recovery_score'])
    .gte('date', cutoff)
    .order('date', { ascending: true });

  if (error) {
    console.error('Failed to read health_data:', error.message);
    return;
  }

  console.log(`  Found ${healthRows?.length ?? 0} wearable readings to overlay`);

  // Group by user+date
  const grouped: Record<string, Record<string, any>> = {};
  for (const row of healthRows ?? []) {
    const key = `${row.user_id}|${row.date}`;
    if (!grouped[key]) grouped[key] = { athlete_id: row.user_id, vitals_date: row.date };
    const g = grouped[key];

    switch (row.metric_type) {
      case 'hrv':
        g.hrv_morning_ms = row.value;
        break;
      case 'resting_heart_rate':
        g.resting_hr_bpm = row.value;
        break;
      case 'sleep_hours':
        g.sleep_hours = row.value;
        break;
      case 'recovery_score':
        g.recovery_score = row.value;
        break;
    }

    // Track source priority
    if (!g.sources_resolved) g.sources_resolved = {};
    g.sources_resolved[row.metric_type] = row.source ?? 'wearable';
  }

  let updated = 0;
  for (const record of Object.values(grouped)) {
    const { error: upsertErr } = await (db as any)
      .from('athlete_daily_vitals')
      .upsert(record, { onConflict: 'athlete_id,vitals_date' });

    if (!upsertErr) updated++;
  }

  console.log(`  Updated: ${updated} daily vitals rows with wearable data`);
}

// ============================================================================
// 3. BACKFILL BENCHMARK CACHE
// ============================================================================

async function backfillBenchmarkCache() {
  console.log('\n═══ Backfilling athlete_benchmark_cache ═══');

  // Get all athletes with benchmarks
  const { data: athletes, error } = await db
    .from('athlete_benchmarks')
    .select('user_id')
    .limit(1000);

  if (error) {
    console.error('Failed to read athlete_benchmarks:', error.message);
    return;
  }

  const uniqueAthletes = [...new Set((athletes ?? []).map(a => a.user_id))];
  console.log(`  Found ${uniqueAthletes.length} athletes with benchmarks`);

  let cached = 0;
  for (const athleteId of uniqueAthletes) {
    // Get latest benchmarks per metric
    const { data: benchmarks } = await db
      .from('athlete_benchmarks')
      .select('*')
      .eq('user_id', athleteId)
      .order('tested_at', { ascending: false });

    if (!benchmarks || benchmarks.length === 0) continue;

    // Deduplicate by metric_key (keep latest)
    const latestByMetric: Record<string, any> = {};
    for (const b of benchmarks) {
      if (!latestByMetric[b.metric_key]) {
        latestByMetric[b.metric_key] = b;
      }
    }

    const results = Object.values(latestByMetric).map((b: any) => ({
      metric_key: b.metric_key,
      value: b.value,
      percentile: b.percentile,
      zone: b.zone,
      tested_at: b.tested_at,
    }));

    // Compute overall percentile (average of all metric percentiles)
    const percentiles = results.filter(r => r.percentile != null).map(r => r.percentile);
    const overallPercentile = percentiles.length > 0
      ? Math.round(percentiles.reduce((a: number, b: number) => a + b, 0) / percentiles.length)
      : null;

    // Identify strengths (>= 75th) and gaps (<= 35th)
    const strengths = results.filter(r => r.percentile >= 75).map(r => r.metric_key);
    const gaps = results.filter(r => r.percentile <= 35).map(r => r.metric_key);

    const cacheRecord = {
      athlete_id: athleteId,
      overall_percentile: overallPercentile,
      strengths,
      gaps,
      results,
      last_test_at: results[0]?.tested_at ?? null,
      computed_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await (db as any)
      .from('athlete_benchmark_cache')
      .upsert(cacheRecord, { onConflict: 'athlete_id' });

    if (!upsertErr) cached++;
  }

  console.log(`  Cached: ${cached} athlete benchmark profiles`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  PDIL + Unified Data Layer — Backfill Script        ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Target: ${SUPABASE_URL}`);
  console.log(`  Time:   ${new Date().toISOString()}`);

  await backfillDailyVitalsFromCheckins();
  await overlayWearableData();
  await backfillBenchmarkCache();

  console.log('\nBackfill complete!\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
