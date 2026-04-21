/**
 * POST /api/v1/cron/progress-metric-triggers
 *
 * Evaluates every CMS-configured `notification_triggers` rule on
 * `progress_metrics` against every active athlete, and dispatches
 * notifications for matches via the existing notification engine (which
 * enforces fatigue, quiet hours, daily cap, grouping dedup).
 *
 * Intended schedule: once daily at 07:00 local quiet-hour boundary, or via
 * Railway cron every N hours. The runner is idempotent per cooldown window
 * — overlapping ticks won't re-fire for the same athlete+trigger inside
 * the configured `cooldown_hours`, so safe to run more often than strictly
 * needed.
 *
 * Auth: requires X-Cron-Secret header matching CRON_SECRET env var.
 * Observability: writes a `cron_run_log` row with counts + duration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronRunLog';
import { runProgressMetricTriggers } from '@/services/progress/progressMetricRunner';

export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const result = await withCronLog('progress.metric_triggers', async () => {
    const r = await runProgressMetricTriggers();
    return {
      processed: r.evaluations,
      sent: r.dispatched,
      queued: r.engine_null, // engine returned null = suppressed by guardrails
      failed: r.errors,
      details: {
        metrics_considered: r.metrics_considered,
        athletes_considered: r.athletes_considered,
        matches: r.matches,
        cooldown_skips: r.cooldown_skips,
        duration_ms: r.duration_ms,
      },
    };
  });

  return result.status === 'failed'
    ? NextResponse.json({ ok: false, ...result }, { status: 500 })
    : NextResponse.json({ ok: true, ...result });
}
