/**
 * Pure helpers for Pulse dashboard — safe to unit test without RN.
 */

export type MetricBucket = 'strong' | 'holding' | 'watch';

/** Strong ≥75, holding 40–74, watch <40 */
export function bucketPercentile(percentile: number): MetricBucket {
  const p = Math.round(Number(percentile) || 0);
  if (p >= 75) return 'strong';
  if (p >= 40) return 'holding';
  return 'watch';
}

export type AcwrZone = 'detrain' | 'optimal' | 'risk';

/**
 * ACWR zones: detrain &lt; 0.8, optimal [0.8, 1.3], risk &gt; 1.3.
 * Boundaries 0.8 and 1.3 are inclusive in optimal.
 */
export function acwrZone(acwr: number): AcwrZone {
  if (!Number.isFinite(acwr) || acwr <= 0) return 'detrain';
  if (acwr < 0.8) return 'detrain';
  if (acwr <= 1.3) return 'optimal';
  return 'risk';
}

/** Most recent first: dailyLoad[0] = today. */
export function computeAcwrFromDailyLoad(
  dailyLoad: { trainingLoadAu: number }[] | undefined | null,
): number {
  const rows = dailyLoad ?? [];
  if (rows.length === 0) return 0;
  const last7 = rows.slice(0, 7);
  const last28 = rows.slice(0, 28);
  const acute = last7.reduce((a, d) => a + (d.trainingLoadAu || 0), 0) / Math.max(1, last7.length);
  const chronic = last28.reduce((a, d) => a + (d.trainingLoadAu || 0), 0) / Math.max(1, last28.length);
  if (chronic <= 0) return 0;
  return acute / chronic;
}

export type PulseVitalsEmptyState = {
  title: string;
  body: string;
};

export function getPulseVitalsEmptyState(): PulseVitalsEmptyState {
  return {
    title: 'Log your first vitals',
    body: 'Wearable sync or check-in unlocks HRV, sleep, and readiness trends here.',
  };
}

/** Last 7 calendar days ending today; missing as null. */
export function last7Series(
  pick: (row: { date: string; sleep_hours: number | null; hrv_morning_ms: number | null; readiness_score: number | null }) => number | null,
  rows: { date: string; sleep_hours: number | null; hrv_morning_ms: number | null; readiness_score: number | null }[],
): (number | null)[] {
  const map = new Map<string, number | null>();
  for (const r of rows) {
    map.set(r.date, pick(r));
  }
  const out: (number | null)[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push(map.has(iso) ? map.get(iso)! : null);
  }
  return out;
}

export function hasAnyVitalsSeries(
  hrv: (number | null)[],
  sleep: (number | null)[],
  readiness: (number | null)[],
): boolean {
  const has = (arr: (number | null)[]) => arr.some((v) => typeof v === 'number');
  return has(hrv) || has(sleep) || has(readiness);
}

/** e.g. percentile 92 → "92nd" */
export function ordinalPercentile(p: number): string {
  const n = Math.round(Math.min(100, Math.max(0, p)));
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}
