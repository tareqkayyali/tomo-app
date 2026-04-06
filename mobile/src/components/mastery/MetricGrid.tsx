/**
 * MetricGrid — 2x2 dashboard metric grid.
 * Shows TIS (with ProgressRing), Overall Rating, Streak, and Consistency.
 */

import React, { memo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import ProgressRing from '../tomo-ui/ProgressRing';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { MomentumResponse } from '../../services/api';

interface MetricGridProps {
  overallRating: number;
  tisScore: number | null;
  momentum: MomentumResponse | null;
}

const MetricGrid: React.FC<MetricGridProps> = memo(({
  overallRating,
  tisScore,
  momentum,
}) => {
  const { colors } = useTheme();
  const cellStyle = [styles.cell, { backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <View style={styles.grid}>
      {/* TIS Score */}
      <View style={cellStyle}>
        {tisScore != null ? (
          <>
            <ProgressRing
              progress={tisScore}
              size={70}
              strokeWidth={3}
              valueOverride={Math.round(tisScore)}
              showPercentage
              ringColor={colors.accent}
            />
            <Text style={[styles.cellLabel, { color: colors.textDisabled }]}>TIS</Text>
          </>
        ) : (
          <>
            <Text style={[styles.cellValueLarge, { color: colors.textDisabled }]}>--</Text>
            <Text style={[styles.cellLabel, { color: colors.textDisabled }]}>TIS</Text>
          </>
        )}
      </View>

      {/* Overall Rating */}
      <View style={cellStyle}>
        <Text style={[styles.cellValueLarge, { color: colors.textPrimary }]}>
          {overallRating}
        </Text>
        <Text style={[styles.cellLabel, { color: colors.textDisabled }]}>RATING</Text>
        {momentum && momentum.ratingDelta !== 0 && (
          <Text style={[
            styles.delta,
            { color: momentum.ratingDelta > 0 ? colors.readinessGreen : colors.error },
          ]}>
            {momentum.ratingDelta > 0 ? '+' : ''}{momentum.ratingDelta}
          </Text>
        )}
      </View>

      {/* Streak */}
      <View style={cellStyle}>
        <View style={styles.streakRow}>
          <Text style={[styles.cellValueLarge, { color: colors.textPrimary }]}>
            {momentum?.streakDays ?? 0}
          </Text>
          <Text style={styles.streakEmoji}>
            {momentum?.streakTier.emoji && momentum.streakTier.emoji.trim() ? momentum.streakTier.emoji : ''}
          </Text>
        </View>
        <Text style={[styles.cellLabel, { color: colors.textDisabled }]}>
          {momentum?.streakTier.label ?? 'STREAK'}
        </Text>
      </View>

      {/* Consistency */}
      <View style={cellStyle}>
        <Text style={[
          styles.cellValueLarge,
          { color: (momentum?.consistencyScore ?? 0) >= 60 ? colors.readinessGreen : colors.textPrimary },
        ]}>
          {momentum?.consistencyScore ?? 0}%
        </Text>
        <Text style={[styles.cellLabel, { color: colors.textDisabled }]}>CONSISTENCY</Text>
      </View>
    </View>
  );
});

MetricGrid.displayName = 'MetricGrid';

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  cell: {
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.compact,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    minHeight: 100,
  },
  cellValueLarge: {
    fontFamily: fontFamily.bold,
    fontSize: 30,
    letterSpacing: -0.72,
  },
  cellLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 2,
  },
  delta: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    marginTop: 2,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakEmoji: {
    fontSize: 18,
  },
});

export { MetricGrid };
