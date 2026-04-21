/**
 * Progress Metrics Resolver
 *
 * Given a list of metric definitions from the `progress_metrics` CMS table +
 * an athlete ID + a window size (days), compute each metric's
 *   { latest, avg, deltaPct, hasData }
 * by dispatching on `source_kind`:
 *
 *   snapshot_field       → athlete_snapshots.{source_field} (point-in-time)
 *   daily_vitals_latest  → most-recent athlete_daily_vitals.{source_field}
 *   daily_vitals_avg     → avg of athlete_daily_vitals.{source_field} over window
 *   checkin_latest       → most-recent checkins.{source_field}
 *   checkin_avg          → avg of checkins.{source_field} over window
 *   daily_load_sum       → sum of athlete_daily_load.{source_field} over window
 *   event_aggregate      → custom event-sourced aggregates (study_hours_7d, etc.)
 *   benchmark            → latest test_log.{source_field} (athlete-measured)
 *
 * All DB access goes through supabaseAdmin (service role). Per-athlete scoping
 * is enforced in-query; the resolver never trusts any caller-supplied field
 * except metric_key → source_field, which comes from the CMS row itself.
 *
 * Design choices:
 *  - Parallel-fetches via Promise.allSettled so one bad metric never fails the
 *    whole panel.
 *  - "Latest" = today's value if it exists, else the most recent row within
 *    the window. Keeps the UI honest on days with no check-in yet.
 *  - `avg` explicitly excludes the `latest` row so the delta is "today vs the
 *    rest of the window" — a delta against "today included" would flatten the
 *    signal.
 *  - `hasData` = false when both latest and avg are null; callers should hide
 *    the card rather than render an empty ring.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';

// ── Types ─────────────────────────────────────────────────────────────────

export type ProgressMetricDef = {
  id: string;
  metric_key: string;
  display_name: string;
  display_unit: string;
  category: 'readiness' | 'wellness' | 'academic' | 'performance' | 'engagement';
  source_kind:
    | 'snapshot_field'
    | 'daily_vitals_avg'
    | 'daily_vitals_latest'
    | 'checkin_avg'
    | 'checkin_latest'
    | 'daily_load_sum'
    | 'event_aggregate'
    | 'benchmark';
  source_field: string;
  direction: 'higher_better' | 'lower_better' | 'neutral';
  value_min: number | null;
  value_max: number | null;
  sort_order: number;
  sport_filter: string[] | null;
  is_enabled: boolean;
  notification_triggers: unknown | null;
};

export interface ResolvedMetric {
  key: string;
  displayName: string;
  displayUnit: string;
  category: ProgressMetricDef['category'];
  direction: ProgressMetricDef['direction'];
  valueMin: number | null;
  valueMax: number | null;
  latest: number | null;
  avg: number | null;
  deltaPct: number | null;
  hasData: boolean;
}

// ── Loader ────────────────────────────────────────────────────────────────

/**
 * Load all enabled metrics from the CMS, optionally filtered by sport.
 * Sport filter rule: if a metric has `sport_filter = NULL`, it applies to all
 * sports; otherwise it applies only when the athlete's sport is in the array.
 */
export async function loadEnabledMetrics(
  sport: string | null,
): Promise<ProgressMetricDef[]> {
  const db = supabaseAdmin();
  const { data, error } = await (db as any)
    .from('progress_metrics')
    .select('*')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[progress] Failed to load metrics:', error.message);
    return [];
  }

  const rows = (data ?? []) as ProgressMetricDef[];
  if (!sport) return rows.filter((r) => !r.sport_filter || r.sport_filter.length === 0);
  return rows.filter(
    (r) => !r.sport_filter || r.sport_filter.length === 0 || r.sport_filter.includes(sport),
  );
}

// ── Resolver entry point ──────────────────────────────────────────────────

/**
 * Resolve a list of metric definitions against an athlete's data.
 * Never throws; failed metrics return `{ hasData: false }` so the caller can
 * simply drop them from the rendered grid.
 */
export async function resolveMetrics(
  athleteId: string,
  defs: ProgressMetricDef[],
  windowDays: number,
): Promise<ResolvedMetric[]> {
  const results = await Promise.allSettled(
    defs.map((def) => resolveSingle(athleteId, def, windowDays)),
  );
  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : emptyResolved(defs[i]),
  );
}

// ── Single-metric resolution ──────────────────────────────────────────────

async function resolveSingle(
  athleteId: string,
  def: ProgressMetricDef,
  windowDays: number,
): Promise<ResolvedMetric> {
  const base: Omit<ResolvedMetric, 'latest' | 'avg' | 'deltaPct' | 'hasData'> = {
    key: def.metric_key,
    displayName: def.display_name,
    displayUnit: def.display_unit,
    category: def.category,
    direction: def.direction,
    valueMin: def.value_min,
    valueMax: def.value_max,
  };

  const pair = await fetchLatestAndAvg(athleteId, def, windowDays);
  const { latest, avg } = pair;
  const deltaPct =
    latest != null && avg != null && avg !== 0
      ? ((latest - avg) / avg) * 100
      : null;
  const hasData = latest != null || avg != null;

  return {
    ...base,
    latest,
    avg,
    deltaPct,
    hasData,
  };
}

function emptyResolved(def: ProgressMetricDef): ResolvedMetric {
  return {
    key: def.metric_key,
    displayName: def.display_name,
    displayUnit: def.display_unit,
    category: def.category,
    direction: def.direction,
    valueMin: def.value_min,
    valueMax: def.value_max,
    latest: null,
    avg: null,
    deltaPct: null,
    hasData: false,
  };
}

// ── Source-kind dispatcher ────────────────────────────────────────────────

type Pair = { latest: number | null; avg: number | null };

async function fetchLatestAndAvg(
  athleteId: string,
  def: ProgressMetricDef,
  windowDays: number,
): Promise<Pair> {
  switch (def.source_kind) {
    case 'snapshot_field':
      return fetchSnapshotField(athleteId, def.source_field);

    case 'daily_vitals_latest':
    case 'daily_vitals_avg':
      return fetchDailyVitals(athleteId, def.source_field, windowDays);

    case 'checkin_latest':
    case 'checkin_avg':
      return fetchCheckins(athleteId, def.source_field, windowDays);

    case 'daily_load_sum':
      return fetchDailyLoadSum(athleteId, def.source_field, windowDays);

    case 'event_aggregate':
      return fetchEventAggregate(athleteId, def.source_field, windowDays);

    case 'benchmark':
      return fetchBenchmark(athleteId, def.source_field);

    default:
      return { latest: null, avg: null };
  }
}

// ── Snapshot ──────────────────────────────────────────────────────────────

async function fetchSnapshotField(
  athleteId: string,
  field: string,
): Promise<Pair> {
  const db = supabaseAdmin();
  const { data } = await (db as any)
    .from('athlete_snapshots')
    .select(field)
    .eq('athlete_id', athleteId)
    .maybeSingle();
  const latest = (data as any)?.[field];
  const num = typeof latest === 'number' ? latest : null;
  // Snapshot fields are point-in-time; the "average" comparison for
  // snapshot-only metrics has no clean source, so we omit avg/delta. The UI
  // will show latest value + no delta chip when avg is null.
  return { latest: num, avg: null };
}

// ── Daily vitals ──────────────────────────────────────────────────────────

async function fetchDailyVitals(
  athleteId: string,
  field: string,
  windowDays: number,
): Promise<Pair> {
  const db = supabaseAdmin();
  const startDate = windowStartDate(windowDays);
  const { data } = await (db as any)
    .from('athlete_daily_vitals')
    .select(`vitals_date, ${field}`)
    .eq('athlete_id', athleteId)
    .gte('vitals_date', startDate)
    .order('vitals_date', { ascending: false });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return computePairFromRows(rows, field);
}

// ── Check-ins ─────────────────────────────────────────────────────────────

async function fetchCheckins(
  athleteId: string,
  field: string,
  windowDays: number,
): Promise<Pair> {
  const db = supabaseAdmin();
  const startDate = windowStartDate(windowDays);
  const { data } = await (db as any)
    .from('checkins')
    .select(`date, ${field}`)
    .eq('user_id', athleteId)
    .gte('date', startDate)
    .order('date', { ascending: false });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return computePairFromRows(rows, field);
}

// ── Daily load ────────────────────────────────────────────────────────────

async function fetchDailyLoadSum(
  athleteId: string,
  field: string,
  windowDays: number,
): Promise<Pair> {
  const db = supabaseAdmin();
  const startDate = windowStartDate(windowDays);
  const { data } = await (db as any)
    .from('athlete_daily_load')
    .select(`load_date, ${field}`)
    .eq('athlete_id', athleteId)
    .gte('load_date', startDate)
    .order('load_date', { ascending: false });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const values = rows
    .map((r) => Number(r[field]))
    .filter((n) => Number.isFinite(n));

  // For load_sum, "latest" = today's load, "avg" = mean of prior days in window.
  const latest = values.length > 0 ? values[0] : null;
  const rest = values.slice(1);
  const avg = rest.length > 0 ? rest.reduce((a, b) => a + b, 0) / rest.length : null;
  return { latest, avg };
}

// ── Event aggregate (custom keys) ─────────────────────────────────────────

async function fetchEventAggregate(
  athleteId: string,
  key: string,
  windowDays: number,
): Promise<Pair> {
  switch (key) {
    case 'study_hours_7d':
      return fetchStudyHours(athleteId, windowDays);

    // Extend here for other custom aggregates (journal_rate, session_count...).
    // Unknown keys fall through to null so a miss-configured metric simply
    // shows no data instead of throwing.
    default:
      return { latest: null, avg: null };
  }
}

async function fetchStudyHours(
  athleteId: string,
  windowDays: number,
): Promise<Pair> {
  // Today's total = sum of study_block durations on today's date.
  // Window avg = mean of daily totals over the prior N−1 days.
  const db = supabaseAdmin();
  const now = new Date();
  const today = toDateStr(now);
  const windowStart = windowStartDate(windowDays);

  const { data } = await (db as any)
    .from('calendar_events')
    .select('event_type, start_at, end_at')
    .eq('user_id', athleteId)
    .eq('event_type', 'study_block')
    .gte('start_at', windowStart + 'T00:00:00Z')
    .lte('start_at', today + 'T23:59:59Z');

  const rows = (data ?? []) as Array<{ start_at: string; end_at: string | null }>;
  const byDay = new Map<string, number>();
  for (const r of rows) {
    if (!r.end_at) continue;
    const startMs = Date.parse(r.start_at);
    const endMs = Date.parse(r.end_at);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    const day = r.start_at.slice(0, 10);
    const hours = (endMs - startMs) / 3_600_000;
    byDay.set(day, (byDay.get(day) ?? 0) + hours);
  }

  const latest = byDay.get(today) ?? 0;
  const priorDays: number[] = [];
  for (const [day, hours] of byDay.entries()) {
    if (day !== today) priorDays.push(hours);
  }
  // Fill zeros for days with no study events so the average isn't inflated by
  // the "study on some days" pattern — 0-hour days should drag the mean down.
  const zerosNeeded = Math.max(0, windowDays - 1 - priorDays.length);
  for (let i = 0; i < zerosNeeded; i++) priorDays.push(0);
  const avg = priorDays.length > 0 ? priorDays.reduce((a, b) => a + b, 0) / priorDays.length : null;
  return { latest, avg };
}

// ── Benchmark (athlete-measured tests) ────────────────────────────────────

async function fetchBenchmark(
  athleteId: string,
  testKey: string,
): Promise<Pair> {
  // Latest value = most recent test_log row for this test. Avg = mean of the
  // athlete's prior attempts (excluding latest) so the delta tells the
  // athlete whether they're getting better.
  const db = supabaseAdmin();
  const { data } = await (db as any)
    .from('test_log')
    .select('value, logged_at')
    .eq('athlete_id', athleteId)
    .eq('test_key', testKey)
    .order('logged_at', { ascending: false })
    .limit(12);

  const rows = (data ?? []) as Array<{ value: number | string; logged_at: string }>;
  const values = rows
    .map((r) => (typeof r.value === 'number' ? r.value : Number(r.value)))
    .filter((n) => Number.isFinite(n));

  if (values.length === 0) return { latest: null, avg: null };
  const latest = values[0];
  const rest = values.slice(1);
  const avg = rest.length > 0 ? rest.reduce((a, b) => a + b, 0) / rest.length : null;
  return { latest, avg };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function computePairFromRows(
  rows: Array<Record<string, unknown>>,
  field: string,
): Pair {
  const values: number[] = [];
  for (const r of rows) {
    const v = r[field];
    const n = typeof v === 'number' ? v : v == null ? NaN : Number(v);
    if (Number.isFinite(n)) values.push(n);
  }
  if (values.length === 0) return { latest: null, avg: null };
  const latest = values[0];
  const rest = values.slice(1);
  const avg = rest.length > 0 ? rest.reduce((a, b) => a + b, 0) / rest.length : null;
  return { latest, avg };
}

/** Inclusive window start date (YYYY-MM-DD) for `windowDays` ending today. */
function windowStartDate(windowDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(1, windowDays));
  return toDateStr(d);
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
