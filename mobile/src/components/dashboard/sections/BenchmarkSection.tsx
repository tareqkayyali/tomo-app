/**
 * BenchmarkSection — Gap-to-benchmark progress bars.
 *
 * Config:
 *   max_items: number — max bars to show (default: 4)
 *   show_percentile: boolean — show percentile badge
 *   sort_by: "gap_desc" | "gap_asc" — sort order
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { fontFamily } from '../../../theme/typography';
import { borderRadius, spacing } from '../../../theme/spacing';
import type { SectionProps } from './DashboardSectionRenderer';

export const BenchmarkSection = memo(function BenchmarkSection({
  config,
  bootData,
}: SectionProps) {
  const { colors } = useTheme();
  const maxItems = (config.max_items as number) ?? 4;
  const showPercentile = (config.show_percentile as boolean) ?? true;

  const percentiles = bootData.metricPercentiles ?? {};
  const entries = Object.entries(percentiles);

  if (entries.length === 0) return null;

  // Sort by percentile ascending (biggest gaps first)
  const sorted = entries
    .filter(([, v]) => v.percentile !== undefined)
    .sort((a, b) => a[1].percentile - b[1].percentile)
    .slice(0, maxItems);

  function getBarColor(pct: number): string {
    if (pct >= 70) return '#7a9b76';
    if (pct >= 40) return '#c49a3c';
    return '#A05A4A';
  }

  function formatMetricLabel(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.chalk }]}>Benchmark Progress</Text>

      {sorted.map(([key, data]) => {
        const pct = data.percentile;
        const barColor = getBarColor(pct);

        return (
          <View key={key} style={styles.barRow}>
            <View style={styles.labelRow}>
              <Text style={[styles.metricLabel, { color: colors.chalk }]}>
                {formatMetricLabel(key)}
              </Text>
              {showPercentile && (
                <Text style={[styles.percentile, { color: barColor }]}>
                  {pct}th
                </Text>
              )}
            </View>
            <View style={[styles.barTrack, { backgroundColor: colors.chalkGhost }]}>
              <View style={[styles.barFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: 16,
  },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    marginBottom: 12,
  },
  barRow: {
    marginBottom: 10,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  metricLabel: {
    fontFamily: fontFamily.note,
    fontSize: 12,
  },
  percentile: {
    fontFamily: fontFamily.display,
    fontSize: 13,
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
});
