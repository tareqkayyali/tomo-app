import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { BenchmarkResult } from '../../types/benchmarks';
import { useTheme } from '../../hooks/useTheme';

const ZONE_COLORS = {
  elite: '#27AE60',
  good: '#2ECC71',
  average: '#3498DB',
  developing: '#F39C12',
  below: '#E74C3C',
};

interface Props {
  benchmark: BenchmarkResult;
}

export function PercentileBar({ benchmark }: Props) {
  const { colors } = useTheme();
  const color = ZONE_COLORS[benchmark.zone];
  const fillPct = benchmark.percentile;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.textOnDark }]}>
          {benchmark.metricLabel}
        </Text>
        <View
          style={[
            styles.badge,
            { backgroundColor: color + '22', borderColor: color },
          ]}
        >
          <Text style={[styles.badgeText, { color }]}>
            P{benchmark.percentile} &middot;{' '}
            {benchmark.zone.charAt(0).toUpperCase() + benchmark.zone.slice(1)}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.track,
          { backgroundColor: colors.backgroundElevated },
        ]}
      >
        <View
          style={[
            styles.fill,
            { width: `${fillPct}%`, backgroundColor: color },
          ]}
        />
        <View
          style={[
            styles.marker,
            { left: `${fillPct}%`, backgroundColor: color },
          ]}
        />
      </View>
      <View style={styles.zones}>
        {['P10', 'P25', 'P50', 'P75', 'P90'].map((z) => (
          <Text
            key={z}
            style={[styles.zoneLabel, { color: colors.textMuted }]}
          >
            {z}
          </Text>
        ))}
      </View>
      <Text style={[styles.message, { color: colors.textMuted }]}>
        {benchmark.message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#2D2D2D',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: { fontSize: 13, fontWeight: '600' },
  badge: {
    borderRadius: 4,
    borderWidth: 0.5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '600' },
  track: {
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: { height: '100%', borderRadius: 4 },
  marker: {
    position: 'absolute',
    top: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#0A0A0A',
    transform: [{ translateX: -7 }],
  },
  zones: { flexDirection: 'row', justifyContent: 'space-between' },
  zoneLabel: { fontSize: 9 },
  message: { fontSize: 11, marginTop: 8, lineHeight: 16 },
});
