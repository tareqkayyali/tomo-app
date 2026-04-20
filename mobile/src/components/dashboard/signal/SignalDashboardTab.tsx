/**
 * SignalDashboardTab — composes the six sections of the Signal Dashboard's
 * "Dashboard" sub-tab from boot data.
 *
 * Sections (staggered enter, 80ms apart):
 *   1. FocusHero               readiness ring + coaching line
 *   2. WhatsComingTimeline     next training · next match · next exam
 *   3. SleepTrendCard          7-night sparkline + debt
 *   4. BenchmarkGrid           top strength + top gap
 *   5. WeeklyPulseStrip        HRV · Load · Wellness
 *   6. TomoTakeCard            closing coaching line
 *
 * Data source: `bootData` (single boot call). Derivations are computed
 * client-side with memoization and graceful fallbacks — every section hides
 * or shows a lightweight empty state when inputs are missing rather than
 * breaking the column layout.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import type { BootData } from '../../../services/api';
import { useEnter } from '../../../hooks/useEnter';
import { FocusHero } from './FocusHero';
import { WhatsComingTimeline, type Milestone } from './WhatsComingTimeline';
import { SleepTrendCard } from './SleepTrendCard';
import { BenchmarkGrid } from './BenchmarkGrid';
import { WeeklyPulseStrip, type PulseCell } from './WeeklyPulseStrip';
import { TomoTakeCard } from './TomoTakeCard';

const SLEEP_TARGET_HOURS = 8.5;

interface Props {
  bootData: BootData | null;
  modeLabel: string;
  signalCoaching: string;
  onMilestonePress?: (m: Milestone) => void;
  onSleepPress?: () => void;
  onStrengthPress?: () => void;
  onGapPress?: () => void;
  onPulseCellPress?: (index: number) => void;
}

export function SignalDashboardTab({
  bootData,
  modeLabel,
  signalCoaching,
  onMilestonePress,
  onSleepPress,
  onStrengthPress,
  onGapPress,
  onPulseCellPress,
}: Props) {
  const hero = useEnter(0);
  const timeline = useEnter(80);
  const sleep = useEnter(160);
  const growth = useEnter(240);
  const pulse = useEnter(320);
  const take = useEnter(400);

  const readiness = useMemo(() => deriveReadiness(bootData), [bootData]);
  const milestones = useMemo(() => deriveMilestones(bootData), [bootData]);
  const sleepData = useMemo(() => deriveSleep(bootData), [bootData]);
  const pulseCells = useMemo(() => derivePulse(bootData), [bootData]);
  const highlightWord = useMemo(
    () => pickHighlightWord(signalCoaching),
    [signalCoaching],
  );

  const strength = bootData?.benchmarkSummary?.topStrengthDetail ?? null;
  const gap = bootData?.benchmarkSummary?.topGapDetail ?? null;

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.section, hero]}>
        <FocusHero
          readiness={readiness}
          modeLabel={modeLabel}
          coachingMessage={signalCoaching}
          highlightWord={highlightWord}
        />
      </Animated.View>

      {milestones.length > 0 && (
        <Animated.View style={[styles.section, timeline]}>
          <WhatsComingTimeline
            milestones={milestones}
            onMilestonePress={onMilestonePress}
          />
        </Animated.View>
      )}

      {sleepData && (
        <Animated.View style={[styles.section, sleep]}>
          <SleepTrendCard
            nights={sleepData.nights}
            nightsLabels={sleepData.nightsLabels}
            weekAvg={sleepData.weekAvg}
            target={sleepData.target}
            debt={sleepData.debt}
            trend={sleepData.trend}
            onPress={onSleepPress}
          />
        </Animated.View>
      )}

      {(strength || gap) && (
        <Animated.View style={[styles.section, growth]}>
          <BenchmarkGrid
            strength={strength}
            gap={gap}
            onStrengthPress={onStrengthPress}
            onGapPress={onGapPress}
          />
        </Animated.View>
      )}

      {pulseCells.length > 0 && (
        <Animated.View style={[styles.section, pulse]}>
          <WeeklyPulseStrip cells={pulseCells} onCellPress={onPulseCellPress} />
        </Animated.View>
      )}

      {signalCoaching ? (
        <Animated.View style={[styles.section, take]}>
          <TomoTakeCard message={signalCoaching} />
        </Animated.View>
      ) : null}
    </View>
  );
}

// ── Derivations ────────────────────────────────────────────────────

function deriveReadiness(boot: BootData | null): number {
  if (!boot) return 0;
  const snap = boot.snapshot as Record<string, unknown> | null;
  const raw = (snap?.readiness_score as number | undefined)
    ?? (snap?.readiness as number | undefined)
    ?? boot.recentVitals?.[0]?.readiness_score
    ?? 0;
  return Math.max(0, Math.min(100, Number(raw) || 0));
}

function deriveMilestones(boot: BootData | null): Milestone[] {
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

type SleepDerived = {
  nights: (number | null)[];
  nightsLabels: string[];
  weekAvg: number;
  target: number;
  debt: number;
  trend: 'rising' | 'falling' | 'flat';
};

function deriveSleep(boot: BootData | null): SleepDerived | null {
  if (!boot) return null;
  const recent = boot.recentVitals ?? [];
  if (recent.length === 0) return null;

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  // Build last-7-days series ending today, most recent LAST.
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
    const iso = d.toISOString().slice(0, 10);
    nights.push(dayMap.get(iso) ?? null);
    nightsLabels.push(dayLabels[d.getDay()]);
  }

  const observed = nights.filter((n): n is number => typeof n === 'number');
  if (observed.length === 0) return null;
  const weekAvg = observed.reduce((a, b) => a + b, 0) / observed.length;
  const debt = Math.max(
    0,
    observed.reduce((acc, h) => acc + Math.max(0, SLEEP_TARGET_HOURS - h), 0),
  );

  // Trend: compare first half vs second half of the observed series.
  const mid = Math.floor(observed.length / 2);
  if (observed.length >= 3) {
    const firstHalf = observed.slice(0, mid);
    const lastHalf = observed.slice(mid);
    const fhAvg = firstHalf.reduce((a, b) => a + b, 0) / Math.max(1, firstHalf.length);
    const lhAvg = lastHalf.reduce((a, b) => a + b, 0) / Math.max(1, lastHalf.length);
    const delta = lhAvg - fhAvg;
    const trend: SleepDerived['trend'] =
      delta > 0.15 ? 'rising' : delta < -0.15 ? 'falling' : 'flat';
    return { nights, nightsLabels, weekAvg, target: SLEEP_TARGET_HOURS, debt, trend };
  }
  return { nights, nightsLabels, weekAvg, target: SLEEP_TARGET_HOURS, debt, trend: 'flat' };
}

function derivePulse(boot: BootData | null): PulseCell[] {
  if (!boot) return [];
  const cells: PulseCell[] = [];

  // HRV — most recent vs 28-day client-side baseline is not possible without
  // a longer window; fall back to "vs yesterday" when yesterdayVitals exists,
  // otherwise show value only.
  const hrv = boot.recentVitals?.find(
    (v) => typeof v.hrv_morning_ms === 'number',
  )?.hrv_morning_ms;
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

  // Load — sum of last 7 days of dailyLoad.trainingLoadAu + ACWR label.
  const loads = (boot.dailyLoad ?? [])
    .slice(0, 28)
    .map((d) => d.trainingLoadAu || 0);
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

  // Wellness — 7-day mean of recentVitals.mood (1–10 scale).
  const moods = (boot.recentVitals ?? [])
    .map((v) => v.mood)
    .filter((m): m is number => typeof m === 'number');
  if (moods.length > 0) {
    const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
    // Compare first half vs last half for week/week delta (approximate — full
    // rolling window requires >7 days of data, not in this payload).
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

/**
 * Finds a single adjective in the coaching message to highlight in sage-light.
 * Prefers action-forward words (technical, recovery, explosive, easy, smart,
 * hard, light) that map to the "action word" of the day. Falls back to no
 * highlight when none are present.
 */
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
function pickHighlightWord(msg: string): string | undefined {
  if (!msg) return undefined;
  const lower = msg.toLowerCase();
  for (const w of HIGHLIGHT_CANDIDATES) {
    if (lower.includes(w)) return w;
  }
  return undefined;
}

const styles = StyleSheet.create({
  root: {
    gap: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
  },
  section: {
    // no gap — container controls vertical rhythm
  },
});
