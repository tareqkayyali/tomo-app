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
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import { SkeletonCard, ErrorState } from '../components';
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
import { usePadelProgress } from '../hooks/usePadelProgress';
import { ShotRatingBar } from '../components/ShotRatingBar';
import { SHOT_DEFINITIONS } from '../services/padelDefinitions';
import { getPadelLevel } from '../services/padelCalculations';
import type { ShotType } from '../types/padel';
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
// Padel Progress Content
// ---------------------------------------------------------------------------

function PadelProgressContent({
  navigation,
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
  const { shotRatings, isLoading: padelLoading, hasData } = usePadelProgress();

  if (padelLoading) {
    return (
      <>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </>
    );
  }

  if (!hasData || !shotRatings) {
    return (
      <EmptyProgressState
        sport="padel"
        onLogSession={() => navigation.navigate('Plan' as any)}
        onTakeTest={() => navigation.navigate('ShotSession' as any)}
      />
    );
  }

  const mastery = shotRatings.overallShotMastery;
  const level = getPadelLevel(mastery * 10); // scale 0-100 → 0-1000 range
  const shotTypes = Object.keys(shotRatings.shots) as ShotType[];

  return (
    <>
      {/* ── Overall Shot Mastery Card ── */}
      <View style={{
        backgroundColor: colors.backgroundElevated,
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
      }}>
        <Text style={{
          fontFamily: fontFamily.medium,
          fontSize: 13,
          color: colors.textMuted,
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginBottom: 12,
        }}>
          Shot Mastery
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
          <Text style={{
            fontFamily: fontFamily.bold,
            fontSize: 48,
            color: colors.textHeader,
          }}>
            {mastery}
          </Text>
          <Text style={{
            fontFamily: fontFamily.medium,
            fontSize: 16,
            color: colors.textMuted,
            marginLeft: 6,
          }}>
            / 100
          </Text>
        </View>

        <Text style={{
          fontFamily: fontFamily.regular,
          fontSize: 14,
          color: colors.textInactive,
          marginBottom: 8,
        }}>
          {level} · {shotRatings.shotVarietyIndex}% shot variety
        </Text>

        {/* Mini stats row */}
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
          <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: 12 }}>
            <Text style={{ fontFamily: fontFamily.medium, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Strongest
            </Text>
            <Text style={{ fontFamily: fontFamily.semiBold, fontSize: 15, color: '#30D158', marginTop: 2 }}>
              {SHOT_DEFINITIONS[shotRatings.strongestShot]?.name ?? shotRatings.strongestShot}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: 12 }}>
            <Text style={{ fontFamily: fontFamily.medium, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Focus Area
            </Text>
            <Text style={{ fontFamily: fontFamily.semiBold, fontSize: 15, color: '#FF6B35', marginTop: 2 }}>
              {SHOT_DEFINITIONS[shotRatings.weakestShot]?.name ?? shotRatings.weakestShot}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Individual Shots ── */}
      <View style={{
        backgroundColor: colors.backgroundElevated,
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
      }}>
        <Text style={{
          fontFamily: fontFamily.medium,
          fontSize: 13,
          color: colors.textMuted,
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          All Shots
        </Text>

        {shotTypes.map((shotType, i) => {
          const def = SHOT_DEFINITIONS[shotType];
          const data = shotRatings.shots[shotType];
          if (!def || !data) return null;
          return (
            <ShotRatingBar
              key={shotType}
              definition={def}
              data={data}
              index={i}
              onPress={() =>
                navigation.navigate('ShotDetail', { shotType })
              }
            />
          );
        })}
      </View>
    </>
  );
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
