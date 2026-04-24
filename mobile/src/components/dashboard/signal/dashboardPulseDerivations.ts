/**
 * Shared derivations for Pulse / Signal dashboard (CMS sections + legacy tab).
 * Single source of truth for readiness, milestones, sleep series, and pulse cells.
 */

import type { BootData } from '../../../services/api';
import type { Milestone } from './WhatsComingTimeline';
import type { PulseCell } from './WeeklyPulseStrip';

export const SLEEP_TARGET_HOURS = 8.5;

/** Calendar YYYY-MM-DD in the device's local timezone (matches boot API + DB `date`). */
function localCalendarYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type SleepTrendDerived = {
  nights: (number | null)[];
  nightsLabels: string[];
  weekAvg: number;
  target: number;
  debt: number;
  trend: 'rising' | 'falling' | 'flat';
};

export function deriveReadiness(boot: BootData | null): number {
  if (!boot) return 0;
  if (boot.readinessFresh === false) return 0;
  const snap = boot.snapshot as Record<string, unknown> | null;
  const raw =
    (snap?.readiness_score as number | undefined) ??
    (snap?.readiness as number | undefined) ??
    0;
  return Math.max(0, Math.min(100, Number(raw) || 0));
}

export function deriveMilestones(boot: BootData | null): Milestone[] {
  if (!boot) return [];
  const out: Milestone[] = [];

  const nextTraining = (boot.upcomingEvents ?? []).find(
    (e) => e.type === 'training' || e.type === 'gym' || e.type === 'club',
  );
  if (nextTraining) {
    out.push({
      id: nextTraining.id,
      title: nextTraining.title,
      kind: nextTraining.type,
      startAt: nextTraining.startAt,
    });
  }

  const nextMatch = (boot.upcomingEvents ?? []).find((e) => e.type === 'match');
  if (nextMatch) {
    out.push({
      id: nextMatch.id,
      title: nextMatch.title,
      kind: 'match',
      startAt: nextMatch.startAt,
    });
  }

  const nextExam = (boot.upcomingExams ?? [])[0];
  if (nextExam) {
    out.push({
      id: `exam-${nextExam.date}-${nextExam.title}`,
      title: nextExam.title,
      kind: 'exam',
      startAt: nextExam.date,
    });
  }

  return out
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 3);
}

export function deriveSleep(boot: BootData | null): SleepTrendDerived | null {
  if (!boot) return null;
  const recent = boot.recentVitals ?? [];
  if (recent.length === 0) return null;

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const today = new Date();
  const nights: (number | null)[] = [];
  const nightsLabels: string[] = [];
  const dayMap = new Map<string, number | null>();
  for (const v of recent) {
    dayMap.set(v.date, v.sleep_hours);
  }
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    // Must use local calendar date — toISOString() is UTC and misaligns vs
    // boot `recentVitals[].date` (athlete-local YYYY-MM-DD from checkins).
    const ymd = localCalendarYmd(d);
    nights.push(dayMap.get(ymd) ?? null);
    nightsLabels.push(dayLabels[d.getDay()]);
  }

  const observed = nights.filter((n): n is number => typeof n === 'number');
  if (observed.length === 0) return null;
  const weekAvg = observed.reduce((a, b) => a + b, 0) / observed.length;
  const debt = Math.max(
    0,
    observed.reduce((acc, h) => acc + Math.max(0, SLEEP_TARGET_HOURS - h), 0),
  );

  const mid = Math.floor(observed.length / 2);
  if (observed.length >= 3) {
    const firstHalf = observed.slice(0, mid);
    const lastHalf = observed.slice(mid);
    const fhAvg = firstHalf.reduce((a, b) => a + b, 0) / Math.max(1, firstHalf.length);
    const lhAvg = lastHalf.reduce((a, b) => a + b, 0) / Math.max(1, lastHalf.length);
    const delta = lhAvg - fhAvg;
    const trend: SleepTrendDerived['trend'] =
      delta > 0.15 ? 'rising' : delta < -0.15 ? 'falling' : 'flat';
    return { nights, nightsLabels, weekAvg, target: SLEEP_TARGET_HOURS, debt, trend };
  }
  return { nights, nightsLabels, weekAvg, target: SLEEP_TARGET_HOURS, debt, trend: 'flat' };
}

export function derivePulse(boot: BootData | null): PulseCell[] {
  if (!boot) return [];
  const cells: PulseCell[] = [];

  const hrv = boot.recentVitals?.find((v) => typeof v.hrv_morning_ms === 'number')?.hrv_morning_ms;
  const yHrv = boot.yesterdayVitals?.hrv_morning_ms ?? null;
  if (typeof hrv === 'number') {
    let trend: string | undefined;
    if (typeof yHrv === 'number' && yHrv > 0) {
      const delta = Math.round(hrv - yHrv);
      if (delta !== 0) trend = `${delta > 0 ? '+' : '−'}${Math.abs(delta)} vs yesterday`;
      else trend = 'flat vs yesterday';
    }
    cells.push({ label: 'HRV', value: Math.round(hrv), unit: 'ms', trend });
  }

  const loads = (boot.dailyLoad ?? []).slice(0, 28).map((d) => d.trainingLoadAu || 0);
  if (loads.length > 0) {
    const last7 = loads.slice(0, 7);
    const last28 = loads.slice(0, 28);
    const weekSum = Math.round(last7.reduce((a, b) => a + b, 0));
    const acute = last7.reduce((a, b) => a + b, 0) / Math.max(1, last7.length);
    const chronic = last28.reduce((a, b) => a + b, 0) / Math.max(1, last28.length);
    const acwr = chronic > 0 ? acute / chronic : 0;
    cells.push({
      label: 'LOAD',
      value: weekSum,
      unit: 'au',
      trend: acwr > 0 ? `ACWR ${acwr.toFixed(2)}` : undefined,
    });
  }

  const moods = (boot.recentVitals ?? [])
    .map((v) => v.mood)
    .filter((m): m is number => typeof m === 'number');
  if (moods.length > 0) {
    const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
    const mid = Math.floor(moods.length / 2);
    const first = moods.slice(mid);
    const last = moods.slice(0, mid);
    const firstAvg = first.reduce((a, b) => a + b, 0) / Math.max(1, first.length);
    const lastAvg = last.reduce((a, b) => a + b, 0) / Math.max(1, last.length);
    const delta = lastAvg - firstAvg;
    const trend =
      moods.length >= 3 && Math.abs(delta) >= 0.1
        ? `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)} week/week`
        : undefined;
    cells.push({
      label: 'WELLNESS',
      value: avg.toFixed(1),
      unit: '/10',
      trend,
    });
  }

  return cells;
}

const HIGHLIGHT_CANDIDATES = [
  'technical',
  'recovery',
  'explosive',
  'easy',
  'smart',
  'hard',
  'light',
  'steady',
  'intense',
  'aerobic',
  'rest',
];

export function pickHighlightWord(msg: string): string | undefined {
  if (!msg) return undefined;
  const lower = msg.toLowerCase();
  for (const w of HIGHLIGHT_CANDIDATES) {
    if (lower.includes(w)) return w;
  }
  return undefined;
}
