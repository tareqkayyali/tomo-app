/**
 * FootballRatingScreen — Full football rating detail with pathway,
 * attribute contributions, position fit, and improvement projection.
 *
 * Sections:
 * 1. Overall Rating Hero (large number + tier + position + growth)
 * 2. Rating History Chart (30-day trend line)
 * 3. Rating Pathway (full vertical ladder, all 10 levels)
 * 4. Attribute Contributions (which attributes pull up / hold back)
 * 5. Position Fit Analysis (fit % per position, alternative suggestions)
 * 6. Improvement Projection (trajectory to next level)
 *
 * Psychology:
 * - Self-efficacy (Bandura): "Since joining: +X" reinforces progress
 * - Social persuasion: Pro milestones give "if they did it, I can too"
 * - Growth trajectory: Projection reframes gap as achievable timeline
 * - SDT autonomy: Position suggestions empower player's own identity
 * - Growth language: never "Weak", decline = "Refocusing this area"
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassCard } from '../../components';
import { RatingPathway } from '../../components/RatingPathway';
import type { PathwayLevel } from '../../components/RatingPathway';

import { useSpringEntrance } from '../../hooks/useAnimations';
import { useTheme } from '../../hooks/useTheme';

import { useAuth } from '../../hooks/useAuth';
import { useSportContext } from '../../hooks/useSportContext';
import { useFootballProgress } from '../../hooks/useFootballProgress';
import type { FootballAttribute, FootballPosition } from '../../types/football';

import { fontFamily, spacing, borderRadius } from '../../theme';
import type { ThemeColors } from '../../theme/colors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'FootballRating'>;

// ═══ CONSTANTS ═══

const FOOTBALL_PRO_MILESTONES = [
  { rating: 650, name: 'Academy Standard', reason: 'Academy scouting threshold' },
  { rating: 750, name: 'Semi-Pro Level', reason: 'Semi-professional pathway' },
  { rating: 850, name: 'Professional', reason: 'Full professional standard' },
];

// ═══ HELPERS ═══

function getTierLabel(pathwayRating: number): { label: string; color: string } {
  if (pathwayRating >= 850) return { label: 'Diamond', color: '#B9F2FF' };
  if (pathwayRating >= 650) return { label: 'Gold', color: '#FFD700' };
  if (pathwayRating >= 450) return { label: 'Silver', color: '#C0C0C0' };
  return { label: 'Bronze', color: '#CD7F32' };
}

// ═══ RATING HISTORY CHART ═══

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

  const areaD =
    pathD +
    ` L ${points[points.length - 1].x} ${padding + chartH}` +
    ` L ${points[0].x} ${padding + chartH} Z`;

  return (
    <View>
      <Svg width={width} height={height}>
        <Path d={areaD} fill="rgba(48, 209, 88, 0.1)" />
        <Path d={pathD} stroke="#30D158" strokeWidth={2.5} fill="none" />
        {points.map((p, i) => (
          <SvgCircle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill="#30D158"
            stroke={colors.background}
            strokeWidth={2}
          />
        ))}
      </Svg>
      <View style={chartStyles.chartDates}>
        {data.map((d, i) => (
          <Text key={i} style={[chartStyles.chartDate, { color: colors.textMuted }]}>
            {d.date.slice(5)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  chartDates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  chartDate: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
  },
});

// ═══ ATTRIBUTE CONTRIBUTION BAR ═══

function ContributionBar({
  attribute,
  score,
  weight,
  maxContribution,
  colors,
  attrColor,
  attrFullName,
}: {
  attribute: string;
  score: number;
  weight: number;
  maxContribution: number;
  colors: ThemeColors;
  attrColor: string;
  attrFullName: string;
}) {
  const contribution = score * weight;
  const pct = maxContribution > 0 ? (contribution / maxContribution) * 100 : 0;
  const isStrong = pct >= 80;

  return (
    <View style={contribStyles.row}>
      <View style={contribStyles.labelWrap}>
        <View style={[contribStyles.dot, { backgroundColor: attrColor }]} />
        <Text style={[contribStyles.label, { color: colors.textOnDark }]}>
          {attrFullName}
        </Text>
      </View>
      <View style={contribStyles.barTrack}>
        <View
          style={[
            contribStyles.barFill,
            { width: `${Math.min(pct, 100)}%`, backgroundColor: attrColor },
          ]}
        />
      </View>
      <View style={contribStyles.valueWrap}>
        <Text style={[contribStyles.score, { color: attrColor }]}>
          {score}
        </Text>
        <Text style={[contribStyles.weight, { color: colors.textMuted }]}>
          x{(weight * 100).toFixed(0)}%
        </Text>
      </View>
      {isStrong && (
        <Ionicons name="arrow-up" size={12} color="#30D158" style={contribStyles.arrow} />
      )}
    </View>
  );
}

const contribStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  labelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 100,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  valueWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    width: 54,
    gap: 2,
  },
  score: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
  },
  weight: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
  },
  arrow: {
    marginLeft: 2,
  },
});

// ═══ POSITION FIT CARD ═══

function PositionFitRow({
  position,
  positionLabel,
  overall,
  maxOverall,
  isCurrent,
  colors,
}: {
  position: string;
  positionLabel: string;
  overall: number;
  maxOverall: number;
  isCurrent: boolean;
  colors: ThemeColors;
}) {
  const pct = maxOverall > 0 ? (overall / maxOverall) * 100 : 0;
  return (
    <View style={[fitStyles.row, isCurrent && { backgroundColor: 'rgba(48, 209, 88, 0.08)', borderRadius: 8 }]}>
      <View style={fitStyles.posWrap}>
        <Text style={[fitStyles.posLabel, { color: isCurrent ? '#30D158' : colors.textOnDark }]}>
          {position}
        </Text>
        <Text style={[fitStyles.posName, { color: colors.textMuted }]}>
          {positionLabel}
        </Text>
      </View>
      <View style={fitStyles.barTrack}>
        <LinearGradient
          colors={isCurrent ? ['#30D158', '#3498DB'] : [colors.accent1, colors.accent2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[fitStyles.barFill, { width: `${Math.min(pct, 100)}%` }]}
        />
      </View>
      <Text style={[fitStyles.overallText, { color: isCurrent ? '#30D158' : colors.textOnDark }]}>
        {overall}
      </Text>
      {isCurrent && (
        <View style={fitStyles.currentBadge}>
          <Text style={fitStyles.currentText}>Current</Text>
        </View>
      )}
    </View>
  );
}

const fitStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  posWrap: {
    width: 70,
  },
  posLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },
  posName: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    marginTop: 1,
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
  },
  overallText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    width: 30,
    textAlign: 'right',
  },
  currentBadge: {
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  currentText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    color: '#30D158',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

// ═══ MAIN SCREEN ═══

export function FootballRatingScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { sportConfig } = useSportContext();
  const s = useMemo(() => createStyles(colors), [colors]);

  // ── User-aware data loading ──
  const userId = profile?.uid || profile?.id || '';
  const age = (profile as any)?.age ?? 16;
  const position: FootballPosition = (profile as any)?.position || 'CM';
  const { card, isLoading: progressLoading, hasData } = useFootballProgress(userId, age, position);

  if (progressLoading || !hasData || !card) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }} />
    );
  }

  // ── Derived data ──
  const tier = getTierLabel(card.footballRating);
  const positionLabel = sportConfig.positions.find(p => p.key === card.position)?.label ?? card.position;
  const growthSinceJoining = card.history.length >= 2
    ? card.history[card.history.length - 1].rating - card.history[0].rating
    : 0;

  // ── Map rating levels → PathwayLevel[] ──
  const pathwayLevels: PathwayLevel[] = sportConfig.ratingLevels.map((l) => ({
    name: l.name,
    minRating: l.minRating,
    maxRating: l.maxRating,
    description: l.description,
    color: l.color,
  }));
  const currentLevel = pathwayLevels.find(
    (l) => card.footballRating >= l.minRating && card.footballRating <= l.maxRating,
  ) ?? pathwayLevels[0];

  // ── Attribute contributions ──
  const currentPosition = sportConfig.positions.find(p => p.key === card.position);
  const posWeights = currentPosition?.attributeWeights ?? {};
  const attrScores: Record<string, number> = {};
  sportConfig.attributes.forEach((attr) => {
    attrScores[attr.key] = card.attributes[attr.key as keyof typeof card.attributes]?.score ?? 0;
  });

  const contributions = sportConfig.attributes.map((attr) => ({
    attr: attr.key,
    attrColor: attr.color,
    attrFullName: attr.fullName,
    score: attrScores[attr.key],
    weight: posWeights[attr.key] ?? 0,
    contribution: attrScores[attr.key] * (posWeights[attr.key] ?? 0),
  }));
  const maxContribution = Math.max(...contributions.map((c) => c.contribution));

  // Sort by contribution descending (strongest first)
  const sortedContributions = [...contributions].sort(
    (a, b) => b.contribution - a.contribution,
  );

  // ── Position fit analysis ──
  const positionFits = useMemo(() => {
    return sportConfig.positions
      .map((pos) => {
        // Calculate weighted overall for this position
        let totalWeighted = 0;
        let totalWeight = 0;
        Object.entries(pos.attributeWeights).forEach(([attrKey, weight]) => {
          totalWeighted += (attrScores[attrKey] ?? 0) * weight;
          totalWeight += weight;
        });
        const overall = totalWeight > 0 ? Math.round(totalWeighted / totalWeight) : 0;
        return {
          position: pos.key,
          positionLabel: pos.label,
          overall,
          isCurrent: pos.key === card.position,
        };
      })
      .sort((a, b) => b.overall - a.overall);
  }, [attrScores, card.position, sportConfig.positions]);
  const maxOverall = Math.max(...positionFits.map((p) => p.overall));

  // Best alternative (not current)
  const bestAlternative = positionFits.find((p) => !p.isCurrent);

  // ── Improvement projection ──
  const projection = useMemo(() => {
    if (card.history.length < 2 || !card.nextMilestone) return null;

    const oldest = card.history[0];
    const newest = card.history[card.history.length - 1];
    const daySpan = Math.max(
      (new Date(newest.date).getTime() - new Date(oldest.date).getTime()) / (1000 * 60 * 60 * 24),
      1,
    );
    const ratingGain = newest.rating - oldest.rating;
    const dailyRate = ratingGain / daySpan;

    if (dailyRate <= 0) return null;

    const pointsNeeded = card.nextMilestone.pointsNeeded;
    const daysToNext = Math.ceil(pointsNeeded / dailyRate);
    const weeksToNext = Math.ceil(daysToNext / 7);

    return {
      nextLevel: card.nextMilestone.name,
      nextRating: card.nextMilestone.rating,
      pointsNeeded,
      dailyRate,
      weeksToNext,
      daysToNext,
    };
  }, [card.history, card.nextMilestone]);

  // ── Animations ──
  const entrance0 = useSpringEntrance(0);
  const entrance1 = useSpringEntrance(1);
  const entrance2 = useSpringEntrance(2);
  const entrance3 = useSpringEntrance(3);
  const entrance4 = useSpringEntrance(4);
  const entrance5 = useSpringEntrance(5);

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ═══════ 1. Overall Rating Hero ═══════ */}
      <Animated.View style={entrance0}>
        <GlassCard style={s.heroCard}>
          <View style={s.heroTop}>
            <View style={s.heroBadge}>
              <Text style={[s.heroBadgeText, { color: tier.color }]}>{tier.label}</Text>
            </View>
            <View style={s.heroPositionBadge}>
              <Text style={s.heroPositionText}>{card.position}</Text>
            </View>
          </View>

          <Text style={s.heroRating}>{card.footballRating}</Text>
          <Text style={s.heroLevel}>{card.footballLevel}</Text>
          <Text style={s.heroPosition}>{positionLabel}</Text>

          {/* Overall attribute rating */}
          <View style={s.heroOverallRow}>
            <Text style={s.heroOverallLabel}>Overall</Text>
            <Text style={s.heroOverallValue}>{card.overallRating}</Text>
            <Text style={s.heroOverallMax}>/99</Text>
          </View>

          {/* Growth since joining */}
          {growthSinceJoining > 0 && (
            <View style={s.heroGrowthRow}>
              <Ionicons name="trending-up" size={14} color="#30D158" />
              <Text style={s.heroGrowthText}>
                +{growthSinceJoining} rating points this month
              </Text>
            </View>
          )}

          {/* Next milestone */}
          {card.nextMilestone && (
            <View style={s.heroMilestoneRow}>
              <Text style={s.heroMilestoneLabel}>
                Next: {card.nextMilestone.name}
              </Text>
              <View style={s.heroMilestoneTrack}>
                <View
                  style={[
                    s.heroMilestoneFill,
                    {
                      width: `${Math.min(
                        (card.footballRating / card.nextMilestone.rating) * 100,
                        100,
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={s.heroMilestoneGap}>
                {card.nextMilestone.pointsNeeded} pts away
              </Text>
            </View>
          )}
        </GlassCard>
      </Animated.View>

      {/* ═══════ 2. Rating History Chart ═══════ */}
      <Animated.View style={entrance1}>
        <GlassCard>
          <Text style={s.sectionTitle}>Rating Trend</Text>
          <Text style={s.sectionSubtitle}>30-day progression</Text>
          <RatingHistoryChart
            data={card.history}
            width={320}
            height={140}
            colors={colors}
          />
        </GlassCard>
      </Animated.View>

      {/* ═══════ 3. Rating Pathway (Full Ladder) ═══════ */}
      <Animated.View style={entrance2}>
        <GlassCard>
          <Text style={s.sectionTitle}>Rating Pathway</Text>
          <Text style={s.sectionSubtitle}>All 10 levels from Newcomer to Legend</Text>
          <RatingPathway
            currentRating={card.footballRating}
            currentLevel={currentLevel}
            allLevels={pathwayLevels}
            sport="football"
            milestones={FOOTBALL_PRO_MILESTONES}
            compact={false}
            index={2}
          />
        </GlassCard>
      </Animated.View>

      {/* ═══════ 4. Attribute Contributions ═══════ */}
      <Animated.View style={entrance3}>
        <GlassCard>
          <Text style={s.sectionTitle}>Attribute Contributions</Text>
          <Text style={s.sectionSubtitle}>
            How each attribute shapes your {positionLabel} rating
          </Text>

          {sortedContributions.map((c) => (
            <ContributionBar
              key={c.attr}
              attribute={c.attr}
              score={c.score}
              weight={c.weight}
              maxContribution={maxContribution}
              colors={colors}
              attrColor={c.attrColor}
              attrFullName={c.attrFullName}
            />
          ))}

          {/* Summary insight */}
          <View style={s.insightBox}>
            <Ionicons name="bulb-outline" size={16} color={colors.accent2} />
            <Text style={s.insightText}>
              {sortedContributions[0].weight >= 0.25
                ? `As a ${positionLabel}, ${sortedContributions[0].attrFullName} has the biggest impact on your rating (${(sortedContributions[0].weight * 100).toFixed(0)}% weight).`
                : `Your top contributor is ${sortedContributions[0].attrFullName} — focus here for the fastest rating gains.`}
            </Text>
          </View>
        </GlassCard>
      </Animated.View>

      {/* ═══════ 5. Position Fit Analysis ═══════ */}
      <Animated.View style={entrance4}>
        <GlassCard>
          <Text style={s.sectionTitle}>Position Fit</Text>
          <Text style={s.sectionSubtitle}>
            Your attributes across all positions
          </Text>

          {positionFits.map((pf) => (
            <PositionFitRow
              key={pf.position}
              position={pf.position}
              positionLabel={pf.positionLabel}
              overall={pf.overall}
              maxOverall={maxOverall}
              isCurrent={pf.isCurrent}
              colors={colors}
            />
          ))}

          {/* Alternative suggestion */}
          {bestAlternative && bestAlternative.overall > card.overallRating && (
            <View style={s.altSuggestion}>
              <Ionicons name="compass-outline" size={16} color={colors.accent2} />
              <Text style={s.altSuggestionText}>
                Your attributes also suit{' '}
                <Text style={s.altSuggestionHighlight}>
                  {bestAlternative.positionLabel}
                </Text>
                {' '}({bestAlternative.overall} overall) — explore it if you enjoy the role!
              </Text>
            </View>
          )}

          {bestAlternative && bestAlternative.overall <= card.overallRating && (
            <View style={s.altSuggestion}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#30D158" />
              <Text style={s.altSuggestionText}>
                {positionLabel} is your strongest position fit — great match for your attributes!
              </Text>
            </View>
          )}
        </GlassCard>
      </Animated.View>

      {/* ═══════ 6. Improvement Projection ═══════ */}
      <Animated.View style={entrance5}>
        <GlassCard>
          <Text style={s.sectionTitle}>Growth Projection</Text>
          <Text style={s.sectionSubtitle}>
            Based on your recent improvement rate
          </Text>

          {projection ? (
            <View style={s.projectionContent}>
              {/* Trajectory stat */}
              <View style={s.projRow}>
                <View style={s.projStat}>
                  <Text style={s.projValue}>
                    +{(projection.dailyRate * 7).toFixed(1)}
                  </Text>
                  <Text style={s.projLabel}>pts/week</Text>
                </View>
                <View style={s.projDivider} />
                <View style={s.projStat}>
                  <Text style={s.projValue}>{projection.pointsNeeded}</Text>
                  <Text style={s.projLabel}>pts to go</Text>
                </View>
                <View style={s.projDivider} />
                <View style={s.projStat}>
                  <Text style={[s.projValue, { color: '#30D158' }]}>
                    ~{projection.weeksToNext}w
                  </Text>
                  <Text style={s.projLabel}>estimated</Text>
                </View>
              </View>

              {/* Motivational callout */}
              <View style={s.projCallout}>
                <Ionicons name="rocket-outline" size={18} color={colors.accent1} />
                <Text style={s.projCalloutText}>
                  At your current pace, you could reach{' '}
                  <Text style={{ fontFamily: fontFamily.bold, color: colors.accent1 }}>
                    {projection.nextLevel}
                  </Text>
                  {' '}in about {projection.weeksToNext} weeks. Keep training consistently!
                </Text>
              </View>

              {/* Disclaimer */}
              <Text style={s.projDisclaimer}>
                Based on your 30-day trend. Actual progress varies with training consistency, recovery, and development stage.
              </Text>
            </View>
          ) : (
            <View style={s.projEmpty}>
              <Ionicons name="analytics-outline" size={32} color={colors.textMuted} />
              <Text style={s.projEmptyText}>
                Keep training to build your improvement trend. We need a few more sessions to project your trajectory.
              </Text>
            </View>
          )}
        </GlassCard>
      </Animated.View>
    </ScrollView>
  );
}

// ═══ STYLES ═══

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: 40,
      gap: spacing.md,
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

    // ── Hero ──
    heroCard: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    heroTop: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    heroBadge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: 'rgba(255, 215, 0, 0.12)',
    },
    heroBadgeText: {
      fontFamily: fontFamily.bold,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    heroPositionBadge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: 'rgba(0, 217, 255, 0.12)',
    },
    heroPositionText: {
      fontFamily: fontFamily.bold,
      fontSize: 11,
      color: colors.accent2,
      letterSpacing: 1,
    },
    heroRating: {
      fontFamily: fontFamily.bold,
      fontSize: 64,
      color: colors.accent1,
      lineHeight: 70,
    },
    heroLevel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 20,
      color: colors.textOnDark,
      marginTop: 4,
    },
    heroPosition: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textInactive,
      marginTop: 2,
    },
    heroOverallRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginTop: 12,
      gap: 2,
    },
    heroOverallLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
      marginRight: 6,
    },
    heroOverallValue: {
      fontFamily: fontFamily.bold,
      fontSize: 22,
      color: colors.textOnDark,
    },
    heroOverallMax: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textMuted,
    },
    heroGrowthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 8,
    },
    heroGrowthText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: '#30D158',
    },
    heroMilestoneRow: {
      width: '100%',
      marginTop: 16,
      paddingHorizontal: 8,
    },
    heroMilestoneLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      color: colors.textInactive,
      marginBottom: 6,
    },
    heroMilestoneTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.glass,
      overflow: 'hidden',
    },
    heroMilestoneFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: colors.accent1,
    },
    heroMilestoneGap: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.textInactive,
      marginTop: 4,
      textAlign: 'right',
    },

    // ── Insights ──
    insightBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 12,
      padding: 10,
      borderRadius: borderRadius.md,
      backgroundColor: 'rgba(0, 217, 255, 0.08)',
    },
    insightText: {
      flex: 1,
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textOnDark,
      lineHeight: 18,
    },

    // ── Alt position suggestion ──
    altSuggestion: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 12,
      padding: 10,
      borderRadius: borderRadius.md,
      backgroundColor: 'rgba(0, 217, 255, 0.08)',
    },
    altSuggestionText: {
      flex: 1,
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textOnDark,
      lineHeight: 18,
    },
    altSuggestionHighlight: {
      fontFamily: fontFamily.bold,
      color: colors.accent2,
    },

    // ── Projection ──
    projectionContent: {},
    projRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      marginBottom: 16,
    },
    projStat: {
      alignItems: 'center',
    },
    projValue: {
      fontFamily: fontFamily.bold,
      fontSize: 22,
      color: colors.accent1,
    },
    projLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
      marginTop: 2,
    },
    projDivider: {
      width: 1,
      height: 30,
      backgroundColor: colors.divider,
    },
    projCallout: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 12,
      borderRadius: borderRadius.md,
      backgroundColor: 'rgba(255, 107, 53, 0.08)',
    },
    projCalloutText: {
      flex: 1,
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textOnDark,
      lineHeight: 20,
    },
    projDisclaimer: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      color: colors.textMuted,
      marginTop: 10,
      fontStyle: 'italic',
    },
    projEmpty: {
      alignItems: 'center',
      paddingVertical: 20,
      gap: 10,
    },
    projEmptyText: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
}
