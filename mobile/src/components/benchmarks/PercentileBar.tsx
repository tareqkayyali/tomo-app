import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BenchmarkResult } from '../../types/benchmarks';
import { useTheme } from '../../hooks/useTheme';
import { colors } from '../../theme/colors';

function getZoneColors(colors: { accentDark: string; accent: string; info: string; warning: string; error: string }) {
  return {
    elite: colors.accentDark,
    good: colors.accent,
    average: colors.info,
    developing: colors.warning,
    below: colors.error,
  };
}

interface Props {
  benchmark: BenchmarkResult;
  /** Show history timeline for this metric */
  onShowHistory?: (metricKey: string) => void;
  /** Log a new value for this metric */
  onLogNew?: (metricKey: string, metricLabel: string, unit: string) => void;
}

export function PercentileBar({ benchmark, onShowHistory, onLogNew }: Props) {
  const { colors } = useTheme();
  const zoneColors = getZoneColors(colors);
  const color = zoneColors[benchmark.zone];
  const fillPct = benchmark.percentile;

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.textOnDark }]}>
          {benchmark.metricLabel}
        </Text>
        <View style={styles.headerRight}>
          {onShowHistory && (
            <Pressable onPress={() => onShowHistory(benchmark.metricKey)} hitSlop={8} style={styles.actionIcon}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
            </Pressable>
          )}
          {onLogNew && (
            <Pressable onPress={() => onLogNew(benchmark.metricKey, benchmark.metricLabel, benchmark.unit)} hitSlop={8} style={styles.actionIcon}>
              <Ionicons name="add-circle-outline" size={16} color={colors.accent1} />
            </Pressable>
          )}
          <View
            style={[
              styles.badge,
              { backgroundColor: color + '22', borderColor: color },
            ]}
          >
            <Text style={[styles.badgeText, { color }]}>
              {benchmark.zone === 'elite' ? 'Elite' : benchmark.zone === 'good' ? 'Strong' : benchmark.zone === 'average' ? 'Solid' : benchmark.zone === 'developing' ? 'Developing' : 'Beginner'}
            </Text>
          </View>
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
            { left: `${fillPct}%`, backgroundColor: color, borderColor: colors.background },
          ]}
        />
      </View>
      <View style={styles.zones}>
        {[
          { key: 'P10', label: 'Beginner' },
          { key: 'P25', label: 'Developing' },
          { key: 'P50', label: 'Solid' },
          { key: 'P75', label: 'Strong' },
          { key: 'P90', label: 'Elite' },
        ].map((z) => (
          <Text
            key={z.key}
            style={[styles.zoneLabel, { color: colors.textMuted }]}
          >
            {z.label}
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
    borderTopColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionIcon: {
    padding: 2,
  },
  label: { fontSize: 13, fontWeight: '600', flex: 1 },
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
    borderColor: colors.background,
    transform: [{ translateX: -7 }],
  },
  zones: { flexDirection: 'row', justifyContent: 'space-between' },
  zoneLabel: { fontSize: 9 },
  message: { fontSize: 11, marginTop: 8, lineHeight: 16 },
});
