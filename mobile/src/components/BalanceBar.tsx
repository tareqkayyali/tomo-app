/**
 * BalanceBar — Training vs Academic time allocation bar
 *
 * Shows a horizontal segmented bar with training % on the left (accent1)
 * and academic % on the right (purple). Below: AI Balance insight card
 * explaining how Tomo adjusted the day around exams / recovery.
 *
 * Matches prototype PlanScreen balance bar (lines 316-346).
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';
import { spacing, fontFamily, borderRadius } from '../theme';

// Purple accent for academic blocks (matching prototype)
const ACADEMIC_PURPLE = '#A855F7';

type BalanceBarProps = {
  /** Training hours today */
  trainingHours: number;
  /** Academic / study hours today */
  academicHours: number;
  /** Optional AI insight message */
  aiInsight?: string;
  /** Optional highlighted words in AI insight */
  aiHighlights?: { text: string; color: string }[];
  /** Compact mode: render only the bar (no AI card). Used for inline layout. */
  compact?: boolean;
};

export function BalanceBar({
  trainingHours,
  academicHours,
  aiInsight,
  aiHighlights,
  compact = false,
}: BalanceBarProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const total = trainingHours + academicHours;
  const trainPct = total > 0 ? Math.round((trainingHours / total) * 100) : 50;
  const acadPct = 100 - trainPct;

  return (
    <View style={styles.container}>
      {/* Balance Bar */}
      <View style={styles.barSection}>
        <Text style={styles.label}>Today's Balance</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barSegment, { width: `${trainPct}%`, backgroundColor: colors.accent1 }]} />
          <View style={[styles.barSegment, { width: `${acadPct}%`, backgroundColor: ACADEMIC_PURPLE }]} />
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <Ionicons name="flash" size={10} color={colors.accent1} />
            <Text style={[styles.legendText, { color: colors.accent1 }]}>
              Training {trainPct}%
            </Text>
          </View>
          <View style={styles.legendItem}>
            <Ionicons name="book" size={10} color={ACADEMIC_PURPLE} />
            <Text style={[styles.legendText, { color: ACADEMIC_PURPLE }]}>
              Academic {acadPct}%
            </Text>
          </View>
        </View>
      </View>

      {/* AI Balance Card (hidden in compact mode) */}
      {!compact && aiInsight && (
        <View style={styles.aiCard}>
          <LinearGradient
            colors={[`${ACADEMIC_PURPLE}18`, `${colors.accent1}18`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.aiCardGradient}
          >
            <View style={styles.aiHeader}>
              <Text style={styles.aiEmoji}>🧠</Text>
              <Text style={[styles.aiLabel, { color: ACADEMIC_PURPLE }]}>TOMO BALANCE</Text>
            </View>
            <Text style={styles.aiText}>{aiInsight}</Text>
          </LinearGradient>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      gap: spacing.sm,
    },
    barSection: {
      gap: 6,
    },
    label: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
    },
    barTrack: {
      flexDirection: 'row',
      height: 10,
      borderRadius: 5,
      overflow: 'hidden',
    },
    barSegment: {
      height: '100%',
    },
    legendRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    legendText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 10,
    },
    aiCard: {
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: `${ACADEMIC_PURPLE}33`,
    },
    aiCardGradient: {
      padding: spacing.md,
    },
    aiHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    aiEmoji: {
      fontSize: 14,
    },
    aiLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      letterSpacing: 1,
    },
    aiText: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textOnDark,
      lineHeight: 20,
    },
  });
}
