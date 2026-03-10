/**
 * FootballAttributeDetailSheet — Expandable panel showing sub-attribute
 * breakdown, age percentile, 30-day sparkline, and improvement tips.
 *
 * Psychology (Research Section 15.3):
 * - Declines framed as "Refocusing this area", NEVER red text
 * - Percentile context normalizes for age (Radziminski et al., 2025)
 * - "How to improve" tips provide actionable next steps (SDT competence)
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSpringEntrance } from '../../hooks/useAnimations';
import { FOOTBALL_ATTRIBUTE_COLORS, getAttributePercentile } from '../../services/footballCalculations';
import {
  FOOTBALL_ATTRIBUTE_FULL_NAMES,
  FOOTBALL_ATTRIBUTE_CONFIG,
  FOOTBALL_POSITION_LABELS,
} from '../../types/football';
import type { FootballAttribute, FootballAttributeData } from '../../types/football';
import type { MockFootballPlayer, MockHistoryEntry } from '../../data/footballMockData';
import { fontFamily, borderRadius, spacing } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../theme/colors';

// ═══ IMPROVEMENT TIPS ═══

const IMPROVEMENT_TIPS: Record<FootballAttribute, string> = {
  pace: 'Focus on 10-30m sprint intervals 2-3x per week. Plyometric box jumps also improve acceleration (Research Section 6.1).',
  shooting: 'Practice shooting from varied distances and angles. Strengthen your kicking leg with single-leg squats and hip flexor work.',
  passing: 'Short pass drills with a wall, progressing to long-range passing. Focus on both feet daily for 10 minutes.',
  dribbling: 'Cone drills and slalom work improve close control. Practice with both feet — even 5 minutes daily builds neural pathways.',
  defending: 'Lateral shuffle drills and backward sprints build defensive agility. Add grip and push strength work for duels.',
  physicality: 'Yo-Yo IR1 intervals build match endurance. Prioritize 8+ hours of sleep — recovery is where gains happen.',
};

// ═══ PROPS ═══

interface FootballAttributeDetailSheetProps {
  attribute: FootballAttribute;
  data: FootballAttributeData;
  player: MockFootballPlayer;
  history: MockHistoryEntry[];
  onClose?: () => void;
}

// ═══ SPARKLINE HELPER ═══

function buildSparklinePath(
  values: number[],
  width: number,
  height: number,
): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = 2;
  const usableH = height - padding * 2;

  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = padding + usableH - ((v - min) / range) * usableH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// ═══ COMPONENT ═══

export function FootballAttributeDetailSheet({
  attribute,
  data,
  player,
  history,
  onClose,
}: FootballAttributeDetailSheetProps) {
  const { colors } = useTheme();
  const s = React.useMemo(() => createStyles(colors), [colors]);
  const entranceStyle = useSpringEntrance(0);
  const attrColor = FOOTBALL_ATTRIBUTE_COLORS[attribute];
  const config = FOOTBALL_ATTRIBUTE_CONFIG[attribute];

  // Age percentile
  const percentile = getAttributePercentile(
    attribute,
    data.score,
    player.age,
    player.position,
  );
  const positionLabel = FOOTBALL_POSITION_LABELS[player.position];

  // Sparkline data from history
  const sparkValues = history.map((h) => h.attributes[attribute]);
  const sparkWidth = 260;
  const sparkHeight = 40;
  const sparkPath = buildSparklinePath(sparkValues, sparkWidth, sparkHeight);

  return (
    <Animated.View style={[entranceStyle, s.container]}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={[s.colorDot, { backgroundColor: attrColor }]} />
          <Text style={s.title}>{FOOTBALL_ATTRIBUTE_FULL_NAMES[attribute]}</Text>
          <Text style={[s.score, { color: attrColor }]}>{data.score}</Text>
        </View>
        {onClose && (
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close-circle" size={22} color={colors.textInactive} />
          </Pressable>
        )}
      </View>

      {/* Trend — growth-oriented language */}
      {data.trend !== 0 && (
        <View style={s.trendRow}>
          <Ionicons
            name={data.trend > 0 ? 'trending-up' : 'trending-down'}
            size={16}
            color={data.trend > 0 ? '#30D158' : attrColor}
          />
          <Text
            style={[
              s.trendText,
              { color: data.trend > 0 ? '#30D158' : attrColor },
            ]}
          >
            {data.trend > 0
              ? `+${data.trend} from last week`
              : 'Refocusing this area'}
          </Text>
        </View>
      )}

      {/* Percentile context */}
      <View style={s.percentileRow}>
        <Ionicons name="stats-chart" size={14} color={colors.accent2} />
        <Text style={s.percentileText}>
          Top {Math.max(1, 100 - percentile)}% for {player.age}-year-old {positionLabel}s
        </Text>
      </View>

      {/* 30-day sparkline */}
      {sparkValues.length >= 2 && (
        <View style={s.sparklineContainer}>
          <Text style={s.sparklineLabel}>30-Day Trend</Text>
          <Svg width={sparkWidth} height={sparkHeight}>
            <Polyline
              points={sparkPath}
              fill="none"
              stroke={attrColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
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

      {/* Sub-attributes breakdown */}
      <View style={s.subSection}>
        <Text style={s.subSectionTitle}>Physical Tests</Text>
        {config.subAttributes.map((sub) => (
          <View key={sub.name} style={s.subRow}>
            <View style={s.subInfo}>
              <Text style={s.subName}>{sub.name}</Text>
              <Text style={s.subUnit}>{sub.unit}</Text>
            </View>
            <View style={s.subWeightBadge}>
              <Text style={s.subWeight}>{Math.round(sub.weight * 100)}%</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Sources list */}
      <View style={s.sourcesList}>
        <Text style={s.sourcesTitle}>Completed Tests</Text>
        {data.sources.map((src) => (
          <View key={src} style={s.sourceItem}>
            <Ionicons name="checkmark-circle" size={14} color={attrColor} />
            <Text style={s.sourceText}>{src}</Text>
          </View>
        ))}
      </View>

      {/* How to improve */}
      <View style={s.tipContainer}>
        <View style={s.tipHeader}>
          <Ionicons name="bulb-outline" size={16} color={colors.accent2} />
          <Text style={s.tipTitle}>How to Improve</Text>
        </View>
        <Text style={s.tipText}>{IMPROVEMENT_TIPS[attribute]}</Text>
      </View>
    </Animated.View>
  );
}

// ═══ STYLES ═══

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
    percentileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: spacing.md,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      backgroundColor: 'rgba(0, 217, 255, 0.08)',
      borderRadius: borderRadius.sm,
      alignSelf: 'flex-start',
    },
    percentileText: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.accent2,
    },
    sparklineContainer: {
      marginBottom: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    sparklineLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      color: colors.textInactive,
      marginBottom: 4,
    },
    sourcesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
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
    subSection: {
      marginBottom: spacing.md,
    },
    subSectionTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.textInactive,
      marginBottom: spacing.sm,
    },
    subRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 4,
    },
    subInfo: {
      flex: 1,
    },
    subName: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textOnDark,
    },
    subUnit: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      color: colors.textInactive,
    },
    subWeightBadge: {
      backgroundColor: colors.glass,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    subWeight: {
      fontFamily: fontFamily.semiBold,
      fontSize: 11,
      color: colors.textMuted,
    },
    sourcesList: {
      marginBottom: spacing.md,
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
    tipContainer: {
      backgroundColor: colors.glass,
      borderRadius: borderRadius.sm,
      padding: spacing.compact,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    tipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    tipTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      color: colors.accent2,
    },
    tipText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
    },
  });
}
