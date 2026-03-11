/**
 * CrossTrainingModule — Shows how padel training contributes to football
 * attributes (and vice versa).
 *
 * Appears as a collapsible section on the Football Progress Screen when
 * the user also has padel events in their calendar.
 *
 * Psychology:
 * - Frame as enhancement: "Padel is making you a better footballer"
 * - SDT Competence: concrete numbers for cross-training benefit
 * - Dropout prevention: multi-sport engagement reduces burnout
 * - Never suggest the user should do LESS padel or LESS football
 *
 * Calculation (simplified MVP):
 * - Each padel session hour → +0.3 Agility, +0.2 Reaction Time
 * - Weekly cap: +2.0 points per attribute from cross-training
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutAnimation } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../index';
import { useTheme } from '../../hooks/useTheme';
import { getCalendarEventsByRange } from '../../services/api';
import { toDateStr, addDays, getWeekStart } from '../../utils/calendarHelpers';
import { fontFamily, spacing, borderRadius } from '../../theme';
import type { ThemeColors } from '../../theme/colors';
import type { CalendarEvent } from '../../types';

// ─── Constants ──────────────────────────────────────────────────────────────

const PADEL_COLOR = '#3498DB';
const FOOTBALL_COLOR = '#2ECC71';

/** Maximum cross-training contribution per attribute per week */
const WEEKLY_CAP = 2.0;

// ── Directional config ───────────────────────────────────────────────

interface DirectionConfig {
  sourceSportKey: 'padel' | 'football';
  sourceLabel: string;
  targetLabel: string;
  sourceColor: string;
  targetColor: string;
  sourceIcon: keyof typeof Ionicons.glyphMap;
  targetIcon: keyof typeof Ionicons.glyphMap;
  subtitle: string;
  contributionPerHour: Record<string, number>;
  benefits: {
    sourceActivity: string;
    targetBenefit: string;
    sourceIcon: keyof typeof Ionicons.glyphMap;
    targetIcon: keyof typeof Ionicons.glyphMap;
  }[];
}

const DIRECTION_CONFIGS: Record<string, DirectionConfig> = {
  'padel-to-football': {
    sourceSportKey: 'padel',
    sourceLabel: 'Padel',
    targetLabel: 'Football',
    sourceColor: PADEL_COLOR,
    targetColor: FOOTBALL_COLOR,
    sourceIcon: 'tennisball-outline',
    targetIcon: 'football-outline',
    subtitle: 'Padel is making you a better footballer',
    contributionPerHour: {
      agility: 0.3,
      reaction: 0.2,
      decisionMaking: 0.15,
      spatialAwareness: 0.1,
    },
    benefits: [
      { sourceActivity: 'Rally Drills', targetBenefit: 'Reaction Time', sourceIcon: 'tennisball-outline', targetIcon: 'flash-outline' },
      { sourceActivity: 'Movement', targetBenefit: 'Agility', sourceIcon: 'footsteps-outline', targetIcon: 'swap-horizontal-outline' },
      { sourceActivity: 'Match Play', targetBenefit: 'Decision Making', sourceIcon: 'trophy-outline', targetIcon: 'bulb-outline' },
      { sourceActivity: 'Wall Play', targetBenefit: 'Spatial Awareness', sourceIcon: 'resize-outline', targetIcon: 'eye-outline' },
    ],
  },
  'football-to-padel': {
    sourceSportKey: 'football',
    sourceLabel: 'Football',
    targetLabel: 'Padel',
    sourceColor: FOOTBALL_COLOR,
    targetColor: PADEL_COLOR,
    sourceIcon: 'football-outline',
    targetIcon: 'tennisball-outline',
    subtitle: 'Football is making you a better padel player',
    contributionPerHour: {
      footwork: 0.25,
      stamina: 0.3,
      anticipation: 0.2,
      positioning: 0.15,
    },
    benefits: [
      { sourceActivity: 'Sprint Training', targetBenefit: 'Court Speed', sourceIcon: 'speedometer-outline', targetIcon: 'footsteps-outline' },
      { sourceActivity: 'Endurance Work', targetBenefit: 'Rally Stamina', sourceIcon: 'fitness-outline', targetIcon: 'pulse-outline' },
      { sourceActivity: 'Passing Drills', targetBenefit: 'Anticipation', sourceIcon: 'football-outline', targetIcon: 'eye-outline' },
      { sourceActivity: 'Positioning', targetBenefit: 'Court Awareness', sourceIcon: 'locate-outline', targetIcon: 'grid-outline' },
    ],
  },
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface CrossTrainingStats {
  sessions: number;
  hours: number;
  boosts: { label: string; value: number; color: string }[];
}

interface Props {
  isFocused: boolean;
  /** Which sport's events are the "source" of cross-training benefit.
   *  'padel' = padel events benefiting football (default).
   *  'football' = football events benefiting padel. */
  sourceSport?: 'padel' | 'football';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const BOOST_COLORS = ['#3498DB', '#3498DB', '#2ECC71', '#7B61FF'];

function computeCrossTrainingStats(
  events: CalendarEvent[],
  config: DirectionConfig,
): CrossTrainingStats {
  const sourceEvents = events.filter((e) => e.sport === config.sourceSportKey);
  const sessions = sourceEvents.length;

  let hours = 0;
  for (const evt of sourceEvents) {
    if (evt.startTime && evt.endTime) {
      const [sh, sm] = evt.startTime.split(':').map(Number);
      const [eh, em] = evt.endTime.split(':').map(Number);
      const duration = (eh * 60 + em - (sh * 60 + sm)) / 60;
      hours += duration > 0 ? duration : 1.5;
    } else {
      hours += 1.5;
    }
  }
  hours = Math.round(hours * 10) / 10;

  const keys = Object.keys(config.contributionPerHour);
  const boosts = keys.map((key, i) => {
    const raw = hours * config.contributionPerHour[key];
    const capped = Math.min(raw, WEEKLY_CAP);
    return {
      label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
      value: Math.round(capped * 10) / 10,
      color: BOOST_COLORS[i % BOOST_COLORS.length],
    };
  });

  return { sessions, hours, boosts };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CrossTrainingModule({ isFocused, sourceSport = 'padel' }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const dirKey = sourceSport === 'football' ? 'football-to-padel' : 'padel-to-football';
  const dir = DIRECTION_CONFIGS[dirKey];

  const [expanded, setExpanded] = useState(true);
  const [showResearch, setShowResearch] = useState(false);
  const [weekEvents, setWeekEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Fetch current week's events
  useEffect(() => {
    if (!isFocused) return;
    const now = new Date();
    const weekStart = getWeekStart(now);
    const weekEnd = addDays(weekStart, 6);

    getCalendarEventsByRange(toDateStr(weekStart), toDateStr(weekEnd))
      .then((res) => {
        setWeekEvents(res.events || []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [isFocused]);

  const stats = useMemo(
    () => computeCrossTrainingStats(weekEvents, dir),
    [weekEvents, dir],
  );

  const toggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((p) => !p);
  }, []);

  const toggleResearch = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowResearch((p) => !p);
  }, []);

  // Don't render until loaded; hide if no source-sport sessions at all
  if (!loaded || stats.sessions === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <GlassCard style={s.card}>
        {/* ── Header ──────────────────────────────────────────── */}
        <Pressable onPress={toggleExpanded} style={s.header}>
          <View style={s.headerIcons}>
            <View style={[s.iconCircle, { backgroundColor: dir.sourceColor + '20' }]}>
              <Ionicons name={dir.sourceIcon} size={16} color={dir.sourceColor} />
            </View>
            <Ionicons
              name="arrow-forward"
              size={12}
              color={colors.textInactive}
            />
            <View style={[s.iconCircle, { backgroundColor: dir.targetColor + '20' }]}>
              <Ionicons name={dir.targetIcon} size={16} color={dir.targetColor} />
            </View>
          </View>
          <View style={s.headerTextWrap}>
            <Text style={s.headerTitle}>Cross-Training Impact</Text>
            <Text style={s.headerSubtitle}>{dir.subtitle}</Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textMuted}
          />
        </Pressable>

        {expanded && (
          <View style={s.body}>
            {/* ── Benefit Mapping ─────────────────────────────── */}
            <View style={s.benefitGrid}>
              {dir.benefits.map((b) => (
                <View key={b.targetBenefit} style={s.benefitRow}>
                  <View style={s.benefitSide}>
                    <Ionicons name={b.sourceIcon} size={14} color={dir.sourceColor} />
                    <Text style={s.benefitLabel}>{b.sourceActivity}</Text>
                  </View>
                  <View style={s.benefitArrow}>
                    <Ionicons name="arrow-forward" size={12} color={colors.textInactive} />
                    <Text style={s.benefitPlus}>+</Text>
                  </View>
                  <View style={s.benefitSide}>
                    <Ionicons name={b.targetIcon} size={14} color={dir.targetColor} />
                    <Text style={s.benefitLabel}>{b.targetBenefit}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* ── Divider ─────────────────────────────────────── */}
            <View style={s.divider} />

            {/* ── Weekly Summary ──────────────────────────────── */}
            <Text style={s.summaryTitle}>This Week</Text>
            <View style={s.summaryRow}>
              <View style={[s.summaryItem, { backgroundColor: dir.sourceColor + '10' }]}>
                <Text style={[s.summaryValue, { color: dir.sourceColor }]}>{stats.sessions}</Text>
                <Text style={s.summaryLabel}>{dir.sourceLabel} Sessions</Text>
              </View>
              <View style={[s.summaryItem, { backgroundColor: dir.sourceColor + '10' }]}>
                <Text style={[s.summaryValue, { color: dir.sourceColor }]}>{stats.hours}</Text>
                <Text style={s.summaryLabel}>Hours</Text>
              </View>
            </View>

            <Text style={s.barChartTitle}>Estimated {dir.targetLabel} Benefit</Text>
            <View style={s.barChart}>
              {stats.boosts.map((bar) => (
                <View key={bar.label} style={s.barRow}>
                  <Text style={s.barLabel}>{bar.label}</Text>
                  <View style={s.barTrack}>
                    <View
                      style={[
                        s.barFill,
                        {
                          backgroundColor: bar.color,
                          width: `${Math.min((bar.value / WEEKLY_CAP) * 100, 100)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[s.barValue, { color: bar.color }]}>
                    +{bar.value}
                  </Text>
                </View>
              ))}
            </View>

            {/* ── Research Note ────────────────────────────────── */}
            <Pressable onPress={toggleResearch} style={s.researchToggle}>
              <Ionicons
                name="school-outline"
                size={14}
                color={colors.textInactive}
              />
              <Text style={s.researchToggleText}>Research Background</Text>
              <Ionicons
                name={showResearch ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.textInactive}
              />
            </Pressable>
            {showResearch && (
              <View style={s.researchContent}>
                <Text style={s.researchText}>
                  Research shows cross-training reduces injury risk and burnout
                  in youth athletes (ProFysio, 2021). Multi-sport engagement
                  develops transferable skills — quick directional changes, reaction
                  speed, and decision-making under pressure (PMC, 2022).
                </Text>
                <Text style={s.researchText}>
                  Multi-sport athletes show greater long-term development and
                  mental freshness (meta-analysis, 2025).
                </Text>
              </View>
            )}
          </View>
        )}
      </GlassCard>
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      marginBottom: 16,
    },

    // ── Header ──
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    headerIcons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    iconCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTextWrap: {
      flex: 1,
      marginLeft: 4,
    },
    headerTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.textOnDark,
    },
    headerSubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
      marginTop: 1,
    },

    // ── Body ──
    body: {
      marginTop: spacing.md,
    },

    // ── Benefit Grid ──
    benefitGrid: {
      gap: spacing.sm,
    },
    benefitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    benefitSide: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.backgroundElevated,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: borderRadius.md,
    },
    benefitLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textOnDark,
    },
    benefitArrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    benefitPlus: {
      fontFamily: fontFamily.bold,
      fontSize: 12,
      color: '#2ECC71',
    },

    // ── Divider ──
    divider: {
      height: 1,
      backgroundColor: colors.divider,
      marginVertical: spacing.md,
    },

    // ── Weekly Summary ──
    summaryTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textOnDark,
      marginBottom: spacing.sm,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    summaryItem: {
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 20,
      borderRadius: borderRadius.md,
    },
    summaryValue: {
      fontFamily: fontFamily.bold,
      fontSize: 22,
    },
    summaryLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
      marginTop: 2,
    },

    // ── Bar Chart ──
    barChartTitle: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textInactive,
      marginBottom: spacing.sm,
    },
    barChart: {
      gap: 6,
    },
    barRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    barLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.textMuted,
      width: 56,
    },
    barTrack: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.backgroundElevated,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      borderRadius: 4,
      minWidth: 4,
    },
    barValue: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      width: 32,
      textAlign: 'right',
    },

    // ── Research Note ──
    researchToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: spacing.md,
      paddingVertical: 4,
    },
    researchToggleText: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textInactive,
      flex: 1,
    },
    researchContent: {
      marginTop: spacing.sm,
      padding: spacing.compact,
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.md,
    },
    researchText: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
      marginBottom: spacing.sm,
    },
  });
}
