/**
 * Progress & Stats Screen — Padel Dashboard
 *
 *   1. DNA Card Hero (Overall score, hexagon radar, attributes)
 *   2. Attribute Trends (sparklines for 6 DNA attributes)
 *   3. Shot Mastery (all 8 shots + variety index)
 *   4. Padel Rating Pathway (tappable)
 *   5. Cross-Training Impact (football → padel)
 *   6. Streak Tracker
 *   7. Sleep Recovery
 *   8. "View Full Padel Profile" button
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Modal,
  Platform,
  Dimensions,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Polyline,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import { GlassCard, GradientButton, SkeletonCard, ErrorState } from '../components';
import { DNACard } from '../components/DNACard';
import { ShotRatingBar } from '../components/ShotRatingBar';
import { PadelRatingPathway } from '../components/PadelRatingPathway';
import { AttributeDetailSheet } from '../components/AttributeDetailSheet';
import { CrossTrainingModule } from '../components/football/CrossTrainingModule';
import { useSpringEntrance } from '../hooks/useAnimations';
import { buildSparklinePath } from '../utils/sparkline';
import {
  SHOT_DEFINITIONS,
  DEMO_PHYSICAL_METRICS,
} from '../services/padelMockData';
import { SHOT_ORDER, DNA_ATTRIBUTE_ORDER, DNA_ATTRIBUTE_LABELS, DNA_ATTRIBUTE_FULL_NAMES } from '../types/padel';
import type { DNAAttribute, DNACardData, ShotRatingsData } from '../types/padel';
import { DNA_ATTRIBUTE_COLORS, getDNATier, getTierLabel } from '../services/padelCalculations';
import type { CardAttribute, CardTier } from '../components/DNACard';
import {
  spacing,
  fontFamily,
  layout,
} from '../theme';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { getStats, getCheckins } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { ScrollFadeOverlay } from '../components/ScrollFadeOverlay';
import { useHealthKit } from '../hooks/useHealthKit';
import { useSportContext, getSportConfig } from '../hooks/useSportContext';
import type { ActiveSport } from '../hooks/useSportContext';
import { FootballProgressContent } from './football';
import { EmptyProgressState } from '../components/EmptyProgressState';
import type { ProgressData, Checkin } from '../types';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, MainStackParamList } from '../navigation/types';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const SCREEN_H_MARGIN = 24;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProgressScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Progress'>,
    NativeStackNavigationProp<MainStackParamList>
  >;
};

interface StatsData {
  progress: ProgressData;
  compliance: {
    totalDays: number;
    fullCompliance: number;
    partialCompliance: number;
    complianceRate: number;
  };
  recentPoints: Array<{
    basePoints: number;
    multiplier: number;
    finalPoints: number;
    reason: string;
    timestamp: string;
  }>;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function getStreakTier(streak: number): { label: string; emoji: string } {
  if (streak >= 90) return { label: 'Legend', emoji: '👑' };
  if (streak >= 60) return { label: 'Veteran', emoji: '⭐' };
  if (streak >= 30) return { label: 'Dedicated', emoji: '🏆' };
  if (streak >= 14) return { label: 'Consistent', emoji: '💪' };
  if (streak >= 7) return { label: 'Building', emoji: '🔥' };
  if (streak >= 1) return { label: 'Started', emoji: '🌱' };
  return { label: 'New', emoji: '👋' };
}

export function getNextMilestoneInfo(
  currentStreak: number,
  unlockedIds: string[],
): { name: string; target: number; progress: number } | null {
  const streakMilestones = [
    { id: 'week_streak', name: 'Week Warrior', target: 7 },
    { id: 'two_week_streak', name: 'Consistent', target: 14 },
    { id: 'month_streak', name: 'Unstoppable', target: 30 },
  ];
  for (const m of streakMilestones) {
    if (!unlockedIds.includes(m.id)) {
      return { name: m.name, target: m.target, progress: Math.min(1, currentStreak / m.target) };
    }
  }
  return null;
}

export function formatPoints(n: number): string {
  if (n < 0) return '0';
  return n.toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// Small Progress Ring (for streak)
// ---------------------------------------------------------------------------

const TRACK_GRAY = '#E8E8E8';

function StreakProgressRing({
  progress,
  size = 96,
  strokeWidth = 7,
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
        <SvgGradient id="streakRingGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.accent1} />
          <Stop offset="1" stopColor={colors.accent2} />
        </SvgGradient>
      </Defs>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={TRACK_GRAY}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="url(#streakRingGrad)"
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

// ---------------------------------------------------------------------------
// Padel Progress Content
// ---------------------------------------------------------------------------

function PadelProgressContent({
  navigation,
  streak,
  nextMilestone,
  streakProgress,
  latestSleep,
  sleepOptimal,
  isFocused,
}: {
  navigation: any;
  streak: number;
  nextMilestone: ReturnType<typeof getNextMilestoneInfo>;
  streakProgress: number;
  latestSleep: number | null;
  sleepOptimal: boolean;
  isFocused: boolean;
}) {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const padelConfig = getSportConfig('padel');
  const styles = useMemo(() => createStyles(colors), [colors]);
  const padelStyles = useMemo(() => createPadelStyles(colors), [colors]);

  // ── Data via sport pipeline (always use padel config, not active sport) ──
  const userId = profile?.uid || profile?.id || 'osama-kayyali';
  const dnaCard = padelConfig.mockData.getCard(userId) as DNACardData | null;
  const shotRatings = padelConfig.mockData.getSkills(userId) as ShotRatingsData | null;
  const [selectedAttr, setSelectedAttr] = useState<DNAAttribute | null>(null);

  // ── Empty state ──
  if (!dnaCard || !shotRatings) {
    return (
      <EmptyProgressState
        sport="padel"
        onLogSession={() => navigation.navigate('Plan' as any)}
        onTakeTest={() => navigation.navigate('Tests' as any)}
      />
    );
  }

  // Map padel DNACardData to generic CardAttribute[]
  const padelAttributes: CardAttribute[] = DNA_ATTRIBUTE_ORDER.map((attr) => ({
    key: attr,
    label: DNA_ATTRIBUTE_LABELS[attr],
    abbreviation: DNA_ATTRIBUTE_FULL_NAMES[attr],
    value: dnaCard.attributes[attr].score,
    maxValue: 99,
    color: DNA_ATTRIBUTE_COLORS[attr],
    trend: dnaCard.attributes[attr].trend,
  }));
  const padelTier = getDNATier(dnaCard.overallRating) as CardTier;

  // ── Synthetic attribute trends for sparklines ──
  // Padel doesn't have per-attribute history, so we generate 5 data points
  // from current score and trend for a meaningful sparkline visualization.
  const attributeTrends = useMemo(() => {
    return DNA_ATTRIBUTE_ORDER.map((attr) => {
      const data = dnaCard.attributes[attr];
      const current = data.score;
      const trend = data.trend;
      // Generate 5 synthetic points ending at current score
      const points = [
        current - trend * 2,
        current - trend * 1.5,
        current - trend,
        current - Math.round(trend * 0.4),
        current,
      ].map((v) => Math.max(0, Math.min(99, Math.round(v))));
      return { attr, points, current, delta: trend };
    });
  }, [dnaCard]);

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
        attributes={padelAttributes}
        overallRating={dnaCard.overallRating}
        position="All-Round"
        cardTier={padelTier}
        sport="padel"
        pathwayRating={dnaCard.padelRating}
        pathwayLevel={dnaCard.padelLevel}
        onAttributeTap={(key) => setSelectedAttr(key === selectedAttr ? null : key as DNAAttribute)}
        onPress={() => navigation.navigate('PadelRating')}
        trigger={isFocused}
      />

      {/* Attribute Detail (expandable) */}
      {selectedAttr && (
        <AttributeDetailSheet
          attribute={selectedAttr}
          data={dnaCard.attributes[selectedAttr]}
          metrics={DEMO_PHYSICAL_METRICS}
          onClose={() => setSelectedAttr(null)}
        />
      )}

      {/* ═══════ 2. Attribute Trends ═══════ */}
      <Animated.View style={entrance1}>
        <GlassCard style={padelStyles.sectionCard}>
          <Text style={padelStyles.sectionTitle}>Attribute Trends</Text>
          <Text style={padelStyles.trendSubtitle}>Recent progression</Text>

          {attributeTrends.map((trend) => {
            const attrColor = DNA_ATTRIBUTE_COLORS[trend.attr];
            const sparkPath = buildSparklinePath(trend.points, 60, 20);
            return (
              <View key={trend.attr} style={padelStyles.trendRow}>
                <View style={[padelStyles.trendDot, { backgroundColor: attrColor }]} />
                <Text style={padelStyles.trendLabel}>
                  {DNA_ATTRIBUTE_LABELS[trend.attr]}
                </Text>
                <Text style={[padelStyles.trendScore, { color: attrColor }]}>
                  {trend.current}
                </Text>

                {sparkPath.length > 0 && (
                  <View style={padelStyles.sparkContainer}>
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

                <Text
                  numberOfLines={1}
                  style={[
                    padelStyles.trendDelta,
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

      {/* ═══════ 3. Shot Mastery ═══════ */}
      <Animated.View style={entrance2}>
        <GlassCard style={padelStyles.sectionCard}>
          <View style={padelStyles.shotHeader}>
            <View>
              <Text style={padelStyles.sectionTitle}>Shot Mastery</Text>
              <Text style={padelStyles.shotHint}>Tap any shot to see breakdown</Text>
            </View>
            <View style={padelStyles.varietyBadge}>
              <Text style={padelStyles.varietyText}>
                Variety {shotRatings.shotVarietyIndex}%
              </Text>
            </View>
          </View>

          <View style={padelStyles.shotSummaryRow}>
            <View style={padelStyles.shotSummaryItem}>
              <Text style={padelStyles.shotSummaryLabel}>Overall</Text>
              <Text style={padelStyles.shotSummaryValue}>
                {shotRatings.overallShotMastery}
              </Text>
            </View>
            <View style={padelStyles.shotSummaryItem}>
              <Text style={padelStyles.shotSummaryLabel}>Strongest</Text>
              <Text style={[padelStyles.shotSummaryValue, { color: '#30D158' }]} numberOfLines={1}>
                {SHOT_DEFINITIONS[shotRatings.strongestShot].name}
              </Text>
            </View>
            <View style={padelStyles.shotSummaryItem}>
              <Text style={padelStyles.shotSummaryLabel}>Focus On</Text>
              <Text style={[padelStyles.shotSummaryValue, { color: colors.accent1 }]} numberOfLines={1}>
                {SHOT_DEFINITIONS[shotRatings.weakestShot].name}
              </Text>
            </View>
          </View>

          {SHOT_ORDER.map((shot, i) => (
            <ShotRatingBar
              key={shot}
              definition={SHOT_DEFINITIONS[shot]}
              data={shotRatings.shots[shot]}
              index={i}
              trigger={isFocused}
            />
          ))}

          <GradientButton
            title="Rate Session"
            onPress={() => navigation.navigate('ShotSession')}
            icon="add-circle-outline"
            style={{ marginTop: spacing.md }}
          />
        </GlassCard>
      </Animated.View>

      {/* ═══════ 4. Padel Rating Pathway (tappable) ═══════ */}
      <Animated.View style={entrance3}>
        <GlassCard style={padelStyles.sectionCard}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate('PadelRating');
            }}
            style={({ pressed }) => [
              pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
            ]}
          >
            <Text style={padelStyles.sectionTitle}>Padel Rating</Text>
            <PadelRatingPathway
              rating={dnaCard.padelRating}
              level={dnaCard.padelLevel}
              compact
              index={3}
              trigger={isFocused}
            />
            <View style={padelStyles.tapHint}>
              <Text style={padelStyles.tapHintText}>Tap to explore levels</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </Pressable>
        </GlassCard>
      </Animated.View>

      {/* ═══════ 5. Cross-Training Impact ═══════ */}
      <Animated.View style={entrance4}>
        <CrossTrainingModule isFocused={isFocused} sourceSport="football" />
      </Animated.View>

      {/* ═══════ 6. Streak ═══════ */}
      <Animated.View style={entrance5}>
        <GlassCard style={padelStyles.sectionCard}>
          <View style={styles.streakRow}>
            <View style={styles.ringContainer}>
              <StreakProgressRing progress={streakProgress} size={80} strokeWidth={6} colors={colors} />
              <View style={styles.ringCenter}>
                <Ionicons name="flame" size={22} color={colors.accent1} />
              </View>
            </View>
            <View style={styles.streakInfo}>
              <Text style={styles.streakCount}>{streak}</Text>
              <Text style={styles.streakLabel}>Day Streak</Text>
              {nextMilestone && (
                <Text style={styles.streakMilestone}>
                  {streak}/{nextMilestone.target} to {nextMilestone.name}
                </Text>
              )}
            </View>
          </View>
        </GlassCard>
      </Animated.View>

      {/* ═══════ 7. Sleep ═══════ */}
      <Animated.View style={entrance6}>
        <GlassCard style={padelStyles.sectionCard}>
          <View style={styles.sleepRow}>
            <View style={padelStyles.sleepIconWrap}>
              <Ionicons name="bed-outline" size={22} color={colors.accent2} />
            </View>
            <View style={styles.sleepInfo}>
              <Text style={styles.sleepTitle}>Sleep Recovery</Text>
              <Text style={styles.sleepHours}>
                {latestSleep !== null ? `${latestSleep} hrs` : '--'}
              </Text>
              <Text
                style={[
                  styles.sleepSubtitle,
                  {
                    color: latestSleep === null
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

      {/* ═══════ 8. View Full Profile ═══════ */}
      <Animated.View style={entrance7}>
        <GradientButton
          title="View Full Padel Profile"
          onPress={() => navigation.navigate('PadelRating')}
          icon="trophy-outline"
        />
      </Animated.View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Padel styles factory
// ---------------------------------------------------------------------------

function createPadelStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sectionCard: {
      marginBottom: 16,
    },
    sectionTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.textOnDark,
      marginBottom: spacing.sm,
    },
    shotHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    shotHint: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
      marginTop: 2,
    },
    varietyBadge: {
      backgroundColor: 'rgba(255, 107, 53, 0.15)',
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 10,
    },
    varietyText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 11,
      color: colors.accent1,
    },
    shotSummaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    shotSummaryItem: {
      alignItems: 'center',
    },
    shotSummaryLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textInactive,
      marginBottom: 2,
    },
    shotSummaryValue: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.textOnDark,
    },
    sleepIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(0, 217, 255, 0.15)',
      justifyContent: 'center',
      alignItems: 'center',
    },

    // ── Attribute Trends ──
    trendSubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
      marginBottom: spacing.md,
    },
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
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProgressScreen({ navigation }: ProgressScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { profile } = useAuth();
  const { lastSleep } = useHealthKit();
  const isFocused = useIsFocused();
  const { activeSport, setActiveSport, hasMultipleSports, sportConfig, userSports } = useSportContext();
  const [showSportMenu, setShowSportMenu] = useState(false);

  // ── Horizontal swipe between sports ──
  const SCREEN_WIDTH = Dimensions.get('window').width;
  const PEEK = 48;
  const PAGE_WIDTH = SCREEN_WIDTH - PEEK;
  const horizontalScrollRef = useRef<ScrollView>(null);
  const lastPageRef = useRef(0);

  // Track vertical scroll → disable swipe + hide peek when scrolled down
  const [canSwipe, setCanSwipe] = useState(true);
  const isScrolledDownRef = useRef(false);
  const peekOverlayOpacity = useSharedValue(0);
  const peekOverlayStyle = useAnimatedStyle(() => ({
    opacity: peekOverlayOpacity.value,
  }));

  const handleVerticalScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const scrolled = y > 10;
      if (scrolled !== isScrolledDownRef.current) {
        isScrolledDownRef.current = scrolled;
        setCanSwipe(!scrolled);
        peekOverlayOpacity.value = withTiming(scrolled ? 1 : 0, { duration: 200 });
      }
    },
    [],
  );

  const handleHorizontalScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const pageIndex = Math.round(e.nativeEvent.contentOffset.x / PAGE_WIDTH);
      if (pageIndex !== lastPageRef.current) {
        lastPageRef.current = pageIndex;
        const sport = userSports[pageIndex];
        if (sport) {
          setActiveSport(sport);
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    },
    [PAGE_WIDTH, userSports, setActiveSport],
  );

  const scrollToSport = useCallback(
    (sport: ActiveSport) => {
      const pageIndex = userSports.indexOf(sport);
      if (pageIndex >= 0) {
        lastPageRef.current = pageIndex;
        horizontalScrollRef.current?.scrollTo({ x: pageIndex * PAGE_WIDTH, animated: true });
      }
    },
    [userSports, PAGE_WIDTH],
  );

  const [stats, setStats] = useState<StatsData | null>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backendError, setBackendError] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, checkinsRes] = await Promise.allSettled([
        getStats(),
        getCheckins(14),
      ]);

      if (statsRes.status === 'fulfilled') {
        setStats({
          progress: statsRes.value.progress,
          compliance: statsRes.value.compliance,
          recentPoints: statsRes.value.recentPoints,
        });
      }
      if (checkinsRes.status === 'fulfilled') {
        setCheckins(checkinsRes.value.checkins || []);
      }
      setBackendError(false);
    } catch {
      setBackendError(true);
      setStats({
        progress: {
          currentStreak: profile?.currentStreak || 0,
          longestStreak: profile?.longestStreak || 0,
          totalPoints: profile?.totalPoints || 0,
          weeklyPoints: 0,
          streakMultiplier: profile?.streakMultiplier || 1,
          totalCheckIns: 0,
          milestonesUnlocked: profile?.milestonesUnlocked || [],
        },
        compliance: { totalDays: 0, fullCompliance: 0, partialCompliance: 0, complianceRate: 0 },
        recentPoints: [],
      });
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // ── Streak ──
  const streak = stats?.progress?.currentStreak ?? 0;
  const nextMilestone = getNextMilestoneInfo(
    streak,
    stats?.progress?.milestonesUnlocked ?? [],
  );
  const streakProgress = nextMilestone ? nextMilestone.progress : (streak > 0 ? 1 : 0);

  // ── Sleep ──
  const latestSleep = lastSleep
    ? lastSleep.hours
    : (checkins.length > 0 ? checkins[0].sleepHours : null);
  const sleepOptimal = latestSleep !== null && latestSleep >= 8;

  // Content fade-in
  const contentOpacity = useSharedValue(0);
  const contentFade = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
  useEffect(() => {
    if (!isLoading && isFocused) {
      contentOpacity.value = 0;
      contentOpacity.value = withTiming(1, { duration: 600 });
    } else if (!isFocused) {
      contentOpacity.value = 0;
    }
  }, [isLoading, isFocused]);

  // ── Scroll to active sport on mount ──
  useEffect(() => {
    if (hasMultipleSports) {
      const pageIndex = userSports.indexOf(activeSport);
      lastPageRef.current = pageIndex;
      if (pageIndex > 0) {
        setTimeout(() => {
          horizontalScrollRef.current?.scrollTo({ x: pageIndex * PAGE_WIDTH, animated: false });
        }, 50);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading state ──
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header — sport name + dropdown trigger + profile */}
      <View style={styles.screenHeader}>
        <Pressable
          style={({ pressed }) => [styles.sportToggle, pressed && hasMultipleSports && { opacity: 0.7 }]}
          onPress={() => {
            if (hasMultipleSports) {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowSportMenu(true);
            }
          }}
        >
          <Ionicons
            name={sportConfig.icon as keyof typeof Ionicons.glyphMap}
            size={20}
            color={sportConfig.color}
          />
          <Text style={styles.screenHeaderTitle}>{sportConfig.label}</Text>
          {hasMultipleSports && (
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          )}
        </Pressable>
        <HeaderProfileButton
          initial={profile?.name?.charAt(0)?.toUpperCase() || '?'}
          photoUrl={profile?.photoUrl}
        />
      </View>

      {/* Sport picker dropdown */}
      {hasMultipleSports && (
        <Modal
          visible={showSportMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSportMenu(false)}
        >
          <Pressable style={styles.dropdownOverlay} onPress={() => setShowSportMenu(false)}>
            <View style={styles.dropdownContainer}>
              {userSports.map((sport: ActiveSport) => {
                const cfg = getSportConfig(sport);
                const isActive = sport === activeSport;
                return (
                  <Pressable
                    key={sport}
                    style={[
                      styles.dropdownItem,
                      isActive && { backgroundColor: cfg.color + '20' },
                    ]}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setActiveSport(sport);
                      setShowSportMenu(false);
                      scrollToSport(sport);
                    }}
                  >
                    <Ionicons
                      name={cfg.icon as keyof typeof Ionicons.glyphMap}
                      size={20}
                      color={isActive ? cfg.color : colors.textMuted}
                    />
                    <Text style={[
                      styles.dropdownLabel,
                      isActive && { color: cfg.color, fontFamily: fontFamily.semiBold },
                    ]}>
                      {cfg.label}
                    </Text>
                    {isActive && (
                      <Ionicons name="checkmark" size={20} color={cfg.color} style={{ marginLeft: 'auto' }} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Modal>
      )}

      {hasMultipleSports ? (
        <View style={{ flex: 1 }}>
          <ScrollFadeOverlay />
          <ScrollView
            ref={horizontalScrollRef}
            horizontal
            pagingEnabled={false}
            snapToInterval={PAGE_WIDTH}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            scrollEnabled={canSwipe}
            onScroll={handleHorizontalScroll}
            scrollEventThrottle={16}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: PEEK / 2 }}
          >
            {userSports.map((sport: ActiveSport) => (
              <ScrollView
                key={sport}
                style={{ width: PAGE_WIDTH, flex: 1 }}
                contentContainerStyle={styles.swipeScrollContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                onScroll={handleVerticalScroll}
                scrollEventThrottle={16}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={colors.accent1}
                  />
                }
              >
                {backendError && (
                  <ErrorState
                    message="Showing local data — unable to reach server."
                    onRetry={loadData}
                    compact
                  />
                )}
                <Animated.View style={contentFade}>
                  {sport === 'football' ? (
                    <FootballProgressContent
                      navigation={navigation}
                      streak={streak}
                      nextMilestone={nextMilestone}
                      streakProgress={streakProgress}
                      latestSleep={latestSleep}
                      sleepOptimal={sleepOptimal}
                      isFocused={isFocused}
                    />
                  ) : (
                    <PadelProgressContent
                      navigation={navigation}
                      streak={streak}
                      nextMilestone={nextMilestone}
                      streakProgress={streakProgress}
                      latestSleep={latestSleep}
                      sleepOptimal={sleepOptimal}
                      isFocused={isFocused}
                    />
                  )}
                </Animated.View>
              </ScrollView>
            ))}
          </ScrollView>

          {/* Peek overlays — cover the edge gaps when scrolled down */}
          <Animated.View
            pointerEvents="none"
            style={[
              peekOverlayStyle,
              {
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: PEEK / 2,
                backgroundColor: colors.background,
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              peekOverlayStyle,
              {
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: PEEK / 2,
                backgroundColor: colors.background,
              },
            ]}
          />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollFadeOverlay />
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.accent1}
              />
            }
            showsVerticalScrollIndicator={false}
          >
          {backendError && (
            <ErrorState
              message="Showing local data — unable to reach server."
              onRetry={loadData}
              compact
            />
          )}
          <Animated.View style={contentFade}>
            {activeSport === 'football' ? (
              <FootballProgressContent
                navigation={navigation}
                streak={streak}
                nextMilestone={nextMilestone}
                streakProgress={streakProgress}
                latestSleep={latestSleep}
                sleepOptimal={sleepOptimal}
                isFocused={isFocused}
              />
            ) : (
              <PadelProgressContent
                navigation={navigation}
                streak={streak}
                nextMilestone={nextMilestone}
                streakProgress={streakProgress}
                latestSleep={latestSleep}
                sleepOptimal={sleepOptimal}
                isFocused={isFocused}
              />
            )}
          </Animated.View>
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles factory
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    screenHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingHorizontal: SCREEN_H_MARGIN,
      paddingVertical: spacing.sm,
    },
    sportToggle: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
    },
    screenHeaderTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 24,
      color: colors.textOnDark,
    },

    // ── Sport Dropdown ──────────────────────────────────────────────
    dropdownOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-start' as const,
      paddingTop: Platform.OS === 'ios' ? 100 : 60,
      paddingHorizontal: SCREEN_H_MARGIN,
    },
    dropdownContainer: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: 14,
      overflow: 'hidden' as const,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
        android: { elevation: 8 },
      }),
    },
    dropdownItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    dropdownLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 17,
      color: colors.textOnDark,
    },

    scrollContent: {
      paddingHorizontal: SCREEN_H_MARGIN,
      paddingTop: spacing.lg,
      paddingBottom: layout.navHeight + spacing.xl,
    },
    swipeScrollContent: {
      paddingHorizontal: 8,
      paddingTop: spacing.lg,
      paddingBottom: layout.navHeight + spacing.xl,
    },

    // ── Streak Tracker ──────────────────────────────────────────────
    streakRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 20,
    },
    ringContainer: {
      position: 'relative',
      width: 96,
      height: 96,
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

    // ── Sleep Recovery ──────────────────────────────────────────────
    sleepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
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
