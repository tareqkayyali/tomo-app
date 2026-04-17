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
import { borderRadius, spacing } from '../../../theme/spacing';
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
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.chalk }]}>Consistency Streak</Text>
        <Text style={[styles.streakText, { color: '#7a9b76' }]}>{streak} days</Text>
      </View>

      <View style={[styles.barTrack, { backgroundColor: colors.chalkGhost }]}>
        <View style={[styles.barFill, { width: `${Math.min(pctToNext, 100)}%` }]} />
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
                { left: `${mPct}%`, backgroundColor: streak >= m ? '#7a9b76' : colors.chalkDim },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.chalkDim }]}>
          {prevMilestone > 0 ? `${prevMilestone}d` : 'Start'}
        </Text>
        <Text style={[styles.label, { color: colors.chalkDim }]}>
          Next: {nextMilestone}d
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
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
    fontFamily: fontFamily.medium,
    fontSize: 14,
  },
  streakText: {
    fontFamily: fontFamily.display,
    fontSize: 16,
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
    backgroundColor: '#7a9b76',
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
    fontFamily: fontFamily.note,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});
