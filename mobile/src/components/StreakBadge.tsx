/**
 * StreakBadge Component
 * Shows current streak with flame icon and pulse animation
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { spacing, borderRadius, fontFamily } from '../theme';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';

interface StreakBadgeProps {
  streak: number;
  multiplier?: number;
  size?: 'small' | 'medium' | 'large';
}

const FLAME_SIZES = { small: 22, medium: 30, large: 42 };

export function StreakBadge({
  streak,
  multiplier = 1,
  size = 'medium',
}: StreakBadgeProps) {
  const { colors, typography } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, typography), [colors, typography]);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (streak > 0) {
      pulseScale.value = withRepeat(
        withTiming(1.15, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    }
  }, [streak, pulseScale]);

  const flameAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const getStreakColor = () => {
    if (streak >= 30) return colors.archetypePhoenix;
    if (streak >= 14) return colors.archetypeBlade;
    if (streak >= 7) return colors.archetypeTitan;
    return colors.accent1;
  };

  return (
    <View style={[styles.container, styles[size]]}>
      <Animated.View style={flameAnimStyle}>
        <Ionicons name="flame" size={FLAME_SIZES[size]} color={getStreakColor()} />
      </Animated.View>
      <View style={styles.content}>
        <Text style={[styles.streak, styles[`${size}Streak`], { color: getStreakColor() }]}>
          {streak}
        </Text>
        <Text style={[styles.label, styles[`${size}Label`]]}>day streak</Text>
      </View>
      {multiplier > 1 && (
        <View style={styles.multiplierBadge}>
          <Text style={styles.multiplier}>{multiplier}x</Text>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors, typography: Record<string, any>) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    small: {
      padding: spacing.sm,
    },
    medium: {
      padding: spacing.md,
    },
    large: {
      padding: spacing.lg,
    },
    content: {
      marginLeft: spacing.sm,
    },
    streak: {
      fontFamily: fontFamily.bold,
    },
    smallStreak: {
      ...typography.h4,
    },
    mediumStreak: {
      ...typography.h3,
    },
    largeStreak: {
      ...typography.h1,
    },
    label: {
      color: colors.textMuted,
      fontFamily: fontFamily.regular,
    },
    smallLabel: {
      ...typography.caption,
    },
    mediumLabel: {
      ...typography.caption,
    },
    largeLabel: {
      ...typography.body,
    },
    multiplierBadge: {
      backgroundColor: colors.success,
      borderRadius: borderRadius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      marginLeft: spacing.sm,
    },
    multiplier: {
      ...typography.caption,
      color: colors.textOnDark,
      fontFamily: fontFamily.bold,
    },
  });
}
