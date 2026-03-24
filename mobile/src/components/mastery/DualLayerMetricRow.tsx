/**
 * DualLayerMetricRow — Shows player value vs benchmark P50 with delta.
 *
 * When playerValue is present: full dual-layer bar with colored delta.
 * When playerValue is null: ghost target with "Test needed" badge.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { MasteryMetric } from '../../services/api';
import { colors } from '../../theme/colors';

// ── Zone colors (same as PercentileBar) ──────────────────────────────

const ZONE_COLORS: Record<string, string> = {
  elite: colors.accentDark,
  good: colors.accent,
  average: colors.info,
  developing: colors.warning,
  below: colors.error,
};

function getZoneColor(zone: string | null): string {
  return zone ? ZONE_COLORS[zone] || colors.info : colors.info;
}

/**
 * Determine if a delta is favorable based on direction.
 * For "lower_better" (e.g. sprint times), negative delta = good.
 * For "higher_better" (e.g. jump height), positive delta = good.
 */
function isDeltaFavorable(
  delta: number,
  direction: 'lower_better' | 'higher_better',
): boolean {
  return direction === 'lower_better' ? delta < 0 : delta > 0;
}

function formatValue(value: number | null, unit: string): string {
  if (value === null) return '—';
  // Round to 2 decimal places for display
  const rounded = Math.round(value * 100) / 100;
  return unit ? `${rounded}${unit}` : `${rounded}`;
}

function formatDelta(
  delta: number | null,
  unit: string,
  direction: 'lower_better' | 'higher_better',
): string {
  if (delta === null) return '';
  const abs = Math.abs(Math.round(delta * 100) / 100);
  const sign = delta > 0 ? '+' : '-';
  const qualifier =
    direction === 'lower_better'
      ? delta < 0
        ? 'faster'
        : 'slower'
      : delta > 0
        ? 'better'
        : 'below';
  return `${sign}${abs}${unit} ${qualifier}`;
}

// ── Component ────────────────────────────────────────────────────────

interface Props {
  metric: MasteryMetric;
}

export function DualLayerMetricRow({ metric }: Props) {
  const { colors } = useTheme();
  const hasData = metric.playerValue !== null;
  const zoneColor = getZoneColor(metric.zone);

  // Bar percentages
  const playerPct = metric.percentile ?? 0;
  const normP50Pct = 50; // P50 is always at 50% of the range

  // Delta color
  const deltaFavorable =
    metric.delta !== null
      ? isDeltaFavorable(metric.delta, metric.direction)
      : null;
  const deltaColor =
    deltaFavorable === null
      ? colors.textMuted
      : deltaFavorable
        ? colors.accent
        : colors.warning;

  return (
    <View style={styles.container}>
      {/* Header row: label + values */}
      <View style={styles.header}>
        <Text
          style={[styles.metricLabel, { color: colors.textOnDark }]}
          numberOfLines={1}
        >
          {metric.metricLabel}
        </Text>
        <View style={styles.valuesRow}>
          {hasData ? (
            <>
              <Text style={[styles.playerValue, { color: colors.textOnDark }]}>
                {formatValue(metric.playerValue, metric.unit)}
              </Text>
              <Text style={[styles.separator, { color: colors.textMuted }]}>
                →
              </Text>
              <Text style={[styles.normValue, { color: colors.textMuted }]}>
                {formatValue(metric.normP50, metric.unit)}
              </Text>
            </>
          ) : (
            <View
              style={[
                styles.testNeededBadge,
                { backgroundColor: colors.accent1 + '18' },
              ]}
            >
              <Text style={[styles.testNeededText, { color: colors.accent1 }]}>
                Test needed
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Percentile bar with P50 norm marker */}
      <View
        style={[styles.track, { backgroundColor: colors.backgroundElevated }]}
      >
        {/* Player fill */}
        {hasData && (
          <View
            style={[
              styles.fill,
              { width: `${playerPct}%`, backgroundColor: zoneColor },
            ]}
          />
        )}
        {/* P50 norm marker line */}
        <View
          style={[
            styles.normMarker,
            {
              left: `${normP50Pct}%`,
              backgroundColor: colors.textMuted,
            },
          ]}
        />
        {/* Player dot */}
        {hasData && (
          <View
            style={[
              styles.playerDot,
              {
                left: `${playerPct}%`,
                backgroundColor: zoneColor,
                borderColor: colors.background,
              },
            ]}
          />
        )}
        {/* Ghost target dot when no player data */}
        {!hasData && (
          <View
            style={[
              styles.ghostDot,
              {
                left: `${normP50Pct}%`,
                borderColor: colors.textMuted,
              },
            ]}
          />
        )}
      </View>

      {/* Zone labels with norm values */}
      <View style={styles.zoneRow}>
        {[
          { key: 'p10', label: 'Needs Attention' },
          { key: 'p25', label: 'Developing' },
          { key: 'p50', label: 'Solid' },
          { key: 'p75', label: 'Strong' },
          { key: 'p90', label: 'Elite' },
        ].map((z) => {
          const normVal = metric.norm?.[z.key as keyof typeof metric.norm];
          const isP50 = z.key === 'p50';
          return (
            <View key={z.key} style={styles.zoneItem}>
              <Text
                style={[
                  styles.zoneLabel,
                  {
                    color: isP50 ? colors.textInactive : colors.textMuted,
                    fontFamily: isP50 ? fontFamily.semiBold : fontFamily.regular,
                  },
                ]}
              >
                {z.label}
              </Text>
              {normVal != null && normVal !== 0 && (
                <Text style={[styles.normValueLabel, { color: colors.textInactive }]}>
                  {typeof normVal === 'number' ? (normVal % 1 === 0 ? normVal : normVal.toFixed(1)) : normVal}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Delta label */}
      {hasData && metric.delta !== null && (
        <Text style={[styles.deltaText, { color: deltaColor }]}>
          {formatDelta(metric.delta, metric.unit, metric.direction)}
        </Text>
      )}

      {/* Ghost target for no-data state */}
      {!hasData && (
        <Text style={[styles.targetHint, { color: colors.textMuted }]}>
          Target: {formatValue(metric.normP50, metric.unit)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.compact,
    paddingTop: spacing.compact,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  metricLabel: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
    flex: 1,
  },
  valuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playerValue: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
  },
  separator: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
  },
  normValue: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
  },
  testNeededBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  testNeededText: {
    fontSize: 10,
    fontFamily: fontFamily.medium,
    letterSpacing: 0.5,
  },
  track: {
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
    overflow: 'visible',
    position: 'relative' as const,
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  normMarker: {
    position: 'absolute' as const,
    top: -2,
    width: 1.5,
    height: 12,
    borderRadius: 1,
    transform: [{ translateX: -0.75 }],
    opacity: 0.5,
  },
  playerDot: {
    position: 'absolute' as const,
    top: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    transform: [{ translateX: -7 }],
  },
  ghostDot: {
    position: 'absolute' as const,
    top: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    transform: [{ translateX: -6 }],
    opacity: 0.4,
  },
  zoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  zoneItem: {
    alignItems: 'center',
  },
  zoneLabel: {
    fontSize: 9,
    fontFamily: fontFamily.regular,
  },
  normValueLabel: {
    fontSize: 8,
    fontFamily: fontFamily.regular,
    marginTop: 1,
  },
  deltaText: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    marginTop: spacing.xs,
  },
  targetHint: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
});
