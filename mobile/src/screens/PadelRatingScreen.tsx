/**
 * PadelRatingScreen — Full padel rating pathway with pro milestones.
 * Hero card with animated counter, vertical ladder, and rating history.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import { useSpringEntrance } from '../hooks/useAnimations';
import { useTheme } from '../hooks/useTheme';
import { PadelRatingPathway } from '../components/PadelRatingPathway';
import { GlassCard } from '../components/GlassCard';
import { getDNACard, getProMilestones } from '../services/padelMockData';
import { fontFamily, spacing } from '../theme';
import type { ThemeColors } from '../theme/colors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'PadelRating'>;

function RatingHistoryChart({
  data,
  width,
  height,
  colors,
}: {
  data: { date: string; rating: number }[];
  width: number;
  height: number;
  colors: ThemeColors;
}) {
  if (data.length < 2) return null;

  const padding = 16;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const maxVal = Math.max(...data.map((d) => d.rating));
  const minVal = Math.min(...data.map((d) => d.rating));
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => ({
    x: padding + (i / (data.length - 1)) * chartW,
    y: padding + chartH - ((d.rating - minVal) / range) * chartH,
  }));

  const pathD = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');

  // Fill area
  const areaD =
    pathD +
    ` L ${points[points.length - 1].x} ${padding + chartH}` +
    ` L ${points[0].x} ${padding + chartH} Z`;

  return (
    <View>
      <Svg width={width} height={height}>
        <Path d={areaD} fill="rgba(255, 107, 53, 0.1)" />
        <Path d={pathD} stroke={colors.accent1} strokeWidth={2.5} fill="none" />
        {points.map((p, i) => (
          <SvgCircle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={colors.accent1}
            stroke={colors.background}
            strokeWidth={2}
          />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 4 }}>
        {data.map((d, i) => (
          <Text key={i} style={{ fontFamily: fontFamily.regular, fontSize: 10, color: colors.textMuted }}>
            {d.date.slice(5)}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function PadelRatingScreen(_props: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const dna = getDNACard();
  const milestones = getProMilestones('men');

  const entrance0 = useSpringEntrance(0);
  const entrance1 = useSpringEntrance(1);
  const entrance2 = useSpringEntrance(2);

  // Next milestone
  const nextMilestone = useMemo(() => {
    const sorted = [...milestones].sort((a, b) => a.rating - b.rating);
    return sorted.find((m) => m.rating > dna.padelRating);
  }, [milestones, dna.padelRating]);

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Rating Trend Chart */}
      <Animated.View style={entrance0}>
        <GlassCard>
          <Text style={s.sectionTitle}>Rating Trend</Text>
          <RatingHistoryChart
            data={dna.history}
            width={320}
            height={140}
            colors={colors}
          />
        </GlassCard>
      </Animated.View>

      {/* Next Milestone */}
      {nextMilestone && (
        <Animated.View style={entrance1}>
          <GlassCard style={s.milestoneCard}>
            <Text style={s.milestoneLabel}>Next Milestone</Text>
            <View style={s.milestoneRow}>
              <Text style={s.milestoneName}>{nextMilestone.name}</Text>
              <Text style={s.milestoneRating}>{nextMilestone.rating}</Text>
            </View>
            <Text style={s.milestoneReason}>{nextMilestone.reason}</Text>
            <View style={s.milestoneProgress}>
              <View style={s.milestoneTrack}>
                <View
                  style={[
                    s.milestoneFill,
                    {
                      width: `${Math.min(
                        (dna.padelRating / nextMilestone.rating) * 100,
                        100,
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={s.milestoneGap}>
                {nextMilestone.rating - dna.padelRating} pts away
              </Text>
            </View>
          </GlassCard>
        </Animated.View>
      )}

      {/* Full Pathway Ladder */}
      <Animated.View style={entrance2}>
        <GlassCard>
          <Text style={s.sectionTitle}>Rating Pathway</Text>
          <PadelRatingPathway
            rating={dna.padelRating}
            level={dna.padelLevel}
            milestones={milestones}
            compact={false}
          />
        </GlassCard>
      </Animated.View>
    </ScrollView>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: 40,
      gap: spacing.md,
    },
    sectionTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: c.textOnDark,
      marginBottom: spacing.md,
    },
    milestoneCard: {
      borderColor: 'rgba(255, 215, 0, 0.2)',
    },
    milestoneLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      color: c.textInactive,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    milestoneRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    milestoneName: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: c.textOnDark,
    },
    milestoneRating: {
      fontFamily: fontFamily.bold,
      fontSize: 20,
      color: c.accent1,
    },
    milestoneReason: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: c.textInactive,
      marginTop: 4,
      marginBottom: spacing.sm,
    },
    milestoneProgress: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    milestoneTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.glass,
      overflow: 'hidden',
    },
    milestoneFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: c.tierGold,
    },
    milestoneGap: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: c.textInactive,
    },
  });
}
