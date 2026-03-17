/**
 * Progress Screen — Sport-agnostic mastery view.
 *
 * DNACard hero + 7 mastery pillar cards with dual-layer benchmarks.
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
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { SkeletonCard, ErrorState } from '../components';
import { QuickAccessBar, type QuickAction } from '../components/QuickAccessBar';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { ScrollFadeOverlay } from '../components/ScrollFadeOverlay';
import { MasteryContent } from '../components/mastery/MasteryContent';
import { useMasteryData } from '../hooks/useMasteryData';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import {
  spacing,
  fontFamily,
  layout,
  borderRadius,
} from '../theme';
import type { ThemeColors } from '../theme/colors';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, MainStackParamList } from '../navigation/types';

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
  const { profile } = useAuth();
  const { needsCheckin } = useCheckinStatus();
  const isFocused = useIsFocused();

  const {
    data: masteryData,
    loading: isLoading,
    error: masteryError,
    refresh,
  } = useMasteryData(targetPlayerId);

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

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

  // Navigate to My Metrics (Output tab) to record tests
  const goToMyMetrics = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Test' as any, { initialTab: 'metrics' });
  }, [navigation]);

  // QuickAccessBar actions (matches Timeline & Output pattern)
  const quickActions: QuickAction[] = useMemo(
    () => [
      {
        key: 'record',
        icon: 'stats-chart-outline',
        label: 'Record Tests',
        onPress: goToMyMetrics,
        accentColor: colors.accent1,
      },
      {
        key: 'compare',
        icon: 'git-compare-outline',
        label: 'Compare',
        onPress: () => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // TODO: Navigate to comparison screen
        },
      },
      {
        key: 'more',
        icon: 'ellipsis-horizontal',
        label: 'More',
        onPress: () => {},
      },
    ],
    [colors.accent1, navigation, goToMyMetrics],
  );

  const isExternalView = !!targetPlayerId;

  // Shared header (matches Timeline & Output screens)
  const renderHeader = () => (
    <View style={styles.headerArea}>
      {!isExternalView ? (
        <QuickAccessBar actions={quickActions} />
      ) : (
        <Text style={[styles.externalLabel, { color: colors.textMuted }]}>
          {(targetPlayerName || 'Player').toUpperCase()} · MASTERY
        </Text>
      )}
      <View style={styles.headerRight}>
        <CheckinHeaderButton needsCheckin={needsCheckin} onPress={() => navigation.navigate('Checkin' as any)} />
        <NotificationBell />
        <HeaderProfileButton
          initial={profile?.name?.charAt(0)?.toUpperCase() || '?'}
          photoUrl={profile?.photoUrl}
        />
      </View>
    </View>
  );

  // ── Loading state ──
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Error state ──
  if (masteryError && !masteryData) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}
        <View style={{ flex: 1, justifyContent: 'center', padding: layout.screenMargin }}>
          <ErrorState
            message="Could not load mastery data. Pull to retry."
            onRetry={refresh}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Header ── */}
      {renderHeader()}

      {/* ── Content ── */}
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
            {masteryData && (
              <MasteryContent
                data={masteryData}
                onRecordTests={goToMyMetrics}
                onAttributeTap={(key) => {
                  // Future: navigate to attribute detail
                  if (Platform.OS !== 'web')
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              />
            )}
          </Animated.View>
        </ScrollView>
      </View>
    </SafeAreaView>
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
  });
}
