/**
 * ShotDetailScreen — Detailed view of a single padel shot.
 * Shows rating history, 3 sub-metric bars, coach tip, and age comparison.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import { useSpringEntrance, useBarFill } from '../hooks/useAnimations';
import { getShotRatingColor } from '../services/padelCalculations';
import { useSportContext } from '../hooks/useSportContext';
import { usePadelProgress } from '../hooks/usePadelProgress';
import { GlassCard } from '../components/GlassCard';
import { colors, fontFamily, borderRadius, spacing } from '../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { ShotType, ShotRatingsData } from '../types/padel';

type Props = NativeStackScreenProps<MainStackParamList, 'ShotDetail'>;

function SubMetricBar({
  label,
  value,
  index,
}: {
  label: string;
  value: number;
  index: number;
}) {
  const pct = (value / 10) * 100;
  const barColor =
    pct >= 70 ? '#30D158' : pct >= 50 ? '#FFD60A' : pct >= 35 ? '#FF9500' : '#00D9FF';

  return (
    <View style={styles.subMetricRow}>
      <Text style={styles.subMetricLabel}>{label}</Text>
      <View style={styles.subMetricBarTrack}>
        <View
          style={[
            styles.subMetricBarFill,
            { width: `${pct}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      <Text style={[styles.subMetricValue, { color: barColor }]}>{value}/10</Text>
    </View>
  );
}

function MiniLineChart({
  data,
  width,
  height,
}: {
  data: { date: string; rating: number }[];
  width: number;
  height: number;
}) {
  if (data.length < 2) return null;

  const padding = 10;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const maxVal = Math.max(...data.map((d) => d.rating), 1);
  const minVal = Math.min(...data.map((d) => d.rating), 0);
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => ({
    x: padding + (i / (data.length - 1)) * chartW,
    y: padding + chartH - ((d.rating - minVal) / range) * chartH,
  }));

  const pathD = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Path d={pathD} stroke={colors.accent1} strokeWidth={2} fill="none" />
      {points.map((p, i) => (
        <SvgCircle
          key={i}
          cx={p.x}
          cy={p.y}
          r={3}
          fill={colors.accent1}
          stroke="#FFFFFF"
          strokeWidth={1}
        />
      ))}
    </Svg>
  );
}

export function ShotDetailScreen({ route }: Props) {
  const { shotType } = route.params;
  const shot = shotType as ShotType;
  const { sportConfig } = useSportContext();
  const { shotRatings } = usePadelProgress();

  // Build definition from sportConfig
  const fullSkill = sportConfig.fullSkills.find(s => s.key === shot);
  const definition = fullSkill ? {
    type: shot,
    name: fullSkill.name,
    category: fullSkill.category ?? '',
    description: fullSkill.description ?? '',
    icon: fullSkill.icon ?? 'help-outline',
    subMetrics: (fullSkill.subMetrics ?? []).slice(0, 3).map(sm => ({
      key: sm.key, label: sm.label, description: sm.description ?? '',
    })),
  } : null;

  const data = shotRatings?.shots[shot];
  const ratingColor = getShotRatingColor(data?.rating ?? 0);

  const entrance0 = useSpringEntrance(0);
  const entrance1 = useSpringEntrance(1);
  const entrance2 = useSpringEntrance(2);
  const entrance3 = useSpringEntrance(3);

  // Coach tip based on weakest sub-metric
  const coachTip = useMemo(() => {
    if (!definition || !data) return '';
    const entries = Object.entries(data.subMetrics);
    entries.sort((a, b) => a[1] - b[1]);
    const weakest = entries[0];
    const def = definition.subMetrics.find((m) => m.key === weakest[0]);
    if (!def) return '';
    return `Focus on ${def.label.toLowerCase()} — currently rated ${weakest[1]}/10. ${def.description}`;
  }, [data, definition]);

  if (!definition || !data) return null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <Animated.View style={entrance0}>
        <GlassCard style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroName}>{definition.name}</Text>
              <Text style={styles.heroCategory}>{definition.category}</Text>
            </View>
            <View style={styles.heroRatingContainer}>
              <Text style={[styles.heroRating, { color: ratingColor }]}>
                {data.rating}
              </Text>
              <Text style={styles.heroRatingLabel}>/ 100</Text>
            </View>
          </View>
          <Text style={styles.heroDesc}>{definition.description}</Text>

          {/* Trend + sessions */}
          <View style={styles.heroMeta}>
            {data.trend !== 0 && (
              <View style={styles.trendBadge}>
                <Ionicons
                  name={data.trend > 0 ? 'trending-up' : 'trending-down'}
                  size={14}
                  color={data.trend > 0 ? '#30D158' : '#8E8E93'}
                />
                <Text
                  style={{
                    color: data.trend > 0 ? '#30D158' : '#8E8E93',
                    fontFamily: fontFamily.medium,
                    fontSize: 12,
                  }}
                >
                  {data.trend > 0 ? '+' : ''}{data.trend}
                </Text>
              </View>
            )}
            <Text style={styles.sessionsText}>
              {data.sessionsLogged} sessions logged
            </Text>
          </View>
        </GlassCard>
      </Animated.View>

      {/* Rating History Chart */}
      <Animated.View style={entrance1}>
        <GlassCard style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Rating History</Text>
          <MiniLineChart data={data.history} width={300} height={120} />
          <View style={styles.chartDates}>
            {data.history.length > 0 && (
              <>
                <Text style={styles.chartDate}>{data.history[0].date}</Text>
                <Text style={styles.chartDate}>
                  {data.history[data.history.length - 1].date}
                </Text>
              </>
            )}
          </View>
        </GlassCard>
      </Animated.View>

      {/* Sub-Metrics */}
      <Animated.View style={entrance2}>
        <GlassCard style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Sub-Metrics</Text>
          {definition.subMetrics.map((sm, i) => (
            <SubMetricBar
              key={sm.key}
              label={sm.label}
              value={data.subMetrics[sm.key] || 0}
              index={i}
            />
          ))}
        </GlassCard>
      </Animated.View>

      {/* Coach Tip */}
      <Animated.View style={entrance3}>
        <GlassCard style={{ ...styles.sectionCard, ...styles.tipCard }}>
          <View style={styles.tipHeader}>
            <Ionicons name="bulb" size={18} color={colors.accent1} />
            <Text style={styles.tipTitle}>Coach Tip</Text>
          </View>
          <Text style={styles.tipText}>{coachTip}</Text>
        </GlassCard>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: spacing.md,
  },
  heroCard: {},
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  heroName: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textOnDark,
  },
  heroCategory: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textInactive,
    marginTop: 2,
  },
  heroRatingContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  heroRating: {
    fontFamily: fontFamily.bold,
    fontSize: 36,
  },
  heroRatingLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textInactive,
    marginLeft: 4,
  },
  heroDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textInactive,
    lineHeight: 18,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sessionsText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  sectionCard: {},
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textOnDark,
    marginBottom: spacing.md,
  },
  subMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  subMetricLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textOnDark,
    width: '30%',
  },
  subMetricBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.glass,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  subMetricBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  subMetricValue: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    width: 45,
    textAlign: 'right',
  },
  chartDates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  chartDate: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: colors.textMuted,
  },
  tipCard: {
    borderColor: 'rgba(255, 107, 53, 0.2)',
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  tipTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.accent1,
  },
  tipText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textOnDark,
    lineHeight: 19,
  },
});
