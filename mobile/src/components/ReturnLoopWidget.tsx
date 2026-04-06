/**
 * ReturnLoopWidget Component
 * Calm, progression-based widget for the daily screen.
 *
 * Shows: streak count, freeze tokens, next reward preview,
 * and gentle encouragement copy. No pressure, no hype.
 *
 * Optional archetype prop tints the gradient header.
 */

import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { SmartIcon } from './SmartIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, typography, shadows, fontFamily } from '../theme';
import { getArchetypeProfile } from '../services/archetypeProfile';
import type { Archetype } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NextMilestone {
  daysRemaining: number;
  reward: string;
}

interface ReturnLoopWidgetProps {
  currentStreak: number;
  freezeTokens: number;
  nextMilestone: NextMilestone | null;
  archetype?: Archetype | string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FREEZE = 3;

/** Map reward name → icon. Fallback to trophy for unknown rewards. */
const REWARD_ICONS: Record<string, string> = {
  'Sticker Pack': '',
  'Wristband': '',
  'Hoodie': '',
  'Jacket': '',
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Build the streak headline string.
 * "12-Day Streak" / "1-Day Streak" / "No Streak Yet"
 */
export function getStreakHeadline(streak: number): string {
  if (streak <= 0) return 'No Streak Yet';
  return `${streak}-Day Streak`;
}

/**
 * Build the reward preview string.
 * "2 days to Hoodie unlock!" / "1 day to Jacket unlock!" / null
 */
export function getRewardPreview(milestone: NextMilestone | null): string | null {
  if (!milestone) return null;
  const days = milestone.daysRemaining;
  const icon = REWARD_ICONS[milestone.reward] || '';
  if (days === 1) {
    return `${icon} 1 day to ${milestone.reward} unlock!`;
  }
  return `${icon} ${days} days to ${milestone.reward} unlock!`;
}

/**
 * Build the gentle encouragement callout.
 * Encouraging, never pushy. Returns null for streak 0.
 */
export function getEncouragementCopy(streak: number): string | null {
  if (streak <= 0) return null;
  if (streak === 1) return "Great start. One day at a time.";
  if (streak < 7) return `${streak} days in a row. Nice rhythm.`;
  if (streak < 14) return `${streak} days strong. Keep it steady.`;
  if (streak < 30) return `${streak}-day streak. Real consistency.`;
  return `${streak} days. That's dedication.`;
}

/**
 * Lighten a hex color by mixing with white.
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

export function ReturnLoopWidget({
  currentStreak,
  freezeTokens,
  nextMilestone,
  archetype,
}: ReturnLoopWidgetProps) {
  const profile = useMemo(() => getArchetypeProfile(archetype), [archetype]);

  const headline = useMemo(() => getStreakHeadline(currentStreak), [currentStreak]);
  const rewardPreview = useMemo(() => getRewardPreview(nextMilestone), [nextMilestone]);
  const encouragement = useMemo(() => getEncouragementCopy(currentStreak), [currentStreak]);
  const clampedFreeze = Math.min(Math.max(freezeTokens, 0), MAX_FREEZE);

  const gradientColors = useMemo<[string, string]>(
    () => [profile.color, lightenHex(profile.color, 0.7)],
    [profile.color],
  );

  // -- Animations --

  // Card entrance: scale + opacity
  const cardScale = useSharedValue(0.96);
  const cardOpacity = useSharedValue(0);

  // Streak number gentle pulse on mount
  const streakScale = useSharedValue(0.9);

  useEffect(() => {
    cardScale.value = withSpring(1, { damping: 16, stiffness: 140 });
    cardOpacity.value = withTiming(1, { duration: 450 });

    streakScale.value = withDelay(
      200,
      withSpring(1, { damping: 10, stiffness: 200 }),
    );
  }, [cardScale, cardOpacity, streakScale]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  const streakAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: streakScale.value }],
  }));

  const isAlmostThere = nextMilestone && nextMilestone.daysRemaining <= 3;

  return (
    <Animated.View style={cardAnimStyle}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Row 1: Streak headline + freeze tokens */}
        <View style={styles.topRow}>
          <Animated.View style={[styles.headlineRow, streakAnimStyle]}>
            <SmartIcon
              name={currentStreak > 0 ? 'flame' : 'flame-outline'}
              size={22}
              color={colors.textOnDark}
            />
            <Text style={styles.headline}>{headline}</Text>
          </Animated.View>

          <View style={styles.freezeRow}>
            {Array.from({ length: MAX_FREEZE }).map((_, i) => (
              <SmartIcon
                key={i}
                name={i < clampedFreeze ? 'snow' : 'snow-outline'}
                size={16}
                color={
                  i < clampedFreeze
                    ? colors.textOnDark
                    : 'rgba(245,243,237,0.4)'
                }
                style={i > 0 ? styles.freezeIconGap : undefined}
              />
            ))}
          </View>
        </View>

        {/* Row 2: Reward preview */}
        {rewardPreview && (
          <View style={styles.rewardRow}>
            <Text
              style={[
                styles.rewardText,
                isAlmostThere && styles.rewardTextHighlight,
              ]}
            >
              {rewardPreview}
            </Text>
          </View>
        )}

        {/* Row 3: Encouragement copy */}
        {encouragement && (
          <Text style={styles.encouragement}>{encouragement}</Text>
        )}

        {/* All milestones passed */}
        {!nextMilestone && currentStreak > 0 && (
          <Text style={styles.encouragement}>
            All milestones unlocked. You earned every one.
          </Text>
        )}
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

  // Top row
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headline: {
    ...typography.h4,
    color: colors.textOnDark,
  },

  // Freeze tokens
  freezeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  freezeIconGap: {
    marginLeft: spacing.xs,
  },

  // Reward preview
  rewardRow: {
    marginTop: spacing.md,
  },
  rewardText: {
    ...typography.bodyMedium,
    color: colors.textOnDark,
  },
  rewardTextHighlight: {
    fontFamily: fontFamily.semiBold,
  },

  // Encouragement
  encouragement: {
    ...typography.bodySmall,
    color: 'rgba(245,243,237,0.85)',
    marginTop: spacing.sm,
  },
});
