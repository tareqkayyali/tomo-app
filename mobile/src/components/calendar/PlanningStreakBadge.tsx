/**
 * PlanningStreakBadge — Small pill badge showing the consecutive planning streak.
 * Displays a fire emoji + streak count. Adds a subtle orange glow when streak >= 5.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius } from '../../theme';
import { fontFamily } from '../../theme/typography';
import type { ThemeColors } from '../../theme/colors';

// ─── Props ─────────────────────────────────────────────────────────────────

interface PlanningStreakBadgeProps {
  streak: number;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function PlanningStreakBadge({ streak }: PlanningStreakBadgeProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (streak === 0) return null;

  const label = streak === 1 ? 'day' : 'days';
  const hasGlow = streak >= 5;

  return (
    <View style={[styles.pill, hasGlow && styles.glow]}>
      <Text style={styles.text}>
        {'\uD83D\uDD25'} {streak} {label}
      </Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.streakBadgeBg,
      paddingHorizontal: spacing.compact,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
    },
    glow: {
      shadowColor: colors.glowOrange,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 10,
      elevation: 6,
    },
    text: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.accent1,
    },
  });
}
