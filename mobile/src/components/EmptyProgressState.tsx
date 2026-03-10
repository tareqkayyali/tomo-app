/**
 * EmptyProgressState — Shown when a user has no data for a sport.
 *
 * Glass card with sport icon, "Start Your Journey" headline,
 * and two gradient CTAs: "Log First Session" + "Take a Test".
 * Growth-oriented copy — never "empty" or "no data".
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { GradientButton } from './GradientButton';
import { useTheme } from '../hooks/useTheme';
import { fontFamily, spacing, borderRadius } from '../theme';
import type { ThemeColors } from '../theme/colors';

interface EmptyProgressStateProps {
  sport: 'football' | 'padel';
  onLogSession: () => void;
  onTakeTest: () => void;
}

const SPORT_CONFIG = {
  football: {
    icon: 'football' as const,
    label: 'Football',
    headline: 'Start Your Football Journey',
    body: 'Complete your first session or test to unlock your player card, skill ratings, and progress tracking.',
  },
  padel: {
    icon: 'tennisball' as const,
    label: 'Padel',
    headline: 'Start Your Padel Journey',
    body: 'Complete your first session or test to unlock your DNA card, shot mastery, and progress tracking.',
  },
};

export function EmptyProgressState({ sport, onLogSession, onTakeTest }: EmptyProgressStateProps) {
  const { colors } = useTheme();
  const s = React.useMemo(() => createStyles(colors), [colors]);
  const config = SPORT_CONFIG[sport];

  return (
    <GlassCard style={s.card}>
      {/* Sport Icon */}
      <View style={s.iconContainer}>
        <Ionicons name={config.icon} size={48} color={colors.accent1} />
      </View>

      {/* Headline */}
      <Text style={s.headline}>{config.headline}</Text>

      {/* Body */}
      <Text style={s.body}>{config.body}</Text>

      {/* CTAs */}
      <View style={s.ctaRow}>
        <GradientButton
          title="Log First Session"
          icon="add-circle-outline"
          onPress={onLogSession}
          style={s.cta}
        />
        <GradientButton
          title="Take a Test"
          icon="fitness-outline"
          onPress={onTakeTest}
          small
          style={s.ctaSecondary}
        />
      </View>
    </GlassCard>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    iconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: `${colors.accent1}15`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    headline: {
      fontFamily: fontFamily.bold,
      fontSize: 22,
      color: colors.textHeader,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    body: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.xl,
    },
    ctaRow: {
      width: '100%',
      gap: spacing.compact,
    },
    cta: {
      width: '100%',
    },
    ctaSecondary: {
      width: '100%',
    },
  });
}
