/**
 * WhyTodayMattersCard Component
 * Calm, identity-driven daily message card.
 *
 * Shows a single-line message aligned to the user's streak count,
 * archetype, and current readiness. Rotates daily via day-of-year
 * modulo. Archetype color as left border accent.
 *
 * Tone: encouraging, never pushy. 2-second read max.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, spacing, borderRadius, typography, shadows } from '../theme';
import { getArchetypeProfile } from '../services/archetypeProfile';
import { useFadeIn } from '../hooks/useFadeIn';
import type { ReadinessLevel, Archetype } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WhyTodayMattersCardProps {
  currentStreak: number;
  archetype?: Archetype | string | null;
  readiness: ReadinessLevel;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Archetype emoji badges. */
const ARCHETYPE_EMOJI: Record<string, string> = {
  phoenix: '\uD83D\uDD25',
  titan: '\uD83C\uDFDB\uFE0F',
  blade: '\u2694\uFE0F',
  surge: '\u26A1',
};

const DEFAULT_EMOJI = '\uD83D\uDCAA';

// ---------------------------------------------------------------------------
// Message pools — archetype × readiness
// ---------------------------------------------------------------------------

type MessagePool = Record<string, Record<ReadinessLevel, string[]>>;

const MESSAGES: MessagePool = {
  phoenix: {
    GREEN: [
      'Rise and train. Day {streak} is yours.',
      'Phoenixes pace themselves — even when they feel strong.',
      'Burn bright today. Recover tomorrow.',
      'Day {streak}. The fire keeps growing.',
    ],
    YELLOW: [
      'Listen closely today. Phoenixes know when to pace.',
      'A lighter day still fuels the flame.',
      'Day {streak}. Even embers hold warmth.',
      'Smart pacing today, stronger tomorrow.',
    ],
    RED: [
      'Phoenixes rise — even on rest days.',
      'Recovery is rebirth. Day {streak} counts.',
      'Rest is part of the cycle.',
      "Your flame doesn't dim on rest days.",
    ],
  },
  titan: {
    GREEN: [
      'Steady and strong. Day {streak}.',
      'One more brick in the wall, Titan.',
      'Consistency is your craft. Keep building.',
      'Day {streak}. The Titan marches on.',
    ],
    YELLOW: [
      'Even Titans rest between sets.',
      'A lighter load, same strong foundation.',
      'Day {streak}. Patient progress.',
      "Steady doesn't mean every day is heavy.",
    ],
    RED: [
      'Titans recover with the same patience they train.',
      'Rest builds what training breaks down.',
      'Day {streak}. Strength grows in stillness.',
      'Even stone needs time to set.',
    ],
  },
  blade: {
    GREEN: [
      'Sharp and focused. Day {streak}.',
      "One precise session. That's all you need.",
      'Blades sharpen daily.',
      'Day {streak}. Cut clean today.',
    ],
    YELLOW: [
      'Blades sharpen daily — even lightly.',
      'Precision over intensity. Day {streak}.',
      'A light touch can still be sharp.',
      'Less force, same focus.',
    ],
    RED: [
      'Even the finest blade rests in its sheath.',
      'Day {streak}. Sharpness needs rest.',
      'Recovery keeps the edge.',
      'Rest is part of precision.',
    ],
  },
  surge: {
    GREEN: [
      'Channel that energy. Day {streak}.',
      "Today's yours, Surge. Let it flow.",
      'Ride the wave. Day {streak}.',
      'Your energy is your edge today.',
    ],
    YELLOW: [
      'A lighter wave still moves forward.',
      'Day {streak}. Save some spark for tomorrow.',
      'Surges know when to hold back.',
      'Pace the charge today.',
    ],
    RED: [
      'Even waves pull back before the next surge.',
      'Day {streak}. Recharge the current.',
      'Rest fuels the next burst.',
      'Calm waters, strong comeback.',
    ],
  },
  default: {
    GREEN: [
      'Day {streak}. Show up and move.',
      'Every check-in matters. Keep going.',
      'Your body is ready. Trust it.',
      'Day {streak}. Consistent and steady.',
    ],
    YELLOW: [
      'A lighter day still counts. Day {streak}.',
      'Listen to your body today.',
      'Day {streak}. Easy does it.',
      'Not every day needs to be full throttle.',
    ],
    RED: [
      'Rest is part of the plan. Day {streak}.',
      'Your body asked for a break. Honor it.',
      'Day {streak}. Recovery is progress.',
      "Take it easy. You've earned it.",
    ],
  },
};

/** Messages for streak 0 — no streak reference. */
const FIRST_DAY_MESSAGES: Record<ReadinessLevel, string[]> = {
  GREEN: [
    'First check-in. This is where it starts.',
    'Day one. Welcome.',
    'Your journey begins now.',
    'Ready when you are.',
  ],
  YELLOW: [
    'First step — listen to your body.',
    'Starting light is still starting.',
    'Day one. Easy does it.',
    'Welcome. No rush.',
  ],
  RED: [
    'Smart start — rest first, train later.',
    'Day one begins with recovery. Good call.',
    'Knowing when to rest is strength.',
    'Welcome. Rest is the right move today.',
  ],
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Get the day-of-year index (0-based) for message rotation.
 * Deterministic for any given date.
 */
export function getDayOfYear(date: Date = new Date()): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 86_400_000;
  return Math.floor(diff / oneDay);
}

/**
 * Select the daily message based on streak, archetype, readiness, and date.
 * Rotates messages deterministically via day-of-year modulo.
 *
 * Returns a single-line string. Never returns null.
 */
export function getDailyMessage(
  currentStreak: number,
  archetype: string | null | undefined,
  readiness: ReadinessLevel,
  dayOfYear?: number,
): string {
  const day = dayOfYear ?? getDayOfYear();

  // Streak 0 → first-day messages (no streak reference)
  if (currentStreak <= 0) {
    const pool = FIRST_DAY_MESSAGES[readiness] || FIRST_DAY_MESSAGES.GREEN;
    return pool[day % pool.length];
  }

  // Resolve archetype key
  const key =
    archetype && typeof archetype === 'string'
      ? archetype.toLowerCase()
      : 'default';
  const archetypePool = MESSAGES[key] || MESSAGES.default;
  const pool = archetypePool[readiness] || archetypePool.GREEN;

  const template = pool[day % pool.length];
  return template.replace(/\{streak\}/g, String(currentStreak));
}

/**
 * Get the emoji badge for an archetype.
 */
export function getArchetypeEmoji(archetype: string | null | undefined): string {
  if (!archetype || typeof archetype !== 'string') return DEFAULT_EMOJI;
  return ARCHETYPE_EMOJI[archetype.toLowerCase()] || DEFAULT_EMOJI;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WhyTodayMattersCard({
  currentStreak,
  archetype,
  readiness,
}: WhyTodayMattersCardProps) {
  const profile = useMemo(() => getArchetypeProfile(archetype), [archetype]);
  const message = useMemo(
    () => getDailyMessage(currentStreak, archetype, readiness),
    [currentStreak, archetype, readiness],
  );
  const emoji = useMemo(() => getArchetypeEmoji(archetype), [archetype]);

  const fadeIn = useFadeIn(0);

  return (
    <Animated.View style={fadeIn}>
      <View style={[styles.card, { borderLeftColor: profile.color }]}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardLight,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.sm,
  },
  emoji: {
    fontSize: 20,
  },
  message: {
    ...typography.bodyMedium,
    color: colors.textOnLight,
    flex: 1,
  },
});
