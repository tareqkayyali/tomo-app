import type { BootData, OutputSnapshot, BenchmarkMetric } from '../../../services/api';
import { bucketPercentile, type MetricBucket } from './pulseDashboardLogic';

const METRIC_TO_TESTTYPE: Record<string, string> = {
  sprint_10m: '10m-sprint',
  sprint_20m: '20m-sprint',
  flying_20m: 'flying-20m',
  sprint_30m: '30m-sprint',
  est_max_speed: 'flying-10m',
  cmj: 'cmj',
  broad_jump: 'broad-jump',
  agility_505: '5-0-5',
  agility_ttest: 't-test',
  agility_5105: '5-10-5-agility',
  illinois_agility: 'illinois-agility',
  arrowhead_agility: 'arrowhead-agility',
  vo2max: 'yoyo-ir1',
  reaction_time: 'reaction-time',
  squat_rel: '1rm-squat',
  grip_strength: 'grip-strength',
  body_fat_pct: 'body-fat',
  hrv_rmssd: 'hrv',
};

function testTypesForMetric(metricKey: string): string[] {
  const mapped = METRIC_TO_TESTTYPE[metricKey];
  return mapped ? [metricKey, mapped] : [metricKey];
}

function scoresLast7ForMetric(
  recentTests: OutputSnapshot['metrics']['recentTests'] | undefined,
  metricKey: string,
): number[] {
  const types = new Set(testTypesForMetric(metricKey));
  const rows = (recentTests ?? [])
    .filter((t) => types.has(t.testType))
    .sort((a, b) => a.date.localeCompare(b.date));
  const scores = rows.slice(-7).map((r) => r.score);
  return scores.length >= 2 ? scores : rows.length === 1 ? [rows[0].score, rows[0].score] : [0, 0];
}

export type MetricChipModel = {
  bucket: MetricBucket;
  metric: BenchmarkMetric;
  spark: number[];
};

export function buildMetricChipBuckets(output: OutputSnapshot | null): {
  strong: MetricChipModel[];
  holding: MetricChipModel[];
  watch: MetricChipModel[];
} {
  const strong: MetricChipModel[] = [];
  const holding: MetricChipModel[] = [];
  const watch: MetricChipModel[] = [];
  const cats = output?.metrics?.categories ?? [];
  for (const c of cats) {
    for (const m of c.metrics) {
      const b = bucketPercentile(m.percentile);
      const spark = scoresLast7ForMetric(output?.metrics?.recentTests, m.metricKey);
      const row = { bucket: b, metric: m, spark };
      if (b === 'strong') strong.push(row);
      else if (b === 'holding') holding.push(row);
      else watch.push(row);
    }
  }
  const byPct = (a: MetricChipModel, b: MetricChipModel) => b.metric.percentile - a.metric.percentile;
  strong.sort(byPct);
  holding.sort(byPct);
  watch.sort((a, b) => a.metric.percentile - b.metric.percentile);
  return { strong, holding, watch };
}

/** ISO week id YYYY-Www */
export function isoWeekId(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const dayNr = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNr + 3);
  const firstThursday = d.getTime();
  d.setUTCMonth(0, 1);
  if (d.getUTCDay() !== 4) {
    d.setUTCMonth(0, 1 + ((4 - d.getUTCDay() + 7) % 7));
  }
  const week1 = d.getTime();
  const w = 1 + Math.round((firstThursday - week1) / 604800000);
  return `${d.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}

export function last12WeekLoads(daily: BootData['dailyLoad']): number[] {
  const rows = daily ?? [];
  const map = new Map<string, number>();
  for (const r of rows) {
    const id = isoWeekId(r.date);
    map.set(id, (map.get(id) ?? 0) + (r.trainingLoadAu || 0));
  }
  const keys = [...map.keys()].sort();
  const pick = keys.slice(-12);
  return pick.map((k) => map.get(k) ?? 0);
}

export function intensitySteps(loads: number[]): number[] {
  if (loads.length === 0) return [];
  const sorted = [...loads].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
  return loads.map((v) => {
    if (v <= q(0)) return 0;
    if (v <= q(0.25)) return 1;
    if (v <= q(0.5)) return 2;
    if (v <= q(0.75)) return 3;
    return 4;
  });
}

export function thisCalendarMonthStats(boot: BootData | null): {
  sessions: number;
  loadAu: number;
  streak: number;
  wellnessAvg: number | null;
} {
  if (!boot) return { sessions: 0, loadAu: 0, streak: 0, wellnessAvg: null };
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let sessions = 0;
  let loadAu = 0;
  for (const d of boot.dailyLoad ?? []) {
    if (d.date.startsWith(prefix)) {
      sessions += d.sessionCount || 0;
      loadAu += d.trainingLoadAu || 0;
    }
  }
  const vit = boot.recentVitals ?? [];
  const monthVitals = vit.filter((v) => v.date.startsWith(prefix));
  let wellnessAvg: number | null = null;
  if (monthVitals.length > 0) {
    let sum = 0;
    let n = 0;
    for (const v of monthVitals) {
      const parts = [v.mood, v.energy, v.soreness].filter((x): x is number => typeof x === 'number');
      if (parts.length) {
        sum += parts.reduce((a, b) => a + b, 0) / parts.length;
        n += 1;
      }
    }
    if (n > 0) wellnessAvg = sum / n;
  }
  return { sessions, loadAu, streak: boot.streak ?? 0, wellnessAvg };
}

/**
 * GitHub-style heatmap: 7 rows × 12 columns (84 days, oldest week left).
 * Each cell is 0 (empty) … 4 (heaviest vs range).
 */
export function heatmapIntensity12x7(daily: BootData['dailyLoad']): number[][] {
  const map = new Map<string, number>();
  for (const r of daily ?? []) {
    map.set(r.date, r.trainingLoadAu || 0);
  }
  const today = new Date();
  const loads: number[] = [];
  for (let ago = 83; ago >= 0; ago--) {
    const d = new Date(today);
    d.setDate(today.getDate() - ago);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    loads.push(map.get(iso) ?? 0);
  }
  const max = Math.max(1, ...loads);
  const intensity = loads.map((v) => {
    if (v <= 0) return 0;
    const n = v / max;
    if (n < 0.12) return 1;
    if (n < 0.3) return 2;
    if (n < 0.55) return 3;
    return 4;
  });
  const m: number[][] = Array.from({ length: 7 }, () => Array(12).fill(0));
  for (let c = 0; c < 12; c++) {
    for (let r = 0; r < 7; r++) {
      m[r][c] = intensity[c * 7 + r] ?? 0;
    }
  }
  return m;
}
