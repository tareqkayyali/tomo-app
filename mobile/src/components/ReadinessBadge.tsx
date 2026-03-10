/**
 * ReadinessBadge Component
 * Color-coded readiness badge with archetype-aware microcopy
 * GREEN = full session OK | YELLOW = light/recovery | RED = must rest
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, fontFamily } from '../theme';
import { getReadinessMessage } from '../services/readinessScore';
import type { ReadinessLevel, Archetype } from '../types';

interface ReadinessBadgeProps {
  level: ReadinessLevel;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  archetype?: Archetype | null;
  showMicrocopy?: boolean;
}

const readinessConfig = {
  GREEN: {
    color: colors.readinessGreen,
    bgColor: colors.readinessGreenBg,
    label: 'Ready to Go',
    icon: 'checkmark-circle' as const,
  },
  YELLOW: {
    color: colors.readinessYellow,
    bgColor: colors.readinessYellowBg,
    label: 'Take It Easy',
    icon: 'alert-circle' as const,
  },
  RED: {
    color: colors.readinessRed,
    bgColor: colors.readinessRedBg,
    label: 'Rest Day',
    icon: 'bed' as const,
  },
};

const ICON_SIZES = { small: 16, medium: 20, large: 28 };

export function ReadinessBadge({
  level,
  size = 'medium',
  showLabel = true,
  archetype,
  showMicrocopy = false,
}: ReadinessBadgeProps) {
  const config = readinessConfig[level];
  const scale = useSharedValue(0.5);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  }, [level, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.container,
          styles[size],
          { backgroundColor: config.bgColor },
          animatedStyle,
        ]}
      >
        <Ionicons name={config.icon} size={ICON_SIZES[size]} color={config.color} />
        {showLabel && (
          <Text style={[styles.label, styles[`${size}Label`], { color: config.color }]}>
            {config.label}
          </Text>
        )}
      </Animated.View>

      {showMicrocopy && (
        <Text style={[styles.microcopy, { color: config.color }]}>
          {getReadinessMessage(level, archetype)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.full,
  },
  small: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  medium: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  large: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  label: {
    marginLeft: spacing.xs,
    fontFamily: fontFamily.semiBold,
  },
  smallLabel: {
    ...typography.caption,
  },
  mediumLabel: {
    ...typography.body,
  },
  largeLabel: {
    ...typography.bodyLarge,
  },
  microcopy: {
    ...typography.bodySmall,
    fontFamily: fontFamily.medium,
    textAlign: 'right',
  },
});
