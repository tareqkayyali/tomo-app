/**
 * FootballSkillDetailScreen — Deep analysis of one football skill.
 *
 * Shows when user taps a skill from the football progress screen.
 * Provides sub-metric breakdown, 30-day trend chart, training
 * recommendations, and research context.
 *
 * Psychology:
 * - Weakest sub-metric framed as "Your growth edge" (Dweck)
 * - Mastery experiences: "You've improved X points since tracking"
 * - Vicarious experience: "Players at your level who focused on
 *   [sub-metric] saw an average improvement of Y in 8 weeks"
 * - Growth-oriented labels: Strong / Building / Next Level (never "Weak")
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path, Circle as SvgCircle, Polyline } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSpringEntrance, useBarFill } from '../../hooks/useAnimations';
import { useTheme } from '../../hooks/useTheme';
import { GlassCard } from '../../components/GlassCard';
import type { FootballSkill } from '../../types/football';
import { useAuth } from '../../hooks/useAuth';
import { useSportContext } from '../../hooks/useSportContext';
import { fontFamily, borderRadius, spacing } from '../../theme';
import type { ThemeColors } from '../../theme/colors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ═══ TYPES ═══

type Props = NativeStackScreenProps<MainStackParamList, 'FootballSkillDetail'>;

// ═══ CONSTANTS ═══

/** Growth-oriented skill tier labels — never "Weak" or red */
function getSkillTier(rating: number): { text: string; color: string } {
  if (rating >= 70) return { text: 'Strong', color: colors.accent };
  if (rating >= 40) return { text: 'Building', color: colors.textSecondary };
  return { text: 'Next Level', color: colors.info };
}

/** Bar fill color matching SkillRatingBar pattern */
function getBarColor(pct: number): string {
  if (pct >= 70) return colors.accent;
  if (pct >= 50) return colors.warning;
  if (pct >= 40) return colors.warning;
  return colors.info;
}

// ═══ RESEARCH CONTEXT ═══
// Age-specific developmental context (Research Sections 6.1-6.6, Moran et al. 2024, PLOS One 2025)

interface ResearchContext {
  ageRange: [number, number];
  general: string;
  skillSpecific: Partial<Record<FootballSkill, string>>;
}

const RESEARCH_CONTEXTS: ResearchContext[] = [
  {
    ageRange: [13, 14],
    general: 'At your age, neural pathways for motor skills are in the rapid development phase. Consistent practice now builds foundations that compound for years.',
    skillSpecific: {
      dribble_moves: 'Agility and ball control are in the rapid differentiation phase. Elite academy players at U14 show significantly faster slalom dribble times (under 13.0s) than sub-elite peers — this is one of the earliest physical skills to separate elite from average players (Moran et al., 2024).',
      free_kicks: 'Free kick technique is highly trainable at your age. Shot power typically increases from 60 to 78 km/h between ages 13-15 as lower-body strength develops rapidly.',
      headers: 'Heading ability is closely linked to jump height, which gains 3-5cm per year at your age. Focus on vertical jump training alongside heading drills.',
      first_touch: 'First touch control improves most rapidly during early adolescence. Regular wall-pass drills (10 min/day) build the neural pathways faster than any other training method.',
      tackling: 'Defensive agility — especially lateral movement speed — is one of the earliest physical markers to differentiate elite from sub-elite U14 players (Research Section 6.3).',
      crossing: 'Cross delivery distance improves significantly during the 13-15 age window as kicking mechanics mature. Focus on technique over power at this stage.',
      penalties: 'Penalty technique is highly trainable regardless of physical development. Mental rehearsal and target practice are the most effective training methods at any age.',
      long_balls: 'Long ball range increases with lower-body strength development. At your age, distance gains of 8-12m over the next 2 years are typical.',
    },
  },
  {
    ageRange: [15, 16],
    general: 'You\'re in the acceleration phase — sprint speed, passing power, and strength are all gaining rapidly. Training consistency now produces the steepest improvement curves.',
    skillSpecific: {
      dribble_moves: 'Slalom dribble times typically drop 1.5-2.0s between ages 14-17. You\'re in the steepest improvement window for close ball control.',
      free_kicks: 'Shot power gains accelerate at this age (78→92 km/h average). Combining power training with accuracy drills produces the fastest improvement.',
      headers: 'Jump height gains of 4-6cm per year are typical. Plyometric training combined with heading drills produces the best results.',
      first_touch: 'At U16, ball control speed becomes more important than raw technique. Focus on reducing your reaction time and increasing pass speed after receiving.',
      tackling: 'Recovery sprint speed improves approximately 15% from U14 to U17 (Research Section 6.1). Defensive drills should combine sprint and lateral movement.',
      crossing: 'Cross delivery speed and accuracy improve significantly at this age. Begin practicing crosses from varied positions and under defensive pressure.',
      penalties: 'At this age, penalty training should shift from pure accuracy to performing under pressure. Simulated game-pressure drills build mental resilience.',
      long_balls: 'Long pass distance gains are significant — from 40m average to 48m. Focus on both power and accuracy, practicing with both feet.',
    },
  },
  {
    ageRange: [17, 18],
    general: 'At U18, near-professional technique is expected. Physical maturation is nearly complete — focus shifts to refinement, decision-making speed, and consistency under pressure.',
    skillSpecific: {
      dribble_moves: 'Close control should be automatic by U18. Training should focus on executing under defensive pressure and in tight spaces — replicating match conditions.',
      free_kicks: 'Shot power approaches professional levels (100+ km/h). The differentiator at this stage is accuracy and the ability to vary technique (knuckleball, dip, curl).',
      headers: 'Jump height stabilizes near adult levels. Focus on timing, positioning, and directing headers accurately — the physical base is largely in place.',
      first_touch: 'At U18, reaction time and first-touch control speed become more important than raw technique. Focus on reducing your reaction time and increasing pass speed after touch — this is the #1 physical differentiator at your development stage (PLOS One, 2025).',
      tackling: 'Defensive technique should be refined and consistent. Focus on reading the game — anticipation reduces the need for recovery sprints.',
      crossing: 'Cross delivery at U18 should approach professional accuracy. Begin training weighted crosses (low, driven, lofted) from both flanks.',
      penalties: 'Elite penalty conversion rates require consistent technique under maximal pressure. Video analysis of your own technique is highly effective at this stage.',
      long_balls: 'Long ball accuracy matters more than distance at this stage. Practice hitting specific target zones consistently from 40+ meters.',
    },
  },
  {
    ageRange: [19, 23],
    general: 'Physical maturation is largely complete. Improvement comes from refined technique, tactical intelligence, and maintaining consistency across matches and seasons.',
    skillSpecific: {
      dribble_moves: 'At this stage, dribbling improvement comes from game intelligence — knowing when and where to dribble, not just how. Match analysis combined with practice is most effective.',
      free_kicks: 'Professional-level shot power and technique. The differentiator is now set-piece strategy and the ability to score from varied distances and angles.',
      headers: 'Header performance is primarily about positioning and timing at this level. Strength maintenance and jump training preserve your aerial ability.',
      first_touch: 'First touch at senior level is about speed of thought — receiving under pressure and releasing quickly. Training should simulate match tempo and defensive pressure.',
      tackling: 'Defensive excellence at this level combines physical ability with reading the game. Video analysis and tactical training complement physical drills.',
      crossing: 'Crossing at senior level is about variety and match context — not just technique. Train weighted deliveries for specific attacking runs and set-piece routines.',
      penalties: 'At the highest level, penalty taking is as much psychological as technical. Develop a pre-kick routine and practice maintaining composure under pressure.',
      long_balls: 'Long ball mastery at senior level means consistent accuracy and intelligent distribution. Study the passing patterns of elite playmakers.',
    },
  },
];

function getResearchContext(age: number, skill: FootballSkill): { general: string; specific: string } {
  const ctx = RESEARCH_CONTEXTS.find(
    (r) => age >= r.ageRange[0] && age <= r.ageRange[1],
  ) ?? RESEARCH_CONTEXTS[RESEARCH_CONTEXTS.length - 1];
  return {
    general: ctx.general,
    specific: ctx.skillSpecific[skill] ?? ctx.general,
  };
}

// ═══ TRAINING RECOMMENDATIONS ═══

function getTrainingRecommendations(
  skillKey: FootballSkill,
  weakestSubMetricLabel: string,
): string[] {
  const base = [
    `Your ${weakestSubMetricLabel.toLowerCase()} is your biggest growth edge. Players at your level who focused on this saw an average improvement of 8-12 points in 8 weeks.`,
    `Practice 3x per week with targeted drills. Consistency beats intensity — 15 focused minutes is better than an unfocused hour.`,
    `Track your progress after each session. Seeing improvement builds confidence and motivation (Bandura, Self-Efficacy Theory).`,
  ];
  return base;
}

// ═══ SUB-COMPONENTS ═══

function SubMetricBar({
  label,
  value,
  unit,
  description,
  index,
  colors,
}: {
  label: string;
  value: number;
  unit: string;
  description: string;
  index: number;
  colors: ThemeColors;
}) {
  // Normalize value to percentage (skill sub-metrics are raw values, use heuristic)
  const pct = Math.min(value * 10, 100); // rough normalization for display
  const barColor = getBarColor(pct);
  const fillWidth = useBarFill(pct, 200 + index * 100);
  const barStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value}%`,
  }));

  return (
    <View style={subStyles.container}>
      <View style={subStyles.header}>
        <Text style={[subStyles.label, { color: colors.textOnDark }]}>{label}</Text>
        <Text style={[subStyles.value, { color: barColor }]}>
          {value} {unit}
        </Text>
      </View>
      <View style={[subStyles.track, { backgroundColor: colors.glass }]}>
        <Animated.View style={[subStyles.fill, { backgroundColor: barColor }, barStyle]} />
      </View>
      <Text style={[subStyles.description, { color: colors.textInactive }]}>
        {description}
      </Text>
    </View>
  );
}

const subStyles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
  value: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  description: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
  },
});

function MiniLineChart({
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

  // Highlight improvement: color the line green if overall trend is up
  const overallTrend = data[data.length - 1].rating - data[0].rating;
  const lineColor = overallTrend > 0 ? colors.accent : colors.accent2;

  return (
    <Svg width={width} height={height}>
      <Path d={pathD} stroke={lineColor} strokeWidth={2} fill="none" />
      {points.map((p, i) => (
        <SvgCircle
          key={i}
          cx={p.x}
          cy={p.y}
          r={3}
          fill={lineColor}
          stroke={colors.background}
          strokeWidth={1.5}
        />
      ))}
    </Svg>
  );
}

// ═══ MAIN COMPONENT ═══

export function FootballSkillDetailScreen({ route }: Props) {
  const { skill: skillParam } = route.params;
  const skillKey = skillParam as FootballSkill;
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { sportConfig } = useSportContext();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [researchExpanded, setResearchExpanded] = useState(false);

  // ── Data ──
  const age = (profile as any)?.age ?? 16;

  // Look up skill config from sportConfig (content-driven)
  const config = sportConfig.fullSkills.find(s => s.key === skillKey);

  // No real skills data yet — show empty state
  // Skills require a dedicated self-assessment or coach-input flow (not yet built)
  // TODO: Wire to real data when skill rating persistence is built
  const skillData = null as { rating: number; subMetrics: Record<string, number>; trend: number; sessionsLogged: number; history: { date: string; rating: number }[] } | null;

  if (!skillData || !config) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Ionicons name="analytics-outline" size={48} color={colors.textMuted} />
        <Text style={{ fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textOnDark, textAlign: 'center', marginTop: 16 }}>
          Skill Detail Coming Soon
        </Text>
        <Text style={{ fontFamily: fontFamily.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
          Complete more training sessions and fitness tests to unlock detailed skill analysis.
        </Text>
      </View>
    );
  }

  // ── Derived ──
  const tier = getSkillTier(skillData.rating);
  const research = getResearchContext(age, skillKey);

  // Find weakest sub-metric for training recommendations
  const subMetricEntries = config.subMetrics.map((sm) => ({
    ...sm,
    value: skillData.subMetrics[sm.key] ?? 0,
  }));
  const weakestSub = [...subMetricEntries].sort((a, b) => a.value - b.value)[0];

  // Mastery experience: total improvement since tracking started
  const historyPoints = skillData.history;
  const totalImprovement =
    historyPoints.length >= 2
      ? historyPoints[historyPoints.length - 1].rating - historyPoints[0].rating
      : 0;

  const recommendations = getTrainingRecommendations(skillKey, weakestSub.label);

  // ── Animations ──
  const entrance0 = useSpringEntrance(0);
  const entrance1 = useSpringEntrance(1);
  const entrance2 = useSpringEntrance(2);
  const entrance3 = useSpringEntrance(3);
  const entrance4 = useSpringEntrance(4);

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ═══════ 1. Skill Header ═══════ */}
      <Animated.View style={entrance0}>
        <GlassCard>
          <View style={s.heroHeader}>
            <View style={s.heroLeft}>
              {config.icon && (
                <Ionicons name={config.icon as any} size={24} color={tier.color} />
              )}
              <View>
                <Text style={s.heroName}>{config.name}</Text>
                <Text style={s.heroCategory}>{config.category}</Text>
              </View>
            </View>
            <View style={s.heroRight}>
              <Text style={[s.heroRating, { color: tier.color }]}>
                {skillData.rating}
              </Text>
              <View style={[s.tierBadge, { backgroundColor: `${tier.color}20` }]}>
                <Text style={[s.tierText, { color: tier.color }]}>{tier.text}</Text>
              </View>
            </View>
          </View>

          <Text style={s.heroDesc}>{config.description}</Text>

          {/* Trend + sessions */}
          <View style={s.heroMeta}>
            {skillData.trend !== 0 && (
              <View style={s.trendBadge}>
                <Ionicons
                  name={skillData.trend > 0 ? 'trending-up' : 'trending-down'}
                  size={14}
                  color={skillData.trend > 0 ? colors.accent : colors.accent2}
                />
                <Text
                  style={[
                    s.trendText,
                    { color: skillData.trend > 0 ? colors.accent : colors.accent2 },
                  ]}
                >
                  {skillData.trend > 0 ? '+' : ''}{skillData.trend}
                </Text>
              </View>
            )}
            <Text style={s.sessionsText}>
              {skillData.sessionsLogged} sessions logged
            </Text>
          </View>

          {/* Mastery experience (Bandura) */}
          {totalImprovement > 0 && (
            <View style={s.masteryBadge}>
              <Ionicons name="arrow-up-circle" size={14} color={colors.accent} />
              <Text style={s.masteryText}>
                You've improved {config.name} by {totalImprovement} points since you started tracking
              </Text>
            </View>
          )}
        </GlassCard>
      </Animated.View>

      {/* ═══════ 2. Sub-Metrics Breakdown ═══════ */}
      <Animated.View style={entrance1}>
        <GlassCard>
          <Text style={s.sectionTitle}>Sub-Metrics</Text>
          {subMetricEntries.map((sm, i) => (
            <SubMetricBar
              key={sm.key}
              label={sm.label}
              value={sm.value}
              unit={sm.unit}
              description={sm.description}
              index={i}
              colors={colors}
            />
          ))}

          {/* Growth edge callout */}
          <View style={s.growthEdge}>
            <View style={s.growthEdgeHeader}>
              <Ionicons name="sparkles" size={14} color={colors.info} />
              <Text style={s.growthEdgeTitle}>Your Growth Edge</Text>
            </View>
            <Text style={s.growthEdgeText}>
              {weakestSub.label} is your biggest opportunity for improvement.
              Players at your level who focused on this area saw the fastest
              rating gains.
            </Text>
          </View>
        </GlassCard>
      </Animated.View>

      {/* ═══════ 3. Trend Chart ═══════ */}
      <Animated.View style={entrance2}>
        <GlassCard>
          <Text style={s.sectionTitle}>Rating History</Text>
          <MiniLineChart
            data={historyPoints}
            width={300}
            height={120}
            colors={colors}
          />
          <View style={s.chartDates}>
            {historyPoints.length > 0 && (
              <>
                <Text style={s.chartDate}>
                  {historyPoints[0].date}
                </Text>
                <Text style={s.chartDate}>
                  {historyPoints[historyPoints.length - 1].date}
                </Text>
              </>
            )}
          </View>
          {totalImprovement !== 0 && (
            <Text style={s.chartAnnotation}>
              {totalImprovement > 0
                ? `+${totalImprovement} points over this period`
                : 'Refocusing — building back momentum'}
            </Text>
          )}
        </GlassCard>
      </Animated.View>

      {/* ═══════ 4. Training Recommendations ═══════ */}
      <Animated.View style={entrance3}>
        <GlassCard style={s.tipCard}>
          <View style={s.tipHeader}>
            <Ionicons name="bulb" size={18} color={colors.accent1} />
            <Text style={s.tipTitle}>How to Improve</Text>
          </View>

          {recommendations.map((rec, i) => (
            <View key={i} style={s.recRow}>
              <Text style={s.recNumber}>{i + 1}</Text>
              <Text style={s.recText}>{rec}</Text>
            </View>
          ))}

          {/* Drill placeholder */}
          <View style={s.drillPlaceholder}>
            <Ionicons name="football-outline" size={16} color={colors.textInactive} />
            <Text style={s.drillPlaceholderText}>
              Targeted drills coming soon
            </Text>
          </View>
        </GlassCard>
      </Animated.View>

      {/* ═══════ 5. Research Context (collapsible) ═══════ */}
      <Animated.View style={entrance4}>
        <GlassCard>
          <Pressable
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setResearchExpanded((prev) => !prev);
            }}
            style={s.researchHeader}
          >
            <View style={s.researchHeaderLeft}>
              <Ionicons name="school-outline" size={16} color={colors.accent2} />
              <Text style={s.researchHeaderText}>Research Context</Text>
            </View>
            <Ionicons
              name={researchExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textInactive}
            />
          </Pressable>

          {researchExpanded && (
            <View style={s.researchContent}>
              <Text style={s.researchAge}>
                For {age}-year-old footballers:
              </Text>
              <Text style={s.researchText}>{research.specific}</Text>
              <View style={s.researchDivider} />
              <Text style={s.researchGeneral}>{research.general}</Text>
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

    // ── Hero ──
    heroHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: spacing.sm,
    },
    heroLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    heroRight: {
      alignItems: 'flex-end',
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
    heroRating: {
      fontFamily: fontFamily.bold,
      fontSize: 36,
    },
    tierBadge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 8,
      marginTop: 4,
    },
    tierText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 11,
      letterSpacing: 0.5,
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
    trendText: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
    },
    sessionsText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textMuted,
    },
    masteryBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: spacing.sm,
      backgroundColor: 'rgba(48, 209, 88, 0.10)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: borderRadius.sm,
    },
    masteryText: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.accent,
      flex: 1,
    },

    // ── Section ──
    sectionTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.textOnDark,
      marginBottom: spacing.md,
    },

    // ── Growth edge ──
    growthEdge: {
      backgroundColor: 'rgba(0, 217, 255, 0.08)',
      borderRadius: borderRadius.sm,
      padding: spacing.compact,
      borderWidth: 1,
      borderColor: 'rgba(0, 217, 255, 0.15)',
    },
    growthEdgeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    growthEdgeTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      color: colors.info,
    },
    growthEdgeText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
    },

    // ── Chart ──
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
    chartAnnotation: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.accent,
      textAlign: 'center',
      marginTop: spacing.sm,
    },

    // ── Training ──
    tipCard: {
      borderColor: 'rgba(255, 107, 53, 0.2)',
    },
    tipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: spacing.md,
    },
    tipTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.accent1,
    },
    recRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: spacing.sm,
    },
    recNumber: {
      fontFamily: fontFamily.bold,
      fontSize: 14,
      color: colors.accent1,
      width: 18,
    },
    recText: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textOnDark,
      lineHeight: 19,
      flex: 1,
    },
    drillPlaceholder: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    drillPlaceholderText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
      fontStyle: 'italic',
    },

    // ── Research (collapsible) ──
    researchHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    researchHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    researchHeaderText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.accent2,
    },
    researchContent: {
      marginTop: spacing.md,
    },
    researchAge: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.textOnDark,
      marginBottom: spacing.xs,
    },
    researchText: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textOnDark,
      lineHeight: 20,
    },
    researchDivider: {
      height: 1,
      backgroundColor: colors.divider,
      marginVertical: spacing.sm,
    },
    researchGeneral: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
      fontStyle: 'italic',
    },
  });
}
