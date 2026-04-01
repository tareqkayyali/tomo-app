/**
 * WeekSummaryStrip — Horizontal stat cards for Progress tab
 *
 * Shows 4 stat pills: Check-ins, Avg Readiness, Tests Done, Points.
 * Glass-morphism background, icon + value + label layout.
 *
 * Matches prototype Progress "This Week" summary section.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from './SmartIcon';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';
import { spacing, fontFamily, borderRadius } from '../theme';

type StatItem = {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  color: string;
};

type WeekSummaryStripProps = {
  checkIns: number;
  totalDays: number;
  avgReadiness: number;
  testsDone: number;
  pointsEarned: number;
};

export function WeekSummaryStrip({
  checkIns,
  totalDays,
  avgReadiness,
  testsDone,
  pointsEarned,
}: WeekSummaryStripProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const stats: StatItem[] = [
    {
      icon: 'checkmark-circle',
      value: `${checkIns}/${totalDays}`,
      label: 'Check-ins',
      color: colors.readinessGreen,
    },
    {
      icon: 'pulse',
      value: avgReadiness.toFixed(1),
      label: 'Avg Readiness',
      color: colors.accent2,
    },
    {
      icon: 'flash',
      value: String(testsDone),
      label: 'Tests Done',
      color: colors.accent1,
    },
    {
      icon: 'star',
      value: `+${pointsEarned}`,
      label: 'Points',
      color: colors.warning,
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>This Week</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {stats.map((stat) => (
          <View key={stat.label} style={styles.card}>
            <SmartIcon name={stat.icon} size={16} color={stat.color} />
            <Text style={styles.value}>{stat.value}</Text>
            <Text style={styles.label}>{stat.label}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.textInactive,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: spacing.sm,
    },
    scrollContent: {
      gap: spacing.sm,
    },
    card: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      gap: 4,
      minWidth: 85,
    },
    value: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.textOnDark,
    },
    label: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      color: colors.textInactive,
    },
  });
}
