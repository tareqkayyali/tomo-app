/**
 * StreakStatusCard Component
 * Calm, rewarding streak tracker — no hype, no competition.
 *
 * Shows: current streak, active multiplier, freeze tokens, progress to next reward.
 * Animates on milestone days (7, 14, 30, 60, 90).
 */

import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { SmartIcon } from './SmartIcon';
import { colors, spacing, borderRadius, typography, shadows, fontFamily } from '../theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StreakStatusCardProps {
  currentStreak: number;
  freezeTokens: number;
}

// ---------------------------------------------------------------------------
// Streak multiplier (mirrors backend pointsService.js brackets)
// ---------------------------------------------------------------------------

const MULTIPLIER_BRACKETS = [
  { threshold: 90, multiplier: 5.0 },
  { threshold: 60, multiplier: 3.0 },
  { threshold: 30, multiplier: 2.0 },
  { threshold: 14, multiplier: 1.5 },
  { threshold: 7, multiplier: 1.2 },
];

function getMultiplier(streak: number): number {
  for (const b of MULTIPLIER_BRACKETS) {
    if (streak >= b.threshold) return b.multiplier;
  }
  return 1.0;
}

// ---------------------------------------------------------------------------
// Progress helpers
// ---------------------------------------------------------------------------

/** Milestones that award freeze tokens (every 7 days). */
const FREEZE_INTERVAL = 7;
const MAX_FREEZE = 3;

/**
 * Find the next milestone threshold and how far along we are.
 * Returns { current, target } for the progress bar.
 */
function getProgress(streak: number): { current: number; target: number } {
  if (streak === 0) return { current: 0, target: FREEZE_INTERVAL };

  const nextMilestone = Math.ceil(streak / FREEZE_INTERVAL) * FREEZE_INTERVAL;
  // If streak is exactly on a milestone, show the NEXT one
  const target = streak === nextMilestone ? nextMilestone + FREEZE_INTERVAL : nextMilestone;
  const prevMilestone = target - FREEZE_INTERVAL;
  return { current: streak - prevMilestone, target: FREEZE_INTERVAL };
}

/**
 * Milestones = multiplier bracket thresholds.
 * These are the big celebrations the user sees (pulse animation, nudge).
 */
const MILESTONES = [7, 14, 30, 60, 90];

/** True when the user is exactly 1 day from a milestone (6, 13, 29, 59, 89). */
function isOneAwayFromReward(streak: number): boolean {
  return streak > 0 && MILESTONES.includes(streak + 1);
}

/** True when the streak is exactly on a milestone. */
function isMilestone(streak: number): boolean {
  return MILESTONES.includes(streak);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StreakStatusCard({ currentStreak, freezeTokens }: StreakStatusCardProps) {
  const multiplier = useMemo(() => getMultiplier(currentStreak), [currentStreak]);
  const progress = useMemo(() => getProgress(currentStreak), [currentStreak]);
  const milestone = isMilestone(currentStreak);
  const almostThere = isOneAwayFromReward(currentStreak);
  const clampedFreeze = Math.min(freezeTokens, MAX_FREEZE);

  // -- Animations --

  // Card entrance
  const cardScale = useSharedValue(0.95);
  const cardOpacity = useSharedValue(0);

  // Milestone pulse on the streak number
  const pulseScale = useSharedValue(1);

  // Progress bar fill
  const progressWidth = useSharedValue(0);

  useEffect(() => {
    // Entrance
    cardScale.value = withSpring(1, { damping: 14, stiffness: 160 });
    cardOpacity.value = withTiming(1, { duration: 400 });

    // Progress bar
    const ratio = progress.target > 0 ? progress.current / progress.target : 0;
    progressWidth.value = withTiming(ratio, {
      duration: 700,
      easing: Easing.out(Easing.ease),
    });
  }, [currentStreak, progress, cardScale, cardOpacity, progressWidth]);

  // Milestone celebration pulse
  useEffect(() => {
    if (milestone) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        ),
        3, // pulse 3 times then stop
        false,
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [milestone, pulseScale]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  const streakAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const progressFillStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%`,
  }));

  return (
    <Animated.View style={[styles.card, cardAnimStyle]}>
      {/* Top row: streak + multiplier */}
      <View style={styles.topRow}>
        <View style={styles.streakSection}>
          <Animated.View style={[styles.streakNumberRow, streakAnimStyle]}>
            <SmartIcon
              name="flame-outline"
              size={22}
              color={currentStreak > 0 ? colors.accent2 : colors.textMuted}
            />
            <Text style={styles.streakNumber}>{currentStreak}</Text>
          </Animated.View>
          <Text style={styles.streakLabel}>
            {currentStreak === 1 ? 'Day Streak' : 'Day Streak'}
          </Text>
        </View>

        {multiplier > 1 && (
          <View style={styles.multiplierPill}>
            <Text style={styles.multiplierText}>{multiplier}x points</Text>
          </View>
        )}
      </View>

      {/* Freeze tokens */}
      <View style={styles.freezeRow}>
        <Text style={styles.freezeLabel}>Freeze tokens</Text>
        <View style={styles.freezeIcons}>
          {Array.from({ length: MAX_FREEZE }).map((_, i) => (
            <SmartIcon
              key={i}
              name={i < clampedFreeze ? 'snow' : 'snow-outline'}
              size={18}
              color={i < clampedFreeze ? colors.accent1 : colors.borderLight}
              style={i > 0 ? styles.freezeIconSpacing : undefined}
            />
          ))}
        </View>
      </View>

      {/* Progress bar to next freeze */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Next reward</Text>
          <Text style={styles.progressCount}>
            {progress.current}/{progress.target}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressFillStyle]} />
        </View>
      </View>

      {/* Nudge: 1 day away from next reward */}
      {almostThere && (
        <Text style={styles.nudge}>1 day to your next reward</Text>
      )}

      {/* Milestone celebration */}
      {milestone && (
        <Text style={styles.milestoneText}>
          {currentStreak}-day milestone reached
        </Text>
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardLight,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },

  // Top row
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  streakSection: {
    flexDirection: 'column',
  },
  streakNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  streakNumber: {
    ...typography.statSmall,
    fontFamily: fontFamily.bold,
    color: colors.textOnLight,
  },
  streakLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Multiplier pill
  multiplierPill: {
    backgroundColor: colors.accent2 + '30',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  multiplierText: {
    ...typography.caption,
    fontFamily: fontFamily.semiBold,
    color: colors.accent2,
  },

  // Freeze tokens
  freezeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  freezeLabel: {
    ...typography.caption,
    color: colors.textInactive,
    fontFamily: fontFamily.medium,
  },
  freezeIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  freezeIconSpacing: {
    marginLeft: spacing.xs,
  },

  // Progress bar
  progressSection: {
    marginBottom: spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  progressLabel: {
    ...typography.caption,
    color: colors.textInactive,
    fontFamily: fontFamily.medium,
  },
  progressCount: {
    ...typography.caption,
    color: colors.textMuted,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: colors.accent2,
    borderRadius: borderRadius.full,
  },

  // Nudge
  nudge: {
    ...typography.caption,
    fontFamily: fontFamily.medium,
    color: colors.warning,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // Milestone
  milestoneText: {
    ...typography.caption,
    fontFamily: fontFamily.semiBold,
    color: colors.accent2,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
