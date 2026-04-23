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
import { WeeklyPulseStrip } from './WeeklyPulseStrip';
import { TomoTakeCard } from './TomoTakeCard';
import {
  deriveReadiness,
  deriveMilestones,
  deriveSleep,
  derivePulse,
  pickHighlightWord,
} from './dashboardPulseDerivations';

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
