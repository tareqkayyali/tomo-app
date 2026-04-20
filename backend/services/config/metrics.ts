/**
 * ════════════════════════════════════════════════════════════════════════════
 * Config Engine — Read Metrics
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Every configLoader call emits `config.read` via this module so ops can
 * graph:
 *   - % of reads hitting cache vs. DB vs. fallback DEFAULT
 *   - Per-config-key read volume (which knobs are hot)
 *   - Rollout hit-rate (% of reads where the athlete was in the cohort)
 *
 * The first-cut implementation is a structured console.info line so it
 * flows into Railway logs. A follow-up PR swaps this for whatever metrics
 * sink the platform standardises on (OTel? Datadog? Grafana Loki?).
 * Keeping the emitter pluggable means no consumer code changes when we
 * upgrade the backend.
 * ════════════════════════════════════════════════════════════════════════════
 */

import type { ConfigReadSource } from './types';

export interface ConfigReadMetric {
  config_key:    string;
  source:        ConfigReadSource;
  in_rollout:    boolean;
  validation_ok: boolean;
  elapsed_ms:    number;
}

type MetricSink = (metric: ConfigReadMetric) => void;

let sink: MetricSink = defaultSink;

/**
 * Emit a config.read metric. Called by configLoader; no consumer needs to
 * call this directly.
 */
export function emitConfigRead(metric: ConfigReadMetric): void {
  try {
    sink(metric);
  } catch (err) {
    // Never let metric emission break a read path.
    // eslint-disable-next-line no-console
    console.warn('[configMetrics] sink threw', err);
  }
}

/**
 * Swap the sink — used by tests and by the eventual platform-metrics PR.
 */
export function setConfigMetricSink(next: MetricSink): void {
  sink = next;
}

/**
 * Reset to the default structured-log sink. Used between tests.
 */
export function resetConfigMetricSink(): void {
  sink = defaultSink;
}

function defaultSink(metric: ConfigReadMetric): void {
  // Structured log → Railway ingests → ops graphs it. Keep field names
  // stable; the dashboard queries key off these exact names.
  // eslint-disable-next-line no-console
  console.info('config.read', JSON.stringify(metric));
}
