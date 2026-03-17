/**
 * MasteryPillarCard — Expandable card for one of the 7 mastery pillars.
 *
 * Collapsed: emoji + name + avg percentile badge + top 2 metric chips.
 * Expanded: full DualLayerMetricRow per metric.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { DualLayerMetricRow } from './DualLayerMetricRow';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import type { MasteryPillar, MasteryMetric } from '../../services/api';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Zone color helper ────────────────────────────────────────────────

const ZONE_COLORS: Record<string, string> = {
  elite: '#27AE60',
  good: '#2ECC71',
  average: '#3498DB',
  developing: '#F39C12',
  below: '#E74C3C',
};

function getPercentileZone(percentile: number): string {
  if (percentile >= 90) return 'elite';
  if (percentile >= 75) return 'good';
  if (percentile >= 40) return 'average';
  if (percentile >= 20) return 'developing';
  return 'below';
}

function getZoneColor(percentile: number | null): string {
  if (percentile === null) return '#3498DB';
  return ZONE_COLORS[getPercentileZone(percentile)] || '#3498DB';
}

// ── Compact metric chip (collapsed state) ────────────────────────────

function MetricChip({
  metric,
  textColor,
  mutedColor,
}: {
  metric: MasteryMetric;
  textColor: string;
  mutedColor: string;
}) {
  const hasValue = metric.playerValue !== null;
  const value = metric.playerValue !== null
    ? Math.round(metric.playerValue * 100) / 100
    : null;

  return (
    <View style={chipStyles.container}>
      <Text style={[chipStyles.label, { color: mutedColor }]} numberOfLines={1}>
        {metric.metricLabel}
      </Text>
      {hasValue ? (
        <View style={chipStyles.valueRow}>
          <Text style={[chipStyles.value, { color: textColor }]}>
            {value}{metric.unit}
          </Text>
          <Text style={[chipStyles.arrow, { color: mutedColor }]}> → </Text>
          <Text style={[chipStyles.target, { color: mutedColor }]}>
            {Math.round(metric.normP50 * 100) / 100}{metric.unit}
          </Text>
        </View>
      ) : (
        <Text style={[chipStyles.noData, { color: mutedColor }]}>
          Target: {Math.round(metric.normP50 * 100) / 100}{metric.unit}
        </Text>
      )}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  container: {
    marginTop: spacing.xs,
  },
  label: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  value: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
  },
  arrow: {
    fontSize: 10,
    fontFamily: fontFamily.regular,
  },
  target: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
  },
  noData: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
    fontStyle: 'italic',
  },
});

// ── Main Component ───────────────────────────────────────────────────

interface Props {
  pillar: MasteryPillar;
  initialExpanded?: boolean;
}

export function MasteryPillarCard({ pillar, initialExpanded = false }: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(initialExpanded);

  const toggleExpand = useCallback(() => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        250,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
    setExpanded((prev) => !prev);
  }, []);

  const zoneColor = getZoneColor(pillar.avgPercentile);
  const topMetrics = pillar.metrics.slice(0, 2);
  const hasData = pillar.metrics.some((m) => m.playerValue !== null);

  return (
    <GlassCard style={styles.card}>
      {/* Header: tap to expand */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={toggleExpand}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.emoji}>{pillar.emoji}</Text>
          <Text
            style={[styles.title, { color: colors.textOnDark }]}
            numberOfLines={1}
          >
            {pillar.displayName}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {pillar.avgPercentile !== null && (
            <View
              style={[
                styles.percentileBadge,
                { backgroundColor: zoneColor + '22', borderColor: zoneColor },
              ]}
            >
              <Text style={[styles.percentileText, { color: zoneColor }]}>
                P{pillar.avgPercentile}
              </Text>
            </View>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textMuted}
          />
        </View>
      </TouchableOpacity>

      {/* Description — always visible */}
      <Text style={[styles.description, { color: colors.textMuted }]}>
        {pillar.athleteDescription}
      </Text>

      {/* Collapsed: top 2 metric chips */}
      {!expanded && topMetrics.length > 0 && (
        <View style={styles.chipArea}>
          {topMetrics.map((m) => (
            <MetricChip
              key={m.metricKey}
              metric={m}
              textColor={colors.textOnDark}
              mutedColor={colors.textMuted}
            />
          ))}
          {pillar.metrics.length > 2 && (
            <Text style={[styles.moreHint, { color: colors.textInactive }]}>
              +{pillar.metrics.length - 2} more — tap to expand
            </Text>
          )}
        </View>
      )}

      {/* Expanded: full DualLayerMetricRow per metric */}
      {expanded && (
        <View style={styles.expandedArea}>
          {pillar.metrics.length > 0 ? (
            pillar.metrics.map((m) => (
              <DualLayerMetricRow key={m.metricKey} metric={m} />
            ))
          ) : (
            <Text style={[styles.noMetrics, { color: colors.textMuted }]}>
              No metrics available for this pillar yet.
            </Text>
          )}
        </View>
      )}

      {/* No-data overlay hint */}
      {!hasData && !expanded && pillar.metrics.length > 0 && (
        <View style={styles.noDataHint}>
          <Ionicons
            name="flask-outline"
            size={14}
            color={colors.accent1}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.noDataText, { color: colors.accent1 }]}>
            Complete a test to unlock this pillar
          </Text>
        </View>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  emoji: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  title: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  percentileBadge: {
    borderRadius: borderRadius.sm,
    borderWidth: 0.5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  percentileText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
  },
  description: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  chipArea: {
    marginTop: spacing.compact,
  },
  moreHint: {
    fontSize: 10,
    fontFamily: fontFamily.regular,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  expandedArea: {
    marginTop: spacing.sm,
  },
  noMetrics: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  noDataHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.compact,
    paddingTop: spacing.compact,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  noDataText: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
  },
});
