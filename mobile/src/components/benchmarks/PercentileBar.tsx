import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BenchmarkResult } from '../../types/benchmarks';
import { useTheme } from '../../hooks/useTheme';
import { colors as themeColors } from '../../theme/colors';

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
  /** Edit this test result */
  onEdit?: (metricKey: string, metricLabel: string, unit: string, currentValue: number) => void;
  /** Delete this test result */
  onDelete?: (metricKey: string, metricLabel: string) => void;
}

export function PercentileBar({ benchmark, onShowHistory, onLogNew, onEdit, onDelete }: Props) {
  const { colors } = useTheme();
  const zoneColors = getZoneColors(colors);
  const color = zoneColors[benchmark.zone];
  const fillPct = benchmark.percentile;

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      {/* Header: Label + Value + Actions */}
      <View style={styles.header}>
        <View style={styles.labelGroup}>
          <Text style={[styles.label, { color: colors.textOnDark }]}>
            {benchmark.metricLabel}
          </Text>
          <Text style={[styles.value, { color }]}>
            {benchmark.value}{benchmark.unit ? ` ${benchmark.unit}` : ''}
          </Text>
        </View>
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
          {onEdit && (
            <Pressable onPress={() => onEdit(benchmark.metricKey, benchmark.metricLabel, benchmark.unit, benchmark.value)} hitSlop={8} style={styles.actionIcon}>
              <Ionicons name="create-outline" size={15} color={colors.textMuted} />
            </Pressable>
          )}
          {onDelete && (
            <Pressable
              onPress={() => {
                const msg = `Delete ${benchmark.metricLabel} (${benchmark.value} ${benchmark.unit})?`;
                if (Platform.OS === 'web') {
                  if (window.confirm(msg)) onDelete(benchmark.metricKey, benchmark.metricLabel);
                } else {
                  const { Alert } = require('react-native');
                  Alert.alert('Delete Test', msg, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => onDelete(benchmark.metricKey, benchmark.metricLabel) },
                  ]);
                }
              }}
              hitSlop={8}
              style={styles.actionIcon}
            >
              <Ionicons name="trash-outline" size={15} color={colors.error} />
            </Pressable>
          )}
          <View
            style={[
              styles.badge,
              { backgroundColor: color + '22', borderColor: color },
            ]}
          >
            <Text style={[styles.badgeText, { color }]}>
              {benchmark.zone === 'elite' ? 'Elite' : benchmark.zone === 'good' ? 'Strong' : benchmark.zone === 'average' ? 'Solid' : benchmark.zone === 'developing' ? 'Developing' : 'Needs Attention'}
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
          { key: 'p10', label: 'Needs Attention' },
          { key: 'p25', label: 'Developing' },
          { key: 'p50', label: 'Solid' },
          { key: 'p75', label: 'Strong' },
          { key: 'p90', label: 'Elite' },
        ].map((z) => {
          const normVal = benchmark.norm?.[z.key as keyof typeof benchmark.norm];
          return (
            <View key={z.key} style={styles.zoneItem}>
              <Text style={[styles.zoneLabel, { color: colors.textMuted }]}>{z.label}</Text>
              {normVal != null && normVal !== 0 && (
                <Text style={[styles.normValue, { color: colors.textInactive }]}>
                  {typeof normVal === 'number' ? (normVal % 1 === 0 ? normVal : normVal.toFixed(1)) : normVal}
                </Text>
              )}
            </View>
          );
        })}
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
    borderTopColor: themeColors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  labelGroup: {
    flex: 1,
    marginRight: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionIcon: {
    padding: 2,
  },
  label: { fontSize: 13, fontWeight: '600' },
  value: { fontSize: 15, fontWeight: '700', marginTop: 2 },
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
    borderColor: themeColors.background,
    transform: [{ translateX: -7 }],
  },
  zones: { flexDirection: 'row', justifyContent: 'space-between' },
  zoneItem: { alignItems: 'center' },
  zoneLabel: { fontSize: 9 },
  normValue: { fontSize: 8, marginTop: 1 },
  message: { fontSize: 11, marginTop: 8, lineHeight: 16 },
});
