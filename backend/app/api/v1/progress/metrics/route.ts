/**
 * GET /api/v1/progress/metrics?window=7|30|90
 *
 * Returns the athlete's active Progress tab metrics, resolved against their
 * data. Each metric is CMS-configured (see `progress_metrics` table); the
 * resolver computes latest/avg/deltaPct per source_kind.
 *
 * Response shape:
 *   {
 *     window: 7 | 30 | 90,
 *     metrics: ResolvedMetric[]   // ALL enabled metrics for this athlete's
 *                                 // sport, in sort_order. Metrics with no
 *                                 // data for this window carry latest/avg/
 *                                 // deltaPct = null and hasData = false;
 *                                 // the mobile client is responsible for
 *                                 // any visual "no data" treatment and
 *                                 // for capping to its own max count.
 *   }
 *
 * Freshness: not cached — metrics depend on check-in + wearable data that can
 * change mid-day. If this becomes a cost concern we can add a per-athlete
 * 5-minute cache; for now the queries are narrow (indexed on athlete_id +
 * date) and run in parallel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  loadEnabledMetrics,
  resolveMetrics,
} from '@/services/progress/progressMetricsResolver';

const ALLOWED_WINDOWS = [7, 30, 90] as const;
type Window = typeof ALLOWED_WINDOWS[number];

function parseWindow(param: string | null): Window {
  const n = param ? parseInt(param, 10) : 7;
  return (ALLOWED_WINDOWS as readonly number[]).includes(n) ? (n as Window) : 7;
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ('error' in auth) return auth.error;

    const url = new URL(req.url);
    const windowDays = parseWindow(url.searchParams.get('window'));

    // Load athlete's sport so we can filter sport-specific metrics.
    const db = supabaseAdmin();
    const { data: profile } = await db
      .from('users')
      .select('sport')
      .eq('id', auth.user.id)
      .maybeSingle();
    const sport = (profile?.sport as string | null) ?? null;

    const defs = await loadEnabledMetrics(sport);
    const metrics = await resolveMetrics(auth.user.id, defs, windowDays);

    // Return ALL enabled metrics — the mobile client expects a stable
    // set across the 7d/30d/90d toggle. Previously we filtered
    // hasData:false which caused metrics to appear/disappear between
    // windows (a metric with only 30-day data would drop out of the
    // 7-day view). The client caps to its own max count and renders
    // no-data metrics as "—".

    return NextResponse.json(
      { window: windowDays, metrics },
      { headers: { 'api-version': 'v1' } },
    );
  } catch (err: any) {
    console.error('[progress/metrics] error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
