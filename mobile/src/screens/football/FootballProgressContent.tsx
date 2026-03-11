/**
 * FootballProgressContent — Football-specific progress dashboard.
 *
 * Rendered inside the parent ProgressScreen's ScrollView when the
 * user's active sport is football.
 *
 * Sections:
 * 1. DNA Card Hero (FIFA-style player card)
 * 2. Attribute Trends (30-day sparklines for 6 attributes)
 * 3. Skill Mastery (8 skills sorted by highest rating)
 * 4. Rating Pathway (compact progress bar)
 * 5. Cross-Training Impact (padel → football benefit, shown when padel events exist)
 * 6. Streak Tracker (sport-agnostic)
 * 7. Sleep Recovery (sport-agnostic)
 * 8. View Full Football Profile button
 *
 * Psychology:
 * - Growth language: "+3 this month" (green), "Refocusing" (attribute color, never red)
 * - Competence reinforcement: highest-rated skills shown first
 * - "Next Level" skills shown in teal at bottom (never "Weak")
 * - Percentile context normalized for age (Radziminski et al., 2025)
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, {
  Polyline,
  Circle as SvgCircle,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { GlassCard, GradientButton } from '../../components';
import { DNACard } from '../../components/DNACard';
import type { CardAttribute, CardTier } from '../../components/DNACard';
import { SkillRatingBar } from '../../components/SkillRatingBar';
import type { SkillItem } from '../../components/SkillRatingBar';
import { RatingPathway } from '../../components/RatingPathway';
import type { PathwayLevel } from '../../components/RatingPathway';
import { FootballAttributeDetailSheet } from './FootballAttributeDetailSheet';
import { CrossTrainingModule } from '../../components/football/CrossTrainingModule';
import { EmptyProgressState } from '../../components/EmptyProgressState';

import { useSpringEntrance } from '../../hooks/useAnimations';
import { useTheme } from '../../hooks/useTheme';

import { useAuth } from '../../hooks/useAuth';
import { getSportConfig } from '../../hooks/useSportContext';
import type { MockFootballPlayer, MockHistoryEntry } from '../../data/footballMockData';
import {
  FOOTBALL_ATTRIBUTE_ORDER,
  FOOTBALL_ATTRIBUTE_LABELS,
  FOOTBALL_ATTRIBUTE_FULL_NAMES,
  FOOTBALL_SKILL_ORDER,
  FOOTBALL_SKILL_CONFIG,
  FOOTBALL_RATING_LEVELS,
  FOOTBALL_POSITION_LABELS,
} from '../../types/football';
import type { FootballAttribute } from '../../types/football';
import { FOOTBALL_ATTRIBUTE_COLORS } from '../../services/footballCalculations';

import { buildSparklinePath } from '../../utils/sparkline';
import { fontFamily, spacing, borderRadius, layout } from '../../theme';
import type { ThemeColors } from '../../theme/colors';

// ═══ HELPERS ═══

function getFootballCardTier(pathwayRating: number): CardTier {
  if (pathwayRating >= 850) return 'diamond';
  if (pathwayRating >= 500) return 'gold';
  if (pathwayRating >= 300) return 'silver';
  return 'bronze';
}

// ═══ STREAK PROGRESS RING ═══
// Duplicated from ProgressScreen (sport-agnostic, self-contained)

const TRACK_GRAY = '#E8E8E8';

function StreakProgressRing({
  progress,
  size = 80,
  strokeWidth = 6,
  colors,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  colors: ThemeColors;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <Svg width={size} height={size}>
      <Defs>
        <SvgGradient id="streakGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.accent1} />
          <Stop offset="1" stopColor={colors.accent2} />
        </SvgGradient>
      </Defs>
      <SvgCircle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={TRACK_GRAY}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <SvgCircle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="url(#streakGrad)"
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

// ═══ PROPS ═══

interface FootballProgressContentProps {
  navigation: any;
  streak: number;
  nextMilestone: { name: string; target: number; progress: number } | null;
  streakProgress: number;
  latestSleep: number | null;
  sleepOptimal: boolean;
  isFocused: boolean;
}

// ═══ COMPONENT ═══

export function FootballProgressContent({
  navigation,
  streak,
  nextMilestone,
  streakProgress,
  latestSleep,
  sleepOptimal,
  isFocused,
}: FootballProgressContentProps) {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const footballConfig = getSportConfig('football');
  const s = useMemo(() => createStyles(colors), [colors]);

  // ── Data via sport pipeline ──
  const userId = profile?.uid || profile?.id || 'osama-kayyali';
  const player = footballConfig.mockData.getCard(userId) as MockFootballPlayer | null;
  const skills = footballConfig.mockData.getSkills(userId);
  const history = footballConfig.mockData.getHistory(userId) as MockHistoryEntry[] | null;

  // ── State ──
  const [selectedAttr, setSelectedAttr] = useState<FootballAttribute | null>(null);

  // ── Empty state ──
  if (!player || !skills || !history) {
    return (
      <EmptyProgressState
        sport="football"
        onLogSession={() => navigation.navigate('Plan' as any)}
        onTakeTest={() => navigation.navigate('Tests' as any)}
      />
    );
  }

  const card = player.card;

  // ── Map football attributes → CardAttribute[] ──
  const footballAttributes: CardAttribute[] = FOOTBALL_ATTRIBUTE_ORDER.map((attr) => ({
    key: attr,
    label: FOOTBALL_ATTRIBUTE_LABELS[attr],
    abbreviation: FOOTBALL_ATTRIBUTE_FULL_NAMES[attr],
    value: card.attributes[attr].score,
    maxValue: 99,
    color: FOOTBALL_ATTRIBUTE_COLORS[attr],
    trend: card.attributes[attr].trend,
  }));

  const cardTier = getFootballCardTier(card.footballRating);

  // ── Map football skills → SkillItem[], sorted highest-first ──
  const sortedSkills: SkillItem[] = useMemo(() => {
    return FOOTBALL_SKILL_ORDER
      .map((skillKey) => {
        const skillData = skills[skillKey];
        const config = FOOTBALL_SKILL_CONFIG[skillKey];
        return {
          key: skillKey,
          name: config.name,
          overall: skillData.rating,
          subMetrics: config.subMetrics.map((sm) => ({
            name: sm.label,
            value: skillData.subMetrics[sm.key] ?? 0,
            unit: sm.unit,
          })),
          icon: config.icon,
          category: config.category,
          trend: skillData.trend,
        };
      })
      .sort((a, b) => b.overall - a.overall);
  }, [skills]);

  // ── Skills summary ──
  const skillsAvg = Math.round(
    sortedSkills.reduce((sum, sk) => sum + sk.overall, 0) / sortedSkills.length,
  );
  const strongestSkill = sortedSkills[0];
  const focusSkill = sortedSkills[sortedSkills.length - 1];

  // ── Map rating levels → PathwayLevel[] ──
  const pathwayLevels: PathwayLevel[] = FOOTBALL_RATING_LEVELS.map((l) => ({
    name: l.name,
    minRating: l.minRating,
    maxRating: l.maxRating,
    description: l.description,
    color: l.color,
  }));
  const currentLevel = pathwayLevels.find(
    (l) => card.footballRating >= l.minRating && card.footballRating <= l.maxRating,
  ) ?? pathwayLevels[0];

  // ── Attribute trends from history ──
  const attributeTrends = useMemo(() => {
    return FOOTBALL_ATTRIBUTE_ORDER.map((attr) => {
      const points = history.map((entry) => entry.attributes[attr]);
      const current = points[points.length - 1];
      const oldest = points[0];
      const delta = current - oldest;
      return { attr, points, current, delta };
    });
  }, [history]);

  // ── Animations ──
  const entrance1 = useSpringEntrance(1, 0, isFocused);
  const entrance2 = useSpringEntrance(2, 0, isFocused);
  const entrance3 = useSpringEntrance(3, 0, isFocused);
  const entrance4 = useSpringEntrance(4, 0, isFocused);
  const entrance5 = useSpringEntrance(5, 0, isFocused);
  const entrance6 = useSpringEntrance(6, 0, isFocused);
  const entrance7 = useSpringEntrance(7, 0, isFocused);

  return (
    <>
      {/* ═══════ 1. DNA Card Hero ═══════ */}
      <DNACard
        attributes={footballAttributes}
        overallRating={card.overallRating}
        position={FOOTBALL_POSITION_LABELS[card.position]}
        cardTier={cardTier}
        sport="football"
        pathwayRating={card.footballRating}
        pathwayLevel={card.footballLevel}
        onAttributeTap={(key) =>
          setSelectedAttr(key === selectedAttr ? null : (key as FootballAttribute))
        }
        trigger={isFocused}
      />

      {/* Attribute Detail (expandable) */}
      {selectedAttr && (
        <FootballAttributeDetailSheet
          attribute={selectedAttr}
          data={card.attributes[selectedAttr]}
          player={player}
          history={history}
          onClose={() => setSelectedAttr(null)}
        />
      )}

      {/* ═══════ 2. Attribute Trends ═══════ */}
      <Animated.View style={entrance1}>
        <GlassCard style={s.sectionCard}>
          <Text style={s.sectionTitle}>Attribute Trends</Text>
          <Text style={s.sectionSubtitle}>30-day progression</Text>

          {attributeTrends.map((trend) => {
            const attrColor = FOOTBALL_ATTRIBUTE_COLORS[trend.attr];
            const sparkPath = buildSparklinePath(trend.points, 60, 20);
            return (
              <View key={trend.attr} style={s.trendRow}>
                <View style={[s.trendDot, { backgroundColor: attrColor }]} />
                <Text style={s.trendLabel}>
                  {FOOTBALL_ATTRIBUTE_LABELS[trend.attr]}
                </Text>
                <Text style={[s.trendScore, { color: attrColor }]}>
                  {trend.current}
                </Text>

                {/* Mini sparkline */}
                {sparkPath.length > 0 && (
                  <View style={s.sparkContainer}>
                    <Svg width={60} height={20}>
                      <Polyline
                        points={sparkPath}
                        fill="none"
                        stroke={attrColor}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </View>
                )}

                {/* Growth text */}
                <Text
                  numberOfLines={1}
                  style={[
                    s.trendDelta,
                    {
                      color:
                        trend.delta > 0
                          ? '#30D158'
                          : trend.delta < 0
                            ? attrColor
                            : colors.textInactive,
                    },
                  ]}
                >
                  {trend.delta > 0
                    ? `+${trend.delta}`
                    : trend.delta < 0
                      ? 'Refocusing'
                      : 'Steady'}
                </Text>
              </View>
            );
          })}
        </GlassCard>
      </Animated.View>

      {/* ═══════ 3. Skill Mastery ═══════ */}
      <Animated.View style={entrance2}>
        <GlassCard style={s.sectionCard}>
          <View style={s.skillHeader}>
            <Text style={s.sectionTitle}>Skill Mastery</Text>
            <View style={s.skillCountBadge}>
              <Text style={s.skillCountText}>
                {sortedSkills.filter((sk) => sk.overall >= 70).length}/8 Strong
              </Text>
            </View>
          </View>

          {/* Summary row */}
          <View style={s.summaryRow}>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Overall</Text>
              <Text style={s.summaryValue}>{skillsAvg}</Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Strongest</Text>
              <Text style={[s.summaryValue, { color: '#30D158' }]} numberOfLines={1}>
                {strongestSkill.name}
              </Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Focus On</Text>
              <Text style={[s.summaryValue, { color: '#00D9FF' }]} numberOfLines={1}>
                {focusSkill.name}
              </Text>
            </View>
          </View>

          {sortedSkills.map((skill, i) => (
            <SkillRatingBar
              key={skill.key}
              skill={skill}
              sport="football"
              index={i}
              trigger={isFocused}
            />
          ))}
        </GlassCard>
      </Animated.View>

      {/* ═══════ 4. Rating Pathway (tappable → FootballRatingScreen) ═══════ */}
      <Animated.View style={entrance3}>
        <GlassCard style={s.sectionCard}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate('FootballRating');
            }}
            style={({ pressed }) => [
              pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
            ]}
          >
            <Text style={s.sectionTitle}>Football Rating</Text>
            <RatingPathway
              currentRating={card.footballRating}
              currentLevel={currentLevel}
              allLevels={pathwayLevels}
              sport="football"
              compact
              index={3}
              trigger={isFocused}
            />
            <View style={s.tapHint}>
              <Text style={s.tapHintText}>Tap to explore levels</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </Pressable>
        </GlassCard>
      </Animated.View>

      {/* ═══════ 5. Cross-Training Impact ═══════ */}
      <Animated.View style={entrance4}>
        <CrossTrainingModule isFocused={isFocused} />
      </Animated.View>

      {/* ═══════ 6. Streak Tracker ═══════ */}
      <Animated.View style={entrance5}>
        <GlassCard style={s.sectionCard}>
          <View style={s.streakRow}>
            <View style={s.ringContainer}>
              <StreakProgressRing
                progress={streakProgress}
                size={80}
                strokeWidth={6}
                colors={colors}
              />
              <View style={s.ringCenter}>
                <Ionicons name="flame" size={22} color={colors.accent1} />
              </View>
            </View>
            <View style={s.streakInfo}>
              <Text style={s.streakCount}>{streak}</Text>
              <Text style={s.streakLabel}>Day Streak</Text>
              {nextMilestone && (
                <Text style={s.streakMilestone}>
                  {streak}/{nextMilestone.target} to {nextMilestone.name}
                </Text>
              )}
            </View>
          </View>
        </GlassCard>
      </Animated.View>

      {/* ═══════ 7. Sleep Recovery ═══════ */}
      <Animated.View style={entrance6}>
        <GlassCard style={s.sectionCard}>
          <View style={s.sleepRow}>
            <View style={s.sleepIconWrap}>
              <Ionicons name="bed-outline" size={22} color={colors.accent2} />
            </View>
            <View style={s.sleepInfo}>
              <Text style={s.sleepTitle}>Sleep Recovery</Text>
              <Text style={s.sleepHours}>
                {latestSleep !== null ? `${latestSleep} hrs` : '--'}
              </Text>
              <Text
                style={[
                  s.sleepSubtitle,
                  {
                    color:
                      latestSleep === null
                        ? colors.textMuted
                        : sleepOptimal
                          ? colors.readinessGreen
                          : colors.readinessYellow,
                  },
                ]}
              >
                {latestSleep === null
                  ? 'No data yet'
                  : sleepOptimal
                    ? 'Optimal Recovery'
                    : latestSleep >= 6
                      ? 'Moderate Recovery'
                      : 'Low Recovery'}
              </Text>
            </View>
          </View>
        </GlassCard>
      </Animated.View>

      {/* ═══════ 8. View Full Football Profile ═══════ */}
      <Animated.View style={entrance7}>
        <GradientButton
          title="View Full Football Profile"
          onPress={() => navigation.navigate('FootballRating')}
          icon="trophy-outline"
        />
      </Animated.View>
    </>
  );
}

// ═══ STYLES ═══

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sectionCard: {
      marginBottom: 16,
    },
    sectionTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.textOnDark,
      marginBottom: spacing.xs,
    },
    sectionSubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
      marginBottom: spacing.md,
    },

    // ── Tap Hint ──
    tapHint: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    tapHintText: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textMuted,
    },

    // ── Attribute Trends ──
    trendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      gap: 8,
    },
    trendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    trendLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      color: colors.textOnDark,
      width: 32,
    },
    trendScore: {
      fontFamily: fontFamily.bold,
      fontSize: 14,
      width: 28,
      textAlign: 'right',
    },
    sparkContainer: {
      marginLeft: 4,
    },
    trendDelta: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      marginLeft: 'auto',
      maxWidth: 70,
    },

    // ── Skill Mastery ──
    skillHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    skillCountBadge: {
      backgroundColor: 'rgba(48, 209, 88, 0.15)',
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 10,
    },
    skillCountText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 11,
      color: '#30D158',
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    summaryItem: {
      alignItems: 'center',
    },
    summaryLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
      marginBottom: 2,
    },
    summaryValue: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.textOnDark,
    },

    // ── Streak ──
    streakRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 20,
    },
    ringContainer: {
      position: 'relative',
      width: 80,
      height: 80,
      justifyContent: 'center',
      alignItems: 'center',
    },
    ringCenter: {
      position: 'absolute',
      justifyContent: 'center',
      alignItems: 'center',
    },
    streakInfo: {
      flex: 1,
    },
    streakCount: {
      fontFamily: fontFamily.semiBold,
      fontSize: 28,
      lineHeight: 34,
      color: colors.textOnDark,
    },
    streakLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.textMuted,
      marginTop: 2,
    },
    streakMilestone: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.accent1,
      marginTop: 4,
    },

    // ── Sleep ──
    sleepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    sleepIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(0, 217, 255, 0.15)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    sleepInfo: {
      flex: 1,
    },
    sleepTitle: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textMuted,
    },
    sleepHours: {
      fontFamily: fontFamily.semiBold,
      fontSize: 28,
      lineHeight: 34,
      color: colors.textOnDark,
      marginTop: 2,
    },
    sleepSubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      marginTop: 4,
    },
  });
}
