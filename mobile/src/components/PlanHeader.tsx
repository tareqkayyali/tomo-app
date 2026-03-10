/**
 * PlanHeader Component
 * Personalized plan screen header showing readiness badge,
 * archetype-aligned microcopy, and accent gradient background.
 *
 * Rotates microcopy daily (deterministic from date, not random).
 * Fades in on mount for smooth plan-loaded feel.
 */

import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows, fontFamily } from '../theme';
import { getArchetypeProfile } from '../services/archetypeProfile';
import type { ReadinessLevel, Archetype } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlanHeaderProps {
  readinessCategory: ReadinessLevel;
  archetype: Archetype | string | null;
}

// ---------------------------------------------------------------------------
// Readiness config
// ---------------------------------------------------------------------------

const READINESS_CONFIG: Record<ReadinessLevel, {
  color: string;
  bgColor: string;
  label: string;
  icon: 'checkmark-circle' | 'alert-circle' | 'bed';
}> = {
  GREEN: {
    color: colors.readinessGreen,
    bgColor: colors.readinessGreenBg,
    label: 'GREEN',
    icon: 'checkmark-circle',
  },
  YELLOW: {
    color: colors.readinessYellow,
    bgColor: colors.readinessYellowBg,
    label: 'YELLOW',
    icon: 'alert-circle',
  },
  RED: {
    color: colors.readinessRed,
    bgColor: colors.readinessRedBg,
    label: 'REST',
    icon: 'bed',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pick a microcopy line deterministically from the day of year.
 * Same archetype + same day = same line. Rotates daily.
 */
function getDailyMicrocopy(examples: string[]): string {
  if (examples.length === 0) return '';
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  return examples[dayOfYear % examples.length];
}

/**
 * Lighten a hex color by mixing with white.
 * Used to create the gradient end-color from the archetype accent.
 */
function lightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlanHeader({ readinessCategory, archetype }: PlanHeaderProps) {
  const profile = useMemo(() => getArchetypeProfile(archetype), [archetype]);
  const readiness = READINESS_CONFIG[readinessCategory];
  const microcopy = useMemo(
    () => getDailyMicrocopy(profile.microcopyExamples),
    [profile.microcopyExamples],
  );

  // Gradient: archetype accent → lightened version (diagonal)
  const gradientColors = useMemo<[string, string]>(
    () => [profile.color, lightenHex(profile.color, 0.65)],
    [profile.color],
  );

  // Fade-in animation on mount
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  useEffect(() => {
    opacity.value = withTiming(1, {
      duration: 500,
      easing: Easing.out(Easing.ease),
    });
    translateY.value = withTiming(0, {
      duration: 500,
      easing: Easing.out(Easing.ease),
    });
  }, [opacity, translateY]);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={fadeStyle}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Top row: archetype name + readiness badge */}
        <View style={styles.topRow}>
          <Text style={styles.archetypeName} numberOfLines={1}>{profile.name}</Text>

          <View
            style={[styles.badge, { backgroundColor: readiness.bgColor }]}
          >
            <Ionicons
              name={readiness.icon}
              size={16}
              color={readiness.color}
            />
            <Text style={[styles.badgeLabel, { color: readiness.color }]}>
              {readiness.label}
            </Text>
          </View>
        </View>

        {/* Accent line */}
        <View style={styles.divider} />

        {/* Microcopy */}
        <Text style={styles.microcopy}>{microcopy}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  archetypeName: {
    ...typography.h3,
    color: colors.textOnDark,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  badgeLabel: {
    ...typography.caption,
    fontFamily: fontFamily.semiBold,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginVertical: spacing.md,
  },
  microcopy: {
    ...typography.bodyMedium,
    color: colors.textOnDark,
  },
});
