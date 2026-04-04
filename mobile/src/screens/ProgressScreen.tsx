/**
 * Progress Screen — Performance analytics dashboard.
 *
 * Dashboard layout: Radar + Metric Grid + 7 Pillars + Trajectories + Achievements.
 * QuickAccessBar in header. Pull-to-refresh, loading skeleton, error state.
 * Supports coach/parent read-only via targetPlayerId.
 */

import React, { useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
} from 'react-native-reanimated';
import { SkeletonCard, ErrorState } from '../components';
import { QuickAccessBar, type QuickAction } from '../components/QuickAccessBar';
import { useQuickActions } from '../hooks/useQuickActions';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { ScrollFadeOverlay } from '../components/ScrollFadeOverlay';
import { MasteryContent } from '../components/mastery/MasteryContent';
import { useMasteryData } from '../hooks/useMasteryData';
import { useMasteryTrajectory } from '../hooks/useMasteryTrajectory';
import { useMasteryAchievements } from '../hooks/useMasteryAchievements';
import { useMomentum } from '../hooks/useMomentum';
import { useAthleteSnapshot } from '../hooks/useAthleteSnapshot';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useSportContext } from '../hooks/useSportContext';
import {
  spacing,
  fontFamily,
  layout,
  borderRadius,
  animation,
} from '../theme';
import type { ThemeColors } from '../theme/colors';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, MainStackParamList } from '../navigation/types';
import { usePageConfig } from '../hooks/usePageConfig';
import { CoachNote, TomoButton } from '../components/tomo-ui';

// ── Types ────────────────────────────────────────────────────────────

type ProgressScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Progress'>,
    NativeStackNavigationProp<MainStackParamList>
  >;
  /** When provided, shows another player's progress in read-only mode */
  targetPlayerId?: string;
  /** Display name for the target player */
  targetPlayerName?: string;
};

// ── Pure helpers (kept for backward compat exports) ──────────────────

export function getStreakTier(streak: number): { label: string; emoji: string } {
  if (streak >= 90) return { label: 'Legend', emoji: '\uD83D\uDC51' };
  if (streak >= 60) return { label: 'Veteran', emoji: '\u2B50' };
  if (streak >= 30) return { label: 'Dedicated', emoji: '\uD83C\uDFC6' };
  if (streak >= 14) return { label: 'Consistent', emoji: '\uD83D\uDCAA' };
  if (streak >= 7) return { label: 'Building', emoji: '\uD83D\uDD25' };
  if (streak >= 1) return { label: 'Started', emoji: '\uD83C\uDF31' };
  return { label: 'New', emoji: '\uD83D\uDC4B' };
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

// ── Component ────────────────────────────────────────────────────────

export function ProgressScreen({
  navigation,
  targetPlayerId,
  targetPlayerName,
}: ProgressScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pageConfig = usePageConfig('mastery');
  const { profile } = useAuth();
  const { needsCheckin, isStale, checkinAgeHours } = useCheckinStatus();
  const isFocused = useIsFocused();

  // Primary data
  const {
    data: masteryData,
    loading: isLoading,
    error: masteryError,
    refresh,
  } = useMasteryData(targetPlayerId);

  // Athlete snapshot for readiness score + TIS
  const { snapshot } = useAthleteSnapshot(targetPlayerId);
  const readinessScore = snapshot?.readiness_score ?? 75;
  const tisScore = (snapshot as any)?.tomo_intelligence_score ?? null;

  // Secondary data (loads independently — won't block primary render)
  const {
    data: trajectoryData,
    refresh: refreshTrajectory,
  } = useMasteryTrajectory(6, targetPlayerId);

  const {
    data: achievementsData,
    refresh: refreshAchievements,
  } = useMasteryAchievements(20, targetPlayerId);

  const {
    data: momentumData,
    refresh: refreshMomentum,
  } = useMomentum(30, targetPlayerId);

  // Sport context for position label
  const sportCtx = useSportContext();
  const playerName = profile?.name?.split(' ')[0] || 'Athlete';

  // Dynamic coach message based on readiness
  const coachMessage = useMemo(() => {
    if (readinessScore >= 80) return `Your sleep was solid and yesterday's load was moderate. Push hard today — your body can take it.`;
    if (readinessScore >= 60) return `You're in a good place. Moderate intensity today — save the big efforts for later this week.`;
    if (readinessScore >= 40) return `Your body needs a lighter session today. Focus on technique and mobility work.`;
    return `Recovery is just as important as training. Rest up, stretch, and come back stronger tomorrow.`;
  }, [readinessScore]);

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refresh(),
      refreshTrajectory(),
      refreshAchievements(),
      refreshMomentum(),
    ]);
    setRefreshing(false);
  }, [refresh, refreshTrajectory, refreshAchievements, refreshMomentum]);

  // Navigate to AI Chat with pre-filled prompt
  const askTomo = useCallback((prompt: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('FullChat', { preloadMessage: prompt });
  }, [navigation]);

  // Content fade-in (skip focus check for external/embedded views)
  const isExternalView = !!targetPlayerId;
  const contentOpacity = useSharedValue(isExternalView ? 1 : 0);
  const contentFade = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
  useEffect(() => {
    if (isExternalView) {
      if (!isLoading) {
        contentOpacity.value = withTiming(1, { duration: 400 });
      }
    } else if (!isLoading && isFocused) {
      contentOpacity.value = 0;
      contentOpacity.value = withTiming(1, { duration: 600 });
    } else if (!isFocused) {
      contentOpacity.value = 0;
    }
  }, [isLoading, isFocused, isExternalView]);

  // Navigate to My Metrics (Output tab) to record tests
  const goToMyMetrics = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Test' as any, { initialTab: 'metrics' });
  }, [navigation]);

  // QuickAccessBar actions — page-specific + favorites + more
  const quickActions = useQuickActions(
    { key: 'metrics', icon: 'stats-chart-outline', label: 'My Metrics', onPress: goToMyMetrics, accentColor: colors.accent1 },
    navigation,
  );

  // Shared header (matches Timeline & Output screens)
  const renderHeader = () => (
    <View style={styles.headerArea}>
      {!isExternalView ? (
        <QuickAccessBar actions={quickActions} />
      ) : (
        <Text style={[styles.externalLabel, { color: colors.textMuted }]}>
          {(targetPlayerName || 'Player').toUpperCase()} · {(pageConfig?.metadata?.pageTitle || 'MASTERY').toUpperCase()}
        </Text>
      )}
      <View style={styles.headerRight}>
        <CheckinHeaderButton needsCheckin={needsCheckin} isStale={isStale} checkinAgeHours={checkinAgeHours} onPress={() => navigation.navigate('Checkin' as any)} />
        <NotificationBell />
        <HeaderProfileButton
          initial={profile?.name?.charAt(0)?.toUpperCase() || '?'}
          photoUrl={profile?.photoUrl}
        />
      </View>
    </View>
  );

  // Wrapper: use SafeAreaView for own screen, plain View for embedded
  const Wrapper = isExternalView ? View : SafeAreaView;
  const wrapperProps = isExternalView ? { style: styles.container } : { style: styles.container, edges: ['top'] as const };

  // ── Loading state ──
  if (isLoading) {
    return (
      <Wrapper {...wrapperProps as any}>
        {!isExternalView && renderHeader()}
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ScrollView>
      </Wrapper>
    );
  }

  // ── Error state ──
  if (masteryError && !masteryData) {
    return (
      <Wrapper {...wrapperProps as any}>
        {!isExternalView && renderHeader()}
        <View style={{ flex: 1, justifyContent: 'center', padding: layout.screenMargin }}>
          <ErrorState
            message="Could not load mastery data. Pull to retry."
            onRetry={refresh}
          />
        </View>
      </Wrapper>
    );
  }

  return (
    <Wrapper {...wrapperProps as any}>
      {!isExternalView && renderHeader()}

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
          keyboardShouldPersistTaps="handled"
        >
          {masteryError && (
            <ErrorState
              message="Showing cached data — unable to reach server."
              onRetry={refresh}
              compact
            />
          )}
          <Animated.View style={contentFade}>
            {/* ── Coach Greeting ── */}
            {!isExternalView && (
              <Animated.View
                entering={FadeIn.delay(animation.stagger.default).duration(animation.duration.normal)}
                style={styles.coachGreeting}
              >
                <Text style={styles.greetingText}>
                  Hey <Text style={styles.greetingName}>{playerName}</Text>,
                </Text>
                <Text style={styles.greetingSubtitle}>
                  here's your mastery playbook
                </Text>
              </Animated.View>
            )}

            {/* ── Coach Readiness Note ── */}
            {!isExternalView && (
              <View style={styles.coachNoteWrap}>
                <CoachNote
                  readinessScore={readinessScore}
                  coachMessage={coachMessage}
                  enterIndex={1}
                />
              </View>
            )}

            {/* ── Dashboard + Pillars + Trajectories + Achievements ── */}
            {masteryData && (
              <MasteryContent
                data={masteryData}
                tisScore={tisScore}
                momentum={momentumData}
                trajectoryData={trajectoryData}
                achievements={achievementsData}
                onRecordTests={goToMyMetrics}
                onAttributeTap={(key) => {
                  if (Platform.OS !== 'web')
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                onAskTomo={askTomo}
              />
            )}
          </Animated.View>
        </ScrollView>
      </View>
    </Wrapper>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerArea: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },
    externalLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      letterSpacing: 1.2,
    },
    headerRight: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
    },
    scrollContent: {
      paddingTop: spacing.lg,
      paddingBottom: layout.navHeight + spacing.xl,
    },
    coachGreeting: {
      paddingHorizontal: layout.screenMargin,
      marginBottom: spacing.md,
    },
    greetingText: {
      fontFamily: fontFamily.display,
      fontSize: 28,
      lineHeight: 34,
      color: colors.textPrimary,
    },
    greetingName: {
      color: colors.electricGreen,
    },
    greetingSubtitle: {
      fontFamily: fontFamily.note,
      fontSize: 15,
      color: colors.chalkDim,
      marginTop: 2,
    },
    coachNoteWrap: {
      paddingHorizontal: layout.screenMargin,
      marginBottom: spacing.lg,
    },
  });
}
