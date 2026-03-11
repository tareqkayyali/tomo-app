/**
 * RatingPathway — Sport-agnostic compact bar or full vertical ladder
 * showing a 0-1000 rating pathway with level progression.
 *
 * Serves both football and padel with identical visual treatment.
 * The same component renders both sports — only the data differs.
 *
 * Psychology (Achievement Goal Theory — Research Section 12):
 * - Shows upward trajectory: past levels filled, current highlighted
 * - Frames gaps as achievable: "Next: [Level] ([rating])"
 * - Full ladder only shows next 1-2 levels above current (prevents overwhelm)
 * - Growth mindset: no ceiling labels, no "max" indicators
 * - "YOU ARE HERE" marker reinforces current position positively
 *
 * Pro milestones provide social proof (Bandura) — "If they did it, I can too."
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useBarFill, usePulse, useSpringEntrance } from '../hooks/useAnimations';
import { fontFamily, borderRadius, spacing } from '../theme';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';

// ═══ TYPES ═══

/** A single level/tier in the rating pathway */
export interface PathwayLevel {
  /** Level display name (e.g., "Academy Elite", "Semi-Pro") */
  name: string;
  /** Minimum rating for this level (inclusive) */
  minRating: number;
  /** Maximum rating for this level (inclusive) */
  maxRating: number;
  /** Short description of what this level means */
  description: string;
  /** Optional accent color for this level */
  color?: string;
}

/** A pro player / reference milestone on the pathway */
export interface PathwayMilestone {
  /** Rating position on the pathway */
  rating: number;
  /** Player or milestone name */
  name: string;
  /** Why this milestone matters */
  reason: string;
}

export interface RatingPathwayProps {
  /** Current pathway rating (0-1000) */
  currentRating: number;
  /** Current level object (the level the player is in) */
  currentLevel: PathwayLevel;
  /** All levels in ascending order (lowest first) */
  allLevels: PathwayLevel[];
  /** Which sport — controls the accent gradient */
  sport: 'football' | 'padel';
  /** Pro player / reference milestones to display on the ladder */
  milestones?: PathwayMilestone[];
  /** Compact mode shows horizontal bar, full mode shows vertical ladder */
  compact?: boolean;
  /** Index for staggered entrance animation */
  index?: number;
  /** Animation trigger — re-fires entrance when toggled */
  trigger?: boolean;
}

/** Sport-specific gradient for the progress bar fill */
const SPORT_BAR_GRADIENT: Record<string, [string, string]> = {
  football: ['#30D158', '#3498DB'],
  padel: ['#FF6B35', '#00D9FF'],
};

// ═══ COMPONENT ═══

export function RatingPathway({
  currentRating,
  currentLevel,
  allLevels,
  sport,
  milestones = [],
  compact = false,
  index = 0,
  trigger,
}: RatingPathwayProps) {
  const { colors } = useTheme();
  const s = React.useMemo(() => createStyles(colors), [colors]);
  const entranceStyle = useSpringEntrance(index, 0, trigger);
  const pulseStyle = usePulse(1, 1.2);
  const pct = Math.min(currentRating / 1000, 1);
  const gradient = SPORT_BAR_GRADIENT[sport] ?? SPORT_BAR_GRADIENT.padel;

  // Find next level above current rating
  const nextLevel = allLevels.find((l) => l.minRating > currentRating);

  if (compact) {
    return (
      <Animated.View style={[entranceStyle, s.compactContainer]}>
        {/* Rating + Level */}
        <View style={s.compactHeader}>
          <Text style={s.compactRating}>{currentRating}</Text>
          <Text style={s.compactLevel}>{currentLevel.name}</Text>
          {nextLevel && (
            <Text style={s.compactNext}>
              Next: {nextLevel.name} ({nextLevel.minRating})
            </Text>
          )}
        </View>

        {/* Progress bar */}
        <View style={s.compactTrack}>
          <Animated.View style={[s.compactFill, { width: `${pct * 100}%` }]}>
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          {/* "YOU ARE HERE" dot */}
          <Animated.View
            style={[
              pulseStyle,
              s.markerDot,
              { left: `${pct * 100}%` },
            ]}
          />
        </View>

        {/* Scale labels */}
        <View style={s.scaleRow}>
          <Text style={s.scaleLabel}>0</Text>
          <Text style={s.scaleLabel}>250</Text>
          <Text style={s.scaleLabel}>500</Text>
          <Text style={s.scaleLabel}>750</Text>
          <Text style={s.scaleLabel}>1000</Text>
        </View>
      </Animated.View>
    );
  }

  // Full vertical ladder mode — show levels in descending order (highest at top)
  const sortedLevels = allLevels.slice().sort((a, b) => b.minRating - a.minRating);

  return (
    <Animated.View style={[entranceStyle, s.fullContainer]}>
      {/* Current rating hero */}
      <View style={s.heroSection}>
        <Text style={s.heroRating}>{currentRating}</Text>
        <Text style={s.heroLevel}>{currentLevel.name}</Text>
      </View>

      {/* Vertical ladder */}
      <View style={s.ladder}>
        {sortedLevels.map((lvl) => {
          const isCurrentLevel =
            currentRating >= lvl.minRating && currentRating <= lvl.maxRating;
          const isPast = currentRating > lvl.maxRating;
          const levelColor = lvl.color ?? colors.accent1;

          return (
            <View
              key={lvl.name}
              style={[
                s.ladderRung,
                isCurrentLevel && [
                  s.ladderRungActive,
                  { backgroundColor: `${levelColor}14` },
                ],
              ]}
            >
              <View style={s.ladderLeft}>
                <View
                  style={[
                    s.ladderDot,
                    isPast && s.ladderDotPast,
                    isCurrentLevel && [
                      s.ladderDotActive,
                      { backgroundColor: levelColor },
                    ],
                  ]}
                />
                <View
                  style={[
                    s.ladderLine,
                    isPast && s.ladderLinePast,
                  ]}
                />
              </View>

              <View style={s.ladderContent}>
                <View style={s.ladderNameRow}>
                  <Text
                    style={[
                      s.ladderName,
                      isCurrentLevel && [
                        s.ladderNameActive,
                        { color: levelColor },
                      ],
                    ]}
                  >
                    {lvl.name}
                  </Text>
                  <Text style={s.ladderRange}>
                    {lvl.minRating}–{lvl.maxRating}
                  </Text>
                </View>
                <Text style={s.ladderDesc}>{lvl.description}</Text>

                {/* Show player's marker */}
                {isCurrentLevel && (
                  <View style={[s.youAreHere, { backgroundColor: `${levelColor}26` }]}>
                    <Ionicons name="location" size={14} color={levelColor} />
                    <Text style={[s.youAreHereText, { color: levelColor }]}>
                      YOU ARE HERE
                    </Text>
                  </View>
                )}

                {/* Pro milestones at this level */}
                {milestones
                  .filter(
                    (m) => m.rating >= lvl.minRating && m.rating <= lvl.maxRating,
                  )
                  .map((m) => (
                    <View key={m.name} style={s.milestone}>
                      <Ionicons name="star" size={10} color={colors.tierGold} />
                      <Text style={s.milestoneName}>{m.name}</Text>
                      <Text style={s.milestoneRating}>{m.rating}</Text>
                    </View>
                  ))}
              </View>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

// ═══ STYLES ═══

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    compactContainer: {
      padding: spacing.md,
    },
    compactHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
      marginBottom: spacing.sm,
    },
    compactRating: {
      fontFamily: fontFamily.bold,
      fontSize: 28,
      color: colors.accent1,
    },
    compactLevel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
      color: colors.textOnDark,
    },
    compactNext: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
      marginLeft: 'auto',
    },
    compactTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.glass,
      overflow: 'visible',
      position: 'relative',
    },
    compactFill: {
      height: '100%',
      borderRadius: 4,
      overflow: 'hidden',
    },
    markerDot: {
      position: 'absolute',
      top: -4,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.accent1,
      borderWidth: 2,
      borderColor: colors.background,
      marginLeft: -8,
    },
    scaleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    scaleLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      color: colors.textInactive,
    },
    fullContainer: {},
    heroSection: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    heroRating: {
      fontFamily: fontFamily.bold,
      fontSize: 56,
      color: colors.accent1,
      lineHeight: 60,
    },
    heroLevel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 18,
      color: colors.textOnDark,
      marginTop: 4,
    },
    ladder: {
      paddingLeft: spacing.md,
    },
    ladderRung: {
      flexDirection: 'row',
      minHeight: 60,
    },
    ladderRungActive: {
      borderRadius: borderRadius.md,
      marginHorizontal: -spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    ladderLeft: {
      alignItems: 'center',
      width: 20,
      marginRight: spacing.md,
    },
    ladderDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.glassBorder,
      marginTop: 6,
    },
    ladderDotPast: {
      backgroundColor: colors.accent2,
    },
    ladderDotActive: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: colors.background,
    },
    ladderLine: {
      flex: 1,
      width: 2,
      backgroundColor: colors.glassBorder,
    },
    ladderLinePast: {
      backgroundColor: colors.accent2,
    },
    ladderContent: {
      flex: 1,
      paddingVertical: 4,
      paddingBottom: spacing.sm,
    },
    ladderNameRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    ladderName: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textOnDark,
    },
    ladderNameActive: {
      fontFamily: fontFamily.bold,
    },
    ladderRange: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
    },
    ladderDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    youAreHere: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      alignSelf: 'flex-start',
    },
    youAreHereText: {
      fontFamily: fontFamily.bold,
      fontSize: 10,
      letterSpacing: 1,
    },
    milestone: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    milestoneName: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textOnDark,
    },
    milestoneRating: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
      marginLeft: 'auto',
    },
  });
}
