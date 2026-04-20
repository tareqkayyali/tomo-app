/**
 * POST /api/v1/admin/config/[key]/preview
 *
 * Shadow-evaluates a proposed config payload against 50 real athlete
 * snapshots without writing anything. Returns the distribution of CCRS
 * deltas and recommendation-label shifts so ops can see impact before
 * committing a save.
 *
 * Only ccrs_formula_v1 and acwr_config_v1 are currently supported because
 * they affect CCRS output directly. Other config domains will register
 * their own preview adapter in follow-up PRs.
 *
 * Auth: requireAdmin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/apiAuth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRegistryEntry } from '@/services/config/registry';
import {
  calculateCCRS,
  tomoCheckinToHooper,
  type CCRSInputs,
  type CCRSResult,
  type BiometricInputs,
  type AthleteBaseline,
  type HooperInputs,
  type ACWRInputs,
  type PHVStage,
} from '@/services/ccrs/ccrsFormula';
import {
  CCRS_FORMULA_DEFAULT,
  type CCRSFormulaConfig,
} from '@/services/ccrs/ccrsFormulaConfig';
import {
  ACWR_CONFIG_DEFAULT,
  type ACWRConfig,
} from '@/services/events/acwrConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY_PATTERN = /^[a-z][a-z0-9_]*_v[0-9]+$/;
const SAMPLE_SIZE = 50;
const SUPPORTED_KEYS = new Set(['ccrs_formula_v1', 'acwr_config_v1']);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { key } = await ctx.params;
  if (!KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: 'Invalid config_key format.' }, { status: 400 });
  }

  if (!SUPPORTED_KEYS.has(key)) {
    return NextResponse.json(
      { error: `Preview not yet implemented for ${key}. Only ccrs_formula_v1 and acwr_config_v1 are supported in PR 2.` },
      { status: 501 },
    );
  }

  const registry = getRegistryEntry(key);
  if (!registry) {
    return NextResponse.json({ error: `Unknown config_key: ${key}` }, { status: 404 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // Validate the proposed payload against its schema.
  const proposedParse = registry.schema.safeParse(body.payload);
  if (!proposedParse.success) {
    return NextResponse.json(
      { error: 'Proposed payload failed schema validation', detail: proposedParse.error.flatten() },
      { status: 422 },
    );
  }
  const proposed = proposedParse.data;

  // Load a sample of 50 real athletes with enough data to recompute CCRS.
  const db = supabaseAdmin();
  const { data: sample, error: sampleErr } = await (db as any)
    .from('athlete_snapshots')
    .select(
      'athlete_id, hrv_today_ms, hrv_baseline_ms, hrv_sd_30d, hrv_sample_n, ' +
      'resting_hr_bpm, sleep_hours, hrv_recorded_at, sleep_recorded_at, ' +
      'last_checkin_at, acwr, atl_7day, ctl_28day, dob, phv_stage',
    )
    .not('hrv_today_ms', 'is', null)
    .limit(SAMPLE_SIZE);

  if (sampleErr) {
    return NextResponse.json(
      { error: 'Failed to load athlete sample', detail: sampleErr.message },
      { status: 500 },
    );
  }

  const athleteIds = (sample ?? []).map((s: any) => s.athlete_id);
  const { data: checkins } = await (db as any)
    .from('checkins')
    .select('user_id, energy, soreness, mood, sleep_hours, academic_stress')
    .in('user_id', athleteIds)
    .eq('date', new Date().toISOString().slice(0, 10));

  const checkinByAthlete = new Map<string, any>(
    (checkins ?? []).map((c: any) => [c.user_id, c]),
  );

  // Build the two config pairs to compare: baseline = hardcoded DEFAULT,
  // proposed = what the admin is trying. We compare proposed-vs-DEFAULT
  // rather than proposed-vs-live-DB because the DB row in prod ≠ what
  // Zod would accept if schema drifted. DEFAULT is the canonical anchor.
  const baselineCCRS: CCRSFormulaConfig =
    key === 'ccrs_formula_v1' ? CCRS_FORMULA_DEFAULT : CCRS_FORMULA_DEFAULT;
  const proposedCCRS: CCRSFormulaConfig =
    key === 'ccrs_formula_v1' ? (proposed as CCRSFormulaConfig) : CCRS_FORMULA_DEFAULT;

  const baselineACWR: ACWRConfig =
    key === 'acwr_config_v1' ? ACWR_CONFIG_DEFAULT : ACWR_CONFIG_DEFAULT;
  const proposedACWR: ACWRConfig =
    key === 'acwr_config_v1' ? (proposed as ACWRConfig) : ACWR_CONFIG_DEFAULT;

  const rows = sample ?? [];
  const comparisons = rows.map((row: any) => {
    const inputs = buildInputs(row, checkinByAthlete.get(row.athlete_id) ?? null);
    const before = calculateCCRS(inputs, { ccrs: baselineCCRS, acwr: baselineACWR });
    const after  = calculateCCRS(inputs, { ccrs: proposedCCRS, acwr: proposedACWR });

    return {
      athlete_id:          row.athlete_id,
      ccrs_before:         before.ccrs,
      ccrs_after:          after.ccrs,
      ccrs_delta:          Math.round((after.ccrs - before.ccrs) * 10) / 10,
      recommendation_before: before.recommendation,
      recommendation_after:  after.recommendation,
      recommendation_changed: before.recommendation !== after.recommendation,
    };
  });

  // Aggregate
  const deltas = comparisons.map((c: any) => c.ccrs_delta);
  const abs = deltas.map((d: number) => Math.abs(d));
  const summary = {
    sample_size:     comparisons.length,
    max_abs_delta:   abs.length > 0 ? Math.max(...abs) : 0,
    mean_abs_delta:  abs.length > 0 ? round(abs.reduce((a: number, b: number) => a + b, 0) / abs.length, 2) : 0,
    recommendations_changed: comparisons.filter((c: any) => c.recommendation_changed).length,
    recommendation_shift_matrix: buildShiftMatrix(comparisons),
  };

  return NextResponse.json({
    summary,
    sample: comparisons,
  });
}

// ── helpers ────────────────────────────────────────────────────────────────

function round(n: number, places: number): number {
  const m = 10 ** places;
  return Math.round(n * m) / m;
}

function buildInputs(snapshot: any, checkin: any): CCRSInputs {
  const now = Date.now();
  const biometric: BiometricInputs | null = snapshot.hrv_today_ms != null
    ? {
        hrv_rmssd:      Number(snapshot.hrv_today_ms),
        rhr_bpm:        Number(snapshot.resting_hr_bpm ?? 65),
        sleep_hours:    Number(snapshot.sleep_hours ?? 7),
        data_age_hours: ageHours(snapshot.hrv_recorded_at, snapshot.sleep_recorded_at, now),
      }
    : null;

  const baseline: AthleteBaseline | null = snapshot.hrv_baseline_ms != null
    ? {
        hrv_mean_30d:    Number(snapshot.hrv_baseline_ms),
        hrv_sd_30d:      Number(snapshot.hrv_sd_30d ?? 10),
        rhr_mean_30d:    Number(snapshot.resting_hr_bpm ?? 65),
        baseline_valid:  (snapshot.hrv_sample_n ?? 0) >= 14,
      }
    : null;

  const hooper: HooperInputs | null = checkin
    ? tomoCheckinToHooper({
        energy:         checkin.energy ?? 5,
        soreness:       checkin.soreness ?? 5,
        mood:           checkin.mood ?? 5,
        sleepHours:     checkin.sleep_hours ?? 7,
        academicStress: checkin.academic_stress ?? null,
        athlete_age:    ageFromDob(snapshot.dob),
      })
    : null;

  const acwr: ACWRInputs | null =
    snapshot.atl_7day != null && snapshot.ctl_28day != null
      ? { acute_load_7d: Number(snapshot.atl_7day), chronic_load_28d: Number(snapshot.ctl_28day) }
      : null;

  const phv: PHVStage =
    snapshot.phv_stage === 'mid_phv' ? 'mid_phv' :
    snapshot.phv_stage === 'post_phv' ? 'post_phv' :
    snapshot.phv_stage === 'pre_phv' ? 'pre_phv' :
    'adult';

  return {
    biometric,
    baseline,
    hooper,
    acwr,
    phv_stage:         phv,
    coach_phase_score: null,
    historical_score:  62,
  };
}

function ageHours(hrvAt: string | null, sleepAt: string | null, nowMs: number): number {
  const times = [hrvAt, sleepAt].filter(Boolean).map((t) => new Date(t as string).getTime());
  if (times.length === 0) return 999;
  return (nowMs - Math.max(...times)) / (60 * 60 * 1000);
}

function ageFromDob(dob: string | null): number {
  if (!dob) return 16;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function buildShiftMatrix(rows: Array<{ recommendation_before: string; recommendation_after: string }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.recommendation_before === r.recommendation_after) continue;
    const key = `${r.recommendation_before} → ${r.recommendation_after}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
