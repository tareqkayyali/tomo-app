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
import type { SectionProps } from './DashboardSectionRenderer';

const GOOD = '#7A9B76';
const WARN = '#C8A27A';
const BAD = '#B08A7A';

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

  function ordinalSuffix(n: number): string {
    const rem100 = n % 100;
    if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
    const rem10 = n % 10;
    if (rem10 === 1) return `${n}st`;
    if (rem10 === 2) return `${n}nd`;
    if (rem10 === 3) return `${n}rd`;
    return `${n}th`;
  }

  function getBarColor(pct: number): string {
    if (pct >= 70) return GOOD;
    if (pct >= 40) return WARN;
    return BAD;
  }

  function formatMetricLabel(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.cream03, borderColor: colors.cream10 }]}>
      <Text style={[styles.title, { color: colors.tomoCream }]}>Benchmark Progress</Text>

      {sorted.map(([key, data]) => {
        const pct = data.percentile;
        const barColor = getBarColor(pct);

        return (
          <View key={key} style={styles.barRow}>
            <View style={styles.labelRow}>
              <Text style={[styles.metricLabel, { color: colors.tomoCream }]}>
                {formatMetricLabel(key)}
              </Text>
              {showPercentile && (
                <Text style={[styles.percentile, { color: barColor }]}>
                  {ordinalSuffix(pct)}
                </Text>
              )}
            </View>
            <View style={[styles.barTrack, { backgroundColor: colors.cream10 }]}>
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
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    letterSpacing: -0.2,
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
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  percentile: {
    fontFamily: fontFamily.semiBold,
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
