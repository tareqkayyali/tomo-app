/**
 * WeeklyPulseStrip — three at-a-glance week-so-far vitals (HRV · Load · Wellness).
 *
 * Rendered as a single card with three equal cells split by 1px hairlines,
 * keeping the strip visually one object rather than three free-floating chips.
 * Each cell optionally routes to Metrics on press.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';

export type PulseCell = {
  label: string;
  value: string | number;
  unit?: string;
  trend?: string;
  /** Optional override color for the trend line (default accentLight). */
  trendColor?: string;
};

interface Props {
  cells: PulseCell[];
  onCellPress?: (index: number) => void;
}

export function WeeklyPulseStrip({ cells, onCellPress }: Props) {
  const { colors } = useTheme();
  if (cells.length === 0) return null;

  return (
    <View>
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
        Week so far
      </Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.creamMuted,
          },
        ]}
      >
        {cells.map((c, i) => {
          const isLast = i === cells.length - 1;
          const Container = onCellPress ? Pressable : View;
          return (
            <Container
              key={`${c.label}-${i}`}
              onPress={onCellPress ? () => onCellPress(i) : undefined}
              style={({ pressed }: any) => [
                styles.cell,
                !isLast && {
                  borderRightWidth: 1,
                  borderRightColor: colors.borderLight,
                },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text style={[styles.label, { color: colors.textMuted }]}>
                {c.label}
              </Text>
              <View style={styles.valueRow}>
                <Text style={[styles.value, { color: colors.textPrimary }]}>
                  {c.value}
                </Text>
                {c.unit ? (
                  <Text style={[styles.unit, { color: colors.textMuted }]}>
                    {` ${c.unit}`}
                  </Text>
                ) : null}
              </View>
              {c.trend ? (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.trend,
                    { color: c.trendColor ?? colors.accentLight },
                  ]}
                >
                  {c.trend}
                </Text>
              ) : null}
            </Container>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginLeft: 2,
  },
  card: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 4,
    minHeight: 66,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 8.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    letterSpacing: -0.5,
    lineHeight: 22,
  },
  unit: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
  },
  trend: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
  },
});
