/**
 * KpiRowSection — Horizontal row of KPI chips (sleep, soreness, energy, mood).
 *
 * Config:
 *   chips: Array<{ metric: string, label: string, unit: string, target: number, positive_when: "above"|"below" }>
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { fontFamily } from '../../../theme/typography';
import { borderRadius, spacing } from '../../../theme/spacing';
import type { SectionProps } from './DashboardSectionRenderer';

interface ChipConfig {
  metric: string;
  label: string;
  unit: string;
  target: number;
  positive_when: 'above' | 'below';
}

export const KpiRowSection = memo(function KpiRowSection({
  config,
  bootData,
}: SectionProps) {
  const { colors } = useTheme();
  const chips = (config.chips as ChipConfig[]) ?? [];

  const snapshot = bootData.snapshot ?? {};
  const checkin = bootData.latestCheckin;

  // Resolve value from snapshot or checkin
  function getValue(metric: string): number | null {
    // Check checkin fields first (they're fresher)
    const checkinMap: Record<string, string> = {
      sleep_hours: 'sleepHours',
      soreness: 'soreness',
      energy: 'energy',
      mood: 'mood',
    };
    if (checkinMap[metric] && checkin) {
      const val = (checkin as any)[checkinMap[metric]];
      if (typeof val === 'number') return val;
    }
    // Fallback to snapshot
    const snapVal = snapshot[metric];
    if (typeof snapVal === 'number') return snapVal;
    return null;
  }

  function getColor(value: number, target: number, positiveWhen: 'above' | 'below'): string {
    const isGood = positiveWhen === 'above' ? value >= target : value <= target;
    return isGood ? '#7a9b76' : value === target ? '#c49a3c' : '#A05A4A';
  }

  if (chips.length === 0) return null;

  return (
    <View style={styles.row}>
      {chips.map((chip) => {
        const val = getValue(chip.metric);
        const displayVal = val !== null ? String(val) : '--';
        const chipColor = val !== null
          ? getColor(val, chip.target, chip.positive_when)
          : colors.chalkDim;

        return (
          <View
            key={chip.metric}
            style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.value, { color: chipColor }]}>
              {displayVal}
              <Text style={styles.unit}>{chip.unit}</Text>
            </Text>
            <Text style={[styles.label, { color: colors.chalkDim }]}>{chip.label}</Text>
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
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  value: {
    fontFamily: fontFamily.display,
    fontSize: 18,
  },
  unit: {
    fontFamily: fontFamily.note,
    fontSize: 11,
  },
  label: {
    fontFamily: fontFamily.note,
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
