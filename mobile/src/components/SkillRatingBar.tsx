/**
 * SkillRatingBar — Sport-agnostic horizontal bar for skill/shot ratings.
 *
 * Serves both football skills (Free Kicks, Headers, Tackling, etc.) and
 * padel shots (Bandeja, Vibora, Smash, etc.) with identical visual treatment.
 *
 * Psychology (Presenting Improvement Areas — Research Section 15.3):
 * - Skills below 40: labeled "Next Level" in teal (#00D9FF), NEVER "Weak" or red
 * - Skills 40-69: labeled "Building" in neutral
 * - Skills 70+: labeled "Strong" in green (#30D158)
 * - Each skill shows social persuasion message (Bandura):
 *   "Players who train [skill] 3x/week improve by [X] points in 6 weeks"
 * - Expanding a sub-metric shows mini trend context if history exists
 *
 * Growth Mindset: no ceiling labels, no "max" indicators.
 * All language is forward-looking and encouraging.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useBarFill, useSpringEntrance } from '../hooks/useAnimations';
import { fontFamily, borderRadius, spacing } from '../theme';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ═══ TYPES ═══

/** A single sub-metric within a skill (e.g., "Power" at 72 km/h) */
export interface SkillSubMetric {
  /** Display name (e.g., "Power", "Distance", "Slalom Time") */
  name: string;
  /** Current value (0-99 normalized score, or raw value for display) */
  value: number;
  /** Unit string for display (e.g., "km/h", "m", "pts/10") */
  unit?: string;
}

/** A complete skill/shot with overall rating and sub-metrics breakdown */
export interface SkillItem {
  /** Unique key for list rendering (e.g., 'free_kicks', 'bandeja') */
  key: string;
  /** Display name (e.g., "Free Kicks", "Bandeja") */
  name: string;
  /** Overall skill rating (0-99) */
  overall: number;
  /** Breakdown into 3 sub-metrics */
  subMetrics: SkillSubMetric[];
  /** Optional Ionicon name */
  icon?: string;
  /** Category grouping (e.g., "Set Piece", "Defensive") */
  category?: string;
  /** Change from last period (e.g., +3, -1) */
  trend?: number;
}

export interface SkillRatingBarProps {
  /** The skill/shot to display */
  skill: SkillItem;
  /** Which sport — controls the accent gradient */
  sport: 'football' | 'padel';
  /** Index for staggered entrance animation */
  index: number;
  /** Called when the skill bar is pressed (before expand) */
  onPress?: () => void;
  /** Animation trigger — re-fires entrance when toggled */
  trigger?: boolean;
}

// ═══ RATING LABELS ═══
// Research Section 15.3: Growth-oriented language, never "Weak" or red

function getSkillLabel(rating: number): { text: string; color: string } {
  if (rating >= 70) return { text: 'Strong', color: '#30D158' };
  if (rating >= 40) return { text: 'Building', color: '#B0B0B0' };
  return { text: 'Next Level', color: '#00D9FF' };
}

/**
 * Get the fill color for a given skill rating.
 * Uses growth-oriented colors: teal for low (opportunity),
 * neutral for mid, green for high.
 */
function getSkillColor(rating: number): string {
  if (rating >= 70) return '#30D158';
  if (rating >= 50) return '#FFD60A';
  if (rating >= 40) return '#FF9500';
  return '#00D9FF'; // teal for "Next Level" — NOT red
}

/**
 * Personalized advice based on rating tier + weakest sub-metric.
 * Growth-oriented, forward-looking language (Research Section 15.3).
 */

type TipMap = Record<string, Record<string, string>>;

const SKILL_TIPS: TipMap = {
  'Free Kicks': {
    Power: 'Focus on hip rotation and follow-through to add pace to your strikes',
    Distance: 'Practice hitting from further out — start at 20m and push to 30m',
    'Accuracy Drill': 'Pick a corner before your run-up and commit to it every time',
  },
  Penalties: {
    Power: 'Drive through the ball with your laces for more power on penalties',
    'Placement Drill': 'Practice side-netting placement — low corners are hardest to save',
    'Release Time': 'Shorten your run-up to 3 steps for a quicker, more decisive strike',
  },
  Crossing: {
    Distance: 'Work on whipping the ball with the inside of your foot for more range',
    'Accuracy Drill': 'Aim for the space between the keeper and defender, not a player',
    'Delivery Speed': 'Hit driven crosses low and hard to beat the first defender',
  },
  Headers: {
    'Jump Height': 'Add box jumps and squat jumps to your routine for higher leaps',
    Distance: 'Use your neck muscles to snap through the ball for more distance',
    'Accuracy Drill': 'Practice heading from crosses — timing your run is everything',
  },
  Tackling: {
    'Recovery Sprint': 'Sprint recovery drills: turn and chase from a standing start',
    'Lateral Speed': 'Ladder drills and side shuffles will sharpen your lateral movement',
    '1v1 Drill Score': 'Stay on your feet and jockey — patience wins 1v1 duels',
  },
  'Long Balls': {
    Distance: 'Strike underneath the ball with your laces to get more height and range',
    'Hang Time': 'Lean back slightly and follow through high for better hang time',
    'Accuracy Drill': 'Pick a 5m target zone and aim to land 7/10 passes inside it',
  },
  'Dribble Moves': {
    'Slalom Time': 'Keep the ball close with small touches through the cones',
    'Cone Drill Time': 'Use both feet equally — it doubles your unpredictability',
    Juggling: 'Start with thigh-foot combos to build rhythm before going feet-only',
  },
  'First Touch': {
    'Control Drill': 'Cushion the ball by withdrawing your foot on contact',
    'Reaction Time': 'Face a wall and react to random bounces to sharpen reflexes',
    'Pass Speed After Touch': 'Practice one-touch passing drills to speed up your release',
  },
};

function getPersonalizedAdvice(skill: SkillItem): string {
  // Find weakest sub-metric
  const weakest = skill.subMetrics.reduce((min, sm) =>
    sm.value < min.value ? sm : min,
    skill.subMetrics[0],
  );

  // Try skill-specific tip for the weak area
  const skillTips = SKILL_TIPS[skill.name];
  const specificTip = skillTips?.[weakest.name];

  if (skill.overall >= 70) {
    // Strong — refinement advice
    return specificTip
      ? `Strong foundation! ${specificTip} for even more consistency`
      : `Great work — keep training ${skill.name} to stay sharp and consistent`;
  }
  if (skill.overall >= 60) {
    // Almost strong — push to break 70
    return specificTip
      ? `Almost there! ${specificTip} to push past 70`
      : `You're close to Strong — focus on ${weakest.name} to break through`;
  }
  if (skill.overall >= 40) {
    // Building — drill suggestion for weak area
    return specificTip
      ? `Building well! ${specificTip}`
      : `Keep building — targeted ${weakest.name} drills will level you up`;
  }
  // Next Level (< 40) — encouraging starter tip
  return specificTip
    ? `Great starting point! ${specificTip}`
    : `Every pro started here — work on ${weakest.name} and you'll see quick gains`;
}

// ═══ COMPONENT ═══

export function SkillRatingBar({
  skill,
  sport,
  index,
  onPress,
  trigger,
}: SkillRatingBarProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);

  const entranceStyle = useSpringEntrance(index, 100, trigger);
  const barWidth = useBarFill(skill.overall, 200 + index * 80, trigger);
  const skillColor = getSkillColor(skill.overall);
  const label = getSkillLabel(skill.overall);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%`,
  }));

  const handlePress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
    onPress?.();
  }, [onPress]);

  const trend = skill.trend ?? 0;

  return (
    <Animated.View style={entranceStyle}>
      <Pressable onPress={handlePress} style={styles.container}>
        {/* Header row: name + rating */}
        <View style={styles.labelRow}>
          <View style={styles.nameRow}>
            {skill.icon && (
              <Ionicons name={skill.icon as any} size={16} color={skillColor} />
            )}
            <Text style={styles.name}>{skill.name}</Text>
            <View style={[styles.levelBadge, { backgroundColor: `${label.color}20` }]}>
              <Text style={[styles.levelText, { color: label.color }]}>{label.text}</Text>
            </View>
          </View>
          <View style={styles.ratingRow}>
            <Text style={[styles.rating, { color: skillColor }]}>{skill.overall}</Text>
            {trend !== 0 && (
              <View style={styles.trendRow}>
                <Ionicons
                  name={trend > 0 ? 'caret-up' : 'caret-down'}
                  size={10}
                  color={trend > 0 ? '#30D158' : '#8E8E93'}
                />
                <Text
                  style={[
                    styles.trendText,
                    { color: trend > 0 ? '#30D158' : '#8E8E93' },
                  ]}
                >
                  {Math.abs(trend)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Bar track */}
        <View style={styles.barTrack}>
          <Animated.View
            style={[
              styles.barFill,
              { backgroundColor: skillColor },
              barStyle,
            ]}
          />
        </View>

        {/* Expand indicator */}
        <View style={styles.expandRow}>
          <Text style={styles.expandHint}>
            {expanded ? 'Tap to collapse' : 'Tap to see breakdown'}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textInactive}
          />
        </View>

        {/* Expanded sub-metrics breakdown */}
        {expanded && (
          <View style={styles.subMetricsContainer}>
            {skill.subMetrics.map((sm) => (
              <SubMetricRow
                key={sm.name}
                subMetric={sm}
                colors={colors}
                styles={styles}
              />
            ))}

            {/* Personalized advice based on rating + weak area */}
            <Text style={styles.improvementMessage}>
              {getPersonalizedAdvice(skill)}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ═══ SUB-METRIC ROW ═══

function SubMetricRow({
  subMetric,
  colors,
  styles,
}: {
  subMetric: SkillSubMetric;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  // Normalize to 0-1: values ≤10 treated as /10 scale, >10 as /99
  const maxVal = subMetric.value > 10 ? 99 : 10;
  const fillPct = Math.min(subMetric.value / maxVal, 1) * 100;
  const barColor = fillPct >= 70 ? '#30D158' : fillPct >= 40 ? '#FFD60A' : '#00D9FF';

  return (
    <View style={styles.subMetricRow}>
      <Text style={styles.subMetricName} numberOfLines={1}>{subMetric.name}</Text>
      <View style={styles.subMetricBarTrack}>
        <View style={[styles.subMetricBarFill, { width: `${fillPct}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={styles.subMetricValue}>
        {subMetric.value}
        {subMetric.unit ? ` ${subMetric.unit}` : ''}
      </Text>
    </View>
  );
}

// ═══ STYLES ═══

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingVertical: spacing.sm,
    },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    name: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textOnDark,
    },
    levelBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
    },
    levelText: {
      fontFamily: fontFamily.medium,
      fontSize: 9,
      letterSpacing: 0.5,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    rating: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
    },
    trendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 1,
    },
    trendText: {
      fontFamily: fontFamily.medium,
      fontSize: 10,
    },
    barTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.glass,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      borderRadius: 3,
    },
    expandRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    expandHint: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      color: colors.textInactive,
    },
    subMetricsContainer: {
      marginTop: spacing.sm,
      backgroundColor: colors.glass,
      borderRadius: borderRadius.sm,
      padding: spacing.compact,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    subMetricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      gap: 8,
    },
    subMetricName: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textOnDark,
      width: 90,
    },
    subMetricBarTrack: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.glass,
      overflow: 'hidden',
    },
    subMetricBarFill: {
      height: '100%',
      borderRadius: 2,
    },
    subMetricValue: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.textOnDark,
      width: 30,
      textAlign: 'right',
    },
    improvementMessage: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
      marginTop: spacing.sm,
      fontStyle: 'italic',
      textAlign: 'center',
    },
  });
}
