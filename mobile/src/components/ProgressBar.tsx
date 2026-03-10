/**
 * ProgressBar Component
 * Animated progress bar with orange→teal gradient fill
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { spacing, borderRadius } from '../theme';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';

interface ProgressBarProps {
  progress: number; // 0 to 1
  label?: string;
  showPercentage?: boolean;
  color?: string;
  height?: number;
  style?: ViewStyle;
}

export function ProgressBar({
  progress,
  label,
  showPercentage = false,
  color,
  height = 8,
  style,
}: ProgressBarProps) {
  const { colors, typography } = useTheme();
  const themedStyles = React.useMemo(() => createStyles(colors, typography), [colors, typography]);
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const animatedWidth = useSharedValue(0);

  useEffect(() => {
    animatedWidth.value = withTiming(clampedProgress, {
      duration: 600,
      easing: Easing.out(Easing.ease),
    });
  }, [clampedProgress, animatedWidth]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value * 100}%`,
  }));

  return (
    <View style={[themedStyles.container, style]}>
      {(label || showPercentage) && (
        <View style={themedStyles.header}>
          {label && <Text style={themedStyles.label}>{label}</Text>}
          {showPercentage && (
            <Text style={themedStyles.percentage}>
              {Math.round(clampedProgress * 100)}%
            </Text>
          )}
        </View>
      )}
      <View style={[themedStyles.track, { height }]}>
        <Animated.View style={[themedStyles.fill, { height }, fillStyle]}>
          {color ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: color, borderRadius: borderRadius.full }]} />
          ) : (
            <LinearGradient
              colors={colors.gradientOrangeCyan}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, { borderRadius: borderRadius.full }]}
            />
          )}
        </Animated.View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, typography: Record<string, any>) {
  return StyleSheet.create({
    container: {},
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    label: {
      ...typography.caption,
      color: colors.textInactive,
    },
    percentage: {
      ...typography.caption,
      color: colors.textMuted,
    },
    track: {
      backgroundColor: colors.border,
      borderRadius: borderRadius.full,
      overflow: 'hidden',
    },
    fill: {
      borderRadius: borderRadius.full,
      overflow: 'hidden',
    },
  });
}
