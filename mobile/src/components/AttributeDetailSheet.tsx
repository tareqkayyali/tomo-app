/**
 * AttributeDetailSheet — Expandable panel showing sub-metrics for a DNA attribute.
 * Shows mini progress bars for each source metric + data source coverage.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSpringEntrance, useBarFill } from '../hooks/useAnimations';
import { DNA_ATTRIBUTE_COLORS } from '../services/padelCalculations';
import { DNA_ATTRIBUTE_FULL_NAMES } from '../types/padel';
import { fontFamily, borderRadius, spacing } from '../theme';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';
import type { DNAAttribute, DNAAttributeData, PhysicalMetric } from '../types/padel';

interface AttributeDetailSheetProps {
  attribute: DNAAttribute;
  data: DNAAttributeData;
  metrics: PhysicalMetric[];
  onClose?: () => void;
}

function MetricBar({
  metric,
  index,
  s,
}: {
  metric: PhysicalMetric;
  index: number;
  s: ReturnType<typeof createStyles>;
}) {
  const barPct = Math.min((metric.rating / 1000) * 100, 100);
  const fillProgress = useBarFill(barPct, 100 + index * 60);

  const barStyle = {
    width: `${barPct}%` as any,
    backgroundColor:
      barPct >= 70 ? '#30D158' : barPct >= 40 ? '#FFD60A' : '#00D9FF',
  };

  return (
    <View style={s.metricRow}>
      <View style={s.metricInfo}>
        <Text style={s.metricName}>{metric.name}</Text>
        <Text style={s.metricValue}>
          {metric.rawValue} {metric.unit}
        </Text>
      </View>
      <View style={s.metricBarTrack}>
        <View style={[s.metricBarFill, barStyle]} />
      </View>
      <Text style={s.metricRating}>{metric.rating}</Text>
    </View>
  );
}

export function AttributeDetailSheet({
  attribute,
  data,
  metrics,
  onClose,
}: AttributeDetailSheetProps) {
  const { colors } = useTheme();
  const s = React.useMemo(() => createStyles(colors), [colors]);
  const entranceStyle = useSpringEntrance(0);
  const attrColor = DNA_ATTRIBUTE_COLORS[attribute];
  const attrMetrics = metrics.filter((m) => m.dna === attribute);

  return (
    <Animated.View style={[entranceStyle, s.container]}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={[s.colorDot, { backgroundColor: attrColor }]} />
          <Text style={s.title}>{DNA_ATTRIBUTE_FULL_NAMES[attribute]}</Text>
          <Text style={[s.score, { color: attrColor }]}>{data.score}</Text>
        </View>
        {onClose && (
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close-circle" size={22} color={colors.textInactive} />
          </Pressable>
        )}
      </View>

      {/* Trend */}
      {data.trend !== 0 && (
        <View style={s.trendRow}>
          <Ionicons
            name={data.trend > 0 ? 'trending-up' : 'trending-down'}
            size={16}
            color={data.trend > 0 ? '#30D158' : '#8E8E93'}
          />
          <Text
            style={[
              s.trendText,
              { color: data.trend > 0 ? '#30D158' : '#8E8E93' },
            ]}
          >
            {data.trend > 0 ? '+' : ''}{data.trend} from last week
          </Text>
        </View>
      )}

      {/* Data sources indicator */}
      <View style={s.sourcesRow}>
        <Text style={s.sourcesLabel}>
          Based on {data.sourcesAvailable}/{data.sourcesTotal} data sources
        </Text>
        <View style={s.sourcesDots}>
          {Array.from({ length: data.sourcesTotal }, (_, i) => (
            <View
              key={i}
              style={[
                s.sourceDot,
                i < data.sourcesAvailable
                  ? { backgroundColor: attrColor }
                  : { backgroundColor: colors.glass },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Metric bars */}
      {attrMetrics.length > 0 && (
        <View style={s.metricsSection}>
          {attrMetrics.map((metric, i) => (
            <MetricBar key={metric.name} metric={metric} index={i} s={s} />
          ))}
        </View>
      )}

      {/* Sources list */}
      <View style={s.sourcesList}>
        <Text style={s.sourcesTitle}>Sources</Text>
        {data.sources.map((src) => (
          <View key={src} style={s.sourceItem}>
            <Ionicons name="checkmark-circle" size={14} color={attrColor} />
            <Text style={s.sourceText}>{src}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      padding: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    colorDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    title: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.textOnDark,
    },
    score: {
      fontFamily: fontFamily.bold,
      fontSize: 24,
    },
    trendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: spacing.sm,
    },
    trendText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
    },
    sourcesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    sourcesLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
    },
    sourcesDots: {
      flexDirection: 'row',
      gap: 4,
    },
    sourceDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    metricsSection: {
      marginBottom: spacing.md,
    },
    metricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    metricInfo: {
      width: '35%',
    },
    metricName: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textOnDark,
    },
    metricValue: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      color: colors.textInactive,
    },
    metricBarTrack: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.glass,
      marginHorizontal: spacing.sm,
      overflow: 'hidden',
    },
    metricBarFill: {
      height: '100%',
      borderRadius: 2,
    },
    metricRating: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      color: colors.textOnDark,
      width: 35,
      textAlign: 'right',
    },
    sourcesList: {
      marginTop: spacing.sm,
    },
    sourcesTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      color: colors.textInactive,
      marginBottom: spacing.xs,
    },
    sourceItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    sourceText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textOnDark,
    },
  });
}
