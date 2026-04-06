/**
 * TrajectoryCard — Line chart for a single test type's progress over time.
 * Wraps AttributeLineChart with velocity badge and stats row.
 */

import React, { memo } from 'react';
import { StyleSheet, View, Text, useWindowDimensions } from 'react-native';
import { AttributeLineChart } from '../charts/AttributeLineChart';
import { AskTomoChip } from './AskTomoChip';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { TestTrajectory } from '../../services/api';

interface TrajectoryCardProps {
  trajectory: TestTrajectory;
  /** P25/P50/P75 benchmarks for reference lines */
  benchmarks?: { p25: number; p50: number; p75: number };
  /** Color for the line */
  color?: string;
  onAskTomo: (prompt: string) => void;
}

function formatTestName(testType: string): string {
  return testType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const TrajectoryCard: React.FC<TrajectoryCardProps> = memo(({
  trajectory,
  benchmarks,
  color,
  onAskTomo,
}) => {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - spacing.lg * 2 - spacing.lg * 2; // screen margin + card padding
  const lineColor = color ?? colors.accent;

  const chartData = trajectory.data.map((d) => ({
    date: d.date,
    value: d.score,
  }));

  const testName = formatTestName(trajectory.testType);
  const hasImprovement = trajectory.improvementPct != null && trajectory.improvementPct !== 0;
  const isPositive = (trajectory.improvementPct ?? 0) > 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.testLabel, { color: colors.textSecondary }]}>
            {testName.toUpperCase()}
          </Text>
          <View style={styles.scoreRow}>
            <Text style={[styles.score, { color: colors.textPrimary }]}>
              {trajectory.latestScore}
            </Text>
          </View>
        </View>

        {hasImprovement && (
          <View style={[
            styles.velocityBadge,
            { backgroundColor: isPositive ? `${colors.readinessGreen}1A` : `${colors.warning}1A` },
          ]}>
            <Text style={[
              styles.velocityText,
              { color: isPositive ? colors.readinessGreen : colors.warning },
            ]}>
              {isPositive ? '+' : ''}{trajectory.improvementPct}%
            </Text>
          </View>
        )}
      </View>

      {/* Chart */}
      {chartData.length >= 2 && benchmarks && (
        <View style={styles.chartWrap}>
          <AttributeLineChart
            data={chartData}
            benchmarks={benchmarks}
            color={lineColor}
            width={Math.max(chartWidth, 200)}
            height={130}
          />
        </View>
      )}

      {chartData.length < 2 && (
        <View style={[styles.emptyChart, { height: 80 }]}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Need 2+ tests to show trend
          </Text>
        </View>
      )}

      {/* Stats row */}
      <View style={styles.statsRow}>
        <Text style={[styles.statText, { color: colors.textBody }]}>
          Best: {trajectory.bestScore}
        </Text>
        <Text style={[styles.statText, { color: colors.textBody }]}>
          Tests: {trajectory.totalTests}
        </Text>
      </View>

      {/* Ask Tomo */}
      <AskTomoChip
        label={`Ask about my ${testName}`}
        prompt={`Analyze my ${testName} progress — what's my trajectory telling you?`}
        onPress={onAskTomo}
      />
    </View>
  );
});

TrajectoryCard.displayName = 'TrajectoryCard';

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  testLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 1,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  score: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    letterSpacing: -0.48,
  },
  velocityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  velocityText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
  },
  chartWrap: {
    marginVertical: spacing.sm,
  },
  emptyChart: {
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  statText: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
});

export { TrajectoryCard };
