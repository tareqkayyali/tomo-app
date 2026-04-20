/**
 * EngagementBarSection — Streak / consistency progress bar.
 *
 * Config:
 *   metric: string — "current_streak" (default)
 *   milestones: number[] — e.g. [7, 14, 30, 60, 90]
 *   show_freeze_tokens: boolean
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { fontFamily } from '../../../theme/typography';
import type { SectionProps } from './DashboardSectionRenderer';

export const EngagementBarSection = memo(function EngagementBarSection({
  config,
  bootData,
}: SectionProps) {
  const { colors } = useTheme();
  const milestones = (config.milestones as number[]) ?? [7, 14, 30, 60, 90];

  const streak = bootData.streak ?? 0;
  const nextMilestone = milestones.find((m) => m > streak) ?? milestones[milestones.length - 1];
  const prevMilestone = [...milestones].reverse().find((m) => m <= streak) ?? 0;
  const pctToNext = nextMilestone > prevMilestone
    ? ((streak - prevMilestone) / (nextMilestone - prevMilestone)) * 100
    : 100;

  return (
    <View style={[styles.container, { backgroundColor: colors.cream03, borderColor: colors.cream10 }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.tomoCream }]}>Consistency Streak</Text>
        <Text style={[styles.streakText, { color: colors.tomoSage }]}>{streak} days</Text>
      </View>

      <View style={[styles.barTrack, { backgroundColor: colors.cream10 }]}>
        <View style={[styles.barFill, { width: `${Math.min(pctToNext, 100)}%`, backgroundColor: colors.tomoSage }]} />
        {/* Milestone markers */}
        {milestones.map((m) => {
          const mPct = nextMilestone > 0
            ? ((m - prevMilestone) / (nextMilestone - prevMilestone)) * 100
            : 0;
          if (mPct < 0 || mPct > 100) return null;
          return (
            <View
              key={m}
              style={[
                styles.milestoneMarker,
                { left: `${mPct}%`, backgroundColor: streak >= m ? colors.tomoSage : colors.muted },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.muted }]}>
          {prevMilestone > 0 ? `${prevMilestone}d` : 'Start'}
        </Text>
        <Text style={[styles.label, { color: colors.muted }]}>
          Next: {nextMilestone}d
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    letterSpacing: -0.2,
  },
  streakText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  milestoneMarker: {
    position: 'absolute',
    top: -2,
    width: 3,
    height: 10,
    borderRadius: 1.5,
    marginLeft: -1.5,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  label: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});
