/**
 * GoalCard — Displays a performance goal with progress bar and deadline.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { GoalCard } from '../../../types/chat';

interface GoalCardProps {
  card: GoalCard;
}

function getTrendColor(trend?: string): string {
  switch (trend) {
    case 'on_track': return colors.readinessGreen ?? colors.accent;
    case 'behind': return colors.readinessYellow ?? colors.textSecondary;
    case 'achieved': return colors.accent2 ?? colors.accent;
    default: return colors.textSecondary;
  }
}

function getTrendLabel(trend?: string): string {
  switch (trend) {
    case 'on_track': return 'On track';
    case 'behind': return 'Behind';
    case 'achieved': return 'Achieved';
    default: return '';
  }
}

export function GoalCardComponent({ card }: GoalCardProps) {
  const progressWidth = Math.min(card.progressPct, 100);
  const trendColor = getTrendColor(card.trend);
  const isAchieved = card.trend === 'achieved';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>{isAchieved ? '' : ''}</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>{card.title}</Text>
          {card.trend && (
            <Text style={[styles.trend, { color: trendColor }]}>
              {getTrendLabel(card.trend)}
            </Text>
          )}
        </View>
        <Text style={styles.percentage}>{card.progressPct}%</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${progressWidth}%`,
              backgroundColor: isAchieved ? (colors.accent2 ?? colors.accent) : (colors.accent1 ?? colors.accent),
            },
          ]}
        />
      </View>

      {/* Details row */}
      <View style={styles.detailsRow}>
        {card.currentValue != null && card.targetValue != null && (
          <Text style={styles.detail}>
            {card.currentValue}{card.targetUnit ? ` ${card.targetUnit}` : ''} / {card.targetValue}{card.targetUnit ? ` ${card.targetUnit}` : ''}
          </Text>
        )}
        {card.daysRemaining != null && card.daysRemaining > 0 && (
          <Text style={styles.detail}>
            {card.daysRemaining}d remaining
          </Text>
        )}
        {card.deadline && (
          <Text style={styles.detail}>
            Due {card.deadline}
          </Text>
        )}
      </View>
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
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    fontSize: 24,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  trend: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    marginTop: 2,
  },
  percentage: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.accent1 ?? colors.accent,
  },
  progressTrack: {
    height: 6,
    backgroundColor: (colors as any).backgroundTertiary ?? colors.surface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  detail: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
