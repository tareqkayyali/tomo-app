/**
 * SparklineRowSection — Mini 7-day trend sparklines.
 *
 * Config:
 *   metrics: string[] — which metrics to show (default: ["readiness_score", "sleep_hours"])
 *   days: number — lookback (default: 7)
 *   show_delta: boolean — show +/- vs first day
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useTheme } from '../../../hooks/useTheme';
import { fontFamily } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import type { SectionProps } from './DashboardSectionRenderer';

const SPARKLINE_WIDTH = 60;
const SPARKLINE_HEIGHT = 24;

const GOOD = '#7A9B76';
const BAD = '#B08A7A';

const METRIC_LABELS: Record<string, string> = {
  readiness_score: 'Readiness',
  sleep_hours: 'Sleep',
  hrv_morning_ms: 'HRV',
  energy: 'Energy',
  soreness: 'Soreness',
  mood: 'Mood',
};

function renderSparkline(values: number[], color: string): React.ReactNode {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * SPARKLINE_WIDTH;
      const y = SPARKLINE_HEIGHT - ((v - min) / range) * SPARKLINE_HEIGHT;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <Svg width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export const SparklineRowSection = memo(function SparklineRowSection({
  config,
  bootData,
}: SectionProps) {
  const { colors } = useTheme();
  const metrics = (config.metrics as string[]) ?? ['readiness_score', 'sleep_hours'];
  const showDelta = (config.show_delta as boolean) ?? true;

  const vitals = bootData.recentVitals ?? [];

  // Build per-metric value arrays (oldest first for sparkline)
  function getValues(metric: string): number[] {
    return vitals
      .slice()
      .reverse()
      .map((v: any) => v[metric] as number | null)
      .filter((v): v is number => v !== null && v !== undefined);
  }

  if (vitals.length === 0) return null;

  return (
    <View style={styles.row}>
      {metrics.map((metric) => {
        const values = getValues(metric);
        if (values.length < 2) return null;

        const latest = values[values.length - 1];
        const first = values[0];
        const delta = latest - first;
        const deltaColor = delta > 0 ? GOOD : delta < 0 ? BAD : colors.muted;
        const deltaPrefix = delta > 0 ? '+' : '';
        const sparkColor = delta >= 0 ? GOOD : BAD;

        return (
          <View
            key={metric}
            style={[styles.tile, { backgroundColor: colors.cream03, borderColor: colors.cream10 }]}
          >
            <Text style={[styles.metricLabel, { color: colors.muted }]}>
              {METRIC_LABELS[metric] ?? metric}
            </Text>
            {renderSparkline(values, sparkColor)}
            {showDelta && (
              <Text style={[styles.delta, { color: deltaColor }]}>
                {deltaPrefix}{delta.toFixed(metric === 'sleep_hours' ? 1 : 0)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  metricLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  delta: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
  },
});
