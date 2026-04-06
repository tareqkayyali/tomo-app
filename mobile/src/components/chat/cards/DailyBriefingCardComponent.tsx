/**
 * DailyBriefingCard — Synthesized daily overview combining schedule, readiness,
 * load, goals, and pending journals into one scannable card.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { DailyBriefingCard } from '../../../types/chat';

interface DailyBriefingCardProps {
  card: DailyBriefingCard;
}

const READINESS_COLORS: Record<string, string> = {
  GREEN: colors.readinessGreen ?? colors.accent,
  YELLOW: colors.readinessYellow ?? colors.textSecondary,
  RED: colors.readinessRed ?? colors.textSecondary,
  UNKNOWN: colors.textSecondary,
};

const READINESS_EMOJI: Record<string, string> = {
  GREEN: '',
  YELLOW: '',
  RED: '',
  UNKNOWN: '',
};

export function DailyBriefingCardComponent({ card }: DailyBriefingCardProps) {
  const readinessColor = READINESS_COLORS[card.readinessColor] ?? colors.textSecondary;

  return (
    <View style={styles.container}>
      {/* Header: date + readiness pill */}
      <View style={styles.header}>
        <Text style={styles.dateText}>{card.date}</Text>
        <View style={[styles.readinessPill, { backgroundColor: readinessColor + '22' }]}>
          <Text style={styles.readinessEmoji}>
            {READINESS_EMOJI[card.readinessColor] ?? ''}
          </Text>
          <Text style={[styles.readinessText, { color: readinessColor }]}>
            {card.readinessColor}
            {card.readinessScore ? ` ${card.readinessScore}` : ''}
          </Text>
        </View>
      </View>

      {/* Metrics strip */}
      <View style={styles.metricsRow}>
        {card.acwr != null && (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>ACWR</Text>
            <Text style={styles.metricValue}>{card.acwr.toFixed(2)}</Text>
          </View>
        )}
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Events</Text>
          <Text style={styles.metricValue}>{card.eventCount}</Text>
        </View>
        {card.trainingCount > 0 && (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Training</Text>
            <Text style={styles.metricValue}>{card.trainingCount}</Text>
          </View>
        )}
        {card.matchCount > 0 && (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Match</Text>
            <Text style={styles.metricValue}>{card.matchCount}</Text>
          </View>
        )}
      </View>

      {/* Briefing summary */}
      <Text style={styles.summary}>{card.briefingSummary}</Text>

      {/* Urgent goals */}
      {card.urgentGoals && card.urgentGoals.length > 0 && (
        <View style={styles.goalsSection}>
          {card.urgentGoals.map((goal, i) => (
            <View key={i} style={styles.goalRow}>
              <Text style={styles.goalIcon}></Text>
              <Text style={styles.goalText} numberOfLines={1}>
                {goal.title}
              </Text>
              <Text style={styles.goalProgress}>{goal.progressPct}%</Text>
              <Text style={styles.goalDays}>{goal.daysRemaining}d</Text>
            </View>
          ))}
        </View>
      )}

      {/* Pending journals badge */}
      {card.pendingJournalCount != null && card.pendingJournalCount > 0 && (
        <View style={styles.journalBadge}>
          <Text style={styles.journalText}>
            {card.pendingJournalCount} session{card.pendingJournalCount > 1 ? 's' : ''} waiting for reflection
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  readinessPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full ?? 100,
  },
  readinessEmoji: {
    fontSize: 14,
  },
  readinessText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metric: {
    alignItems: 'center',
  },
  metricLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  summary: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textBody,
    lineHeight: 20,
  },
  goalsSection: {
    gap: 4,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  goalIcon: {
    fontSize: 14,
  },
  goalText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textBody,
  },
  goalProgress: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.accent1 ?? colors.accent,
  },
  goalDays: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  journalBadge: {
    backgroundColor: (colors as any).backgroundTertiary ?? colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  journalText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textBody,
  },
});
