/**
 * Progress Metric Notification Runner
 *
 * Daily cron body that turns CMS-configured triggers on `progress_metrics`
 * into concrete notifications, routed through the existing notification
 * engine (inherits all guardrails: fatigue, quiet hours, daily cap, push
 * suppression, grouping dedup).
 *
 * Pipeline:
 *   1. Load enabled metrics whose `notification_triggers` has at least one
 *      rule. Filter-once here instead of per-athlete for hit rate.
 *   2. Load every athlete id (`users`). We don't pre-filter by sport here;
 *      `loadEnabledMetrics(sport)` handles sport_filter per metric per
 *      athlete below.
 *   3. Per (athlete, metric): resolve the metric once for the 7d window —
 *      the trigger window is fixed at 7d so thresholds + trends both scan
 *      the same recent cohort. (30/90d windows stay view-only on mobile;
 *      notifying on 90d-window trends would be noisy and slow.)
 *   4. For each trigger in the metric, evaluate `operator` against the
 *      resolved value (threshold → `latest`; trend → `deltaPct`).
 *   5. On match: check cooldown via `progress_metric_alerts`. If the last
 *      fire for this (athlete, metric_key, trigger_hash) tuple is inside
 *      `cooldown_hours`, skip.
 *   6. Dispatch via `createNotification({ type, vars })`. Template vars are
 *      built from the metric definition + resolved numbers.
 *   7. Log a `progress_metric_alerts` row regardless of whether the engine
 *      suppressed the push (quiet hours, fatigue) — we want the cooldown to
 *      hold so we don't re-evaluate for this athlete until it lapses.
 *
 * All I/O is awaited (not parallelised across athletes) to keep DB fan-out
 * predictable under Railway's 512MB instance. A single run is O(athletes ×
 * metrics_with_triggers). For 5k athletes × 8 metrics × 2 triggers we're at
 * ~80k evaluations per run — most short-circuit in the cooldown check.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { createNotification } from '@/services/notifications/notificationEngine';
import type { NotificationType } from '@/services/notifications/notificationTemplates';
import {
  loadEnabledMetrics,
  resolveMetrics,
  type ProgressMetricDef,
  type ResolvedMetric,
} from './progressMetricsResolver';
import crypto from 'node:crypto';

// Trigger window is fixed — see module comment for reasoning.
const TRIGGER_WINDOW_DAYS = 7;

// Shape of one rule in `progress_metrics.notification_triggers.triggers[]`.
interface ProgressTrigger {
  kind: 'threshold' | 'trend';
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'delta_lt_pct' | 'delta_gt_pct';
  value: number;
  notification_type: NotificationType;
  cooldown_hours: number;
}

interface TriggersJson {
  triggers?: ProgressTrigger[];
}

export interface RunResult {
  metrics_considered: number;
  athletes_considered: number;
  evaluations: number;
  matches: number;
  cooldown_skips: number;
  dispatched: number;
  engine_null: number; // createNotification returned null (guardrail suppressed)
  errors: number;
  duration_ms: number;
}

export async function runProgressMetricTriggers(): Promise<RunResult> {
  const startedAt = Date.now();
  const result: RunResult = {
    metrics_considered: 0,
    athletes_considered: 0,
    evaluations: 0,
    matches: 0,
    cooldown_skips: 0,
    dispatched: 0,
    engine_null: 0,
    errors: 0,
    duration_ms: 0,
  };

  // 1. Pre-load metrics once. We pass `null` for sport (load all metrics —
  //    sport_filter is applied per athlete below).
  const allMetrics = await loadEnabledMetrics(null);
  const triggeredMetrics = allMetrics.filter((m) => hasTriggers(m.notification_triggers));
  result.metrics_considered = triggeredMetrics.length;
  if (triggeredMetrics.length === 0) {
    result.duration_ms = Date.now() - startedAt;
    return result;
  }

  // 2. Athlete cohort. sport column drives per-metric filter below.
  const db = supabaseAdmin() as any;
  const { data: athletes, error } = await db
    .from('users')
    .select('id, sport');
  if (error) {
    console.error('[progress-triggers] failed to load athletes:', error.message);
    result.errors = 1;
    result.duration_ms = Date.now() - startedAt;
    return result;
  }
  const cohort = (athletes ?? []) as Array<{ id: string; sport: string | null }>;
  result.athletes_considered = cohort.length;

  // 3. Per-athlete evaluation loop.
  for (const athlete of cohort) {
    const metricsForAthlete = triggeredMetrics.filter((m) =>
      !m.sport_filter || m.sport_filter.length === 0 || m.sport_filter.includes(athlete.sport ?? ''),
    );
    if (metricsForAthlete.length === 0) continue;

    let resolved: ResolvedMetric[] = [];
    try {
      resolved = await resolveMetrics(athlete.id, metricsForAthlete, TRIGGER_WINDOW_DAYS);
    } catch (err) {
      console.warn('[progress-triggers] resolver threw, skipping athlete:', athlete.id, err);
      result.errors++;
      continue;
    }

    for (let i = 0; i < metricsForAthlete.length; i++) {
      const def = metricsForAthlete[i];
      const r = resolved[i];
      if (!r || !r.hasData) continue;
      const triggers = (def.notification_triggers as TriggersJson | null)?.triggers ?? [];
      for (const trig of triggers) {
        result.evaluations++;
        if (!evaluateTrigger(trig, r)) continue;
        result.matches++;

        // 4. Cooldown check.
        const hash = triggerHash(trig);
        const cooled = await isInCooldown(athlete.id, def.metric_key, hash, trig.cooldown_hours);
        if (cooled) {
          result.cooldown_skips++;
          continue;
        }

        // 5. Dispatch.
        try {
          const vars = buildVars(def, r);
          const nid = await createNotification({
            athleteId: athlete.id,
            type: trig.notification_type,
            vars,
            sourceRef: { type: 'progress_metric', id: def.metric_key },
          });
          if (nid) result.dispatched++;
          else result.engine_null++;

          // Audit row ALWAYS (even when engine returned null via fatigue/
          // quiet hours). Cooldown prevents re-evaluating a just-skipped
          // athlete on the next cron tick.
          await writeAlertAudit({
            athleteId: athlete.id,
            metricKey: def.metric_key,
            triggerHash: hash,
            metricValue: r.latest,
            deltaPct: r.deltaPct,
            notificationId: nid,
          });
        } catch (err) {
          console.error(
            '[progress-triggers] dispatch failed',
            { athleteId: athlete.id, metric: def.metric_key, err },
          );
          result.errors++;
        }
      }
    }
  }

  result.duration_ms = Date.now() - startedAt;
  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function hasTriggers(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const arr = (raw as TriggersJson).triggers;
  return Array.isArray(arr) && arr.length > 0;
}

function evaluateTrigger(trig: ProgressTrigger, r: ResolvedMetric): boolean {
  if (trig.kind === 'threshold') {
    if (r.latest == null) return false;
    switch (trig.operator) {
      case 'lt':  return r.latest <  trig.value;
      case 'lte': return r.latest <= trig.value;
      case 'gt':  return r.latest >  trig.value;
      case 'gte': return r.latest >= trig.value;
      default:    return false;
    }
  }
  if (trig.kind === 'trend') {
    if (r.deltaPct == null) return false;
    switch (trig.operator) {
      case 'delta_lt_pct': return r.deltaPct <  trig.value;
      case 'delta_gt_pct': return r.deltaPct >  trig.value;
      default:             return false;
    }
  }
  return false;
}

/** Stable hash of a trigger config. Cooldown is scoped per unique trigger. */
function triggerHash(trig: ProgressTrigger): string {
  const payload = JSON.stringify({
    k: trig.kind,
    o: trig.operator,
    v: trig.value,
    t: trig.notification_type,
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

async function isInCooldown(
  athleteId: string,
  metricKey: string,
  triggerHash: string,
  cooldownHours: number,
): Promise<boolean> {
  if (cooldownHours <= 0) return false;
  const sinceISO = new Date(Date.now() - cooldownHours * 3600_000).toISOString();
  const db = supabaseAdmin() as any;
  const { data } = await db
    .from('progress_metric_alerts')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('metric_key', metricKey)
    .eq('trigger_hash', triggerHash)
    .gte('fired_at', sinceISO)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function writeAlertAudit(args: {
  athleteId: string;
  metricKey: string;
  triggerHash: string;
  metricValue: number | null;
  deltaPct: number | null;
  notificationId: string | null;
}): Promise<void> {
  const db = supabaseAdmin() as any;
  await db.from('progress_metric_alerts').insert({
    athlete_id: args.athleteId,
    metric_key: args.metricKey,
    trigger_hash: args.triggerHash,
    metric_value: args.metricValue,
    delta_pct: args.deltaPct,
    notification_id: args.notificationId,
  });
}

function buildVars(
  def: ProgressMetricDef,
  r: ResolvedMetric,
): Record<string, string | number> {
  const latest = r.latest ?? 0;
  const wantsDecimal = def.display_unit === 'h' || def.display_unit === '/10' || def.display_unit === 's';
  const latestStr = wantsDecimal ? latest.toFixed(1) : String(Math.round(latest));
  const deltaStr = r.deltaPct != null ? String(Math.abs(Math.round(r.deltaPct))) : '0';
  return {
    display_name: def.display_name,
    metric_key: def.metric_key,
    latest: latestStr,
    unit: def.display_unit,
    delta: deltaStr,
    window_days: String(TRIGGER_WINDOW_DAYS),
  };
}
