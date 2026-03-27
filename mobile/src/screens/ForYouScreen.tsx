/**
 * Own It Screen — AI-powered personalized recommendations.
 *
 * Single scrollable page:
 *   Sports recs   — READINESS, LOAD_WARNING, RECOVERY, DEVELOPMENT, MOTIVATION
 *   Study recs    — ACADEMIC
 *   Updates       — CV_OPPORTUNITY, TRIANGLE_ALERT
 *
 * Data: GET /api/v1/snapshot + GET /api/v1/recommendations (parallel, ~100ms)
 * Deep Refresh: POST /api/v1/recommendations/refresh (Claude analysis, 10-30s)
 */

import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { SkeletonCard, ErrorState } from '../components';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { QuickAccessBar } from '../components/QuickAccessBar';
import { useQuickActions } from '../hooks/useQuickActions';
import { ScrollFadeOverlay } from '../components/ScrollFadeOverlay';
import { TimeSection } from '../components/ownit';
import type { ForYouRecommendation } from '../components/ownit';
import type { RIERecommendation } from '../services/api';
import { useOwnItData } from '../hooks/useOwnItData';
import { useOutputData } from '../hooks/useOutputData';
import { StrengthsGrowthCard } from '../components/shared/StrengthsGrowthCard';
import { usePageConfig } from '../hooks/usePageConfig';
import { useTheme } from '../hooks/useTheme';
import {
  spacing,
  fontFamily,
  layout,
} from '../theme';

// ── Map RIE rec → RecCard shape ──────────────────────────────────────
function toCardRec(r: RIERecommendation): ForYouRecommendation {
  // Extract action from context (stored by deepRecRefresh)
  const action = (r.context as Record<string, unknown>)?.action as ForYouRecommendation['action'] | undefined;

  return {
    recType: r.recType as any,
    priority: r.priority,
    title: r.title,
    bodyShort: r.bodyShort,
    bodyLong: r.bodyLong || '',
    confidence: r.confidenceScore,
    evidenceBasis: r.evidenceBasis,
    context: r.context,
    action,
    recId: r.recId,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    retrievedChunkIds: r.retrievedChunkIds,
  };
}

// ── Dynamic loading messages — matches My Programs pattern ──
const OWN_IT_LOADING_MESSAGES = [
  { title: 'Reading Your Readiness', subtitle: 'Sleep, energy, soreness, mood...', icon: 'pulse-outline' as const },
  { title: 'Analyzing Training Load', subtitle: 'Checking acute vs chronic workload...', icon: 'barbell-outline' as const },
  { title: 'Scanning Recovery Data', subtitle: 'HRV, sleep quality, rest days...', icon: 'moon-outline' as const },
  { title: 'Checking Benchmarks', subtitle: 'Comparing your results to peers...', icon: 'stats-chart-outline' as const },
  { title: 'Reviewing Your Schedule', subtitle: 'Upcoming matches, exams, training...', icon: 'calendar-outline' as const },
  { title: 'Spotting Development Gaps', subtitle: 'Finding areas to improve fastest...', icon: 'search-outline' as const },
  { title: 'Building Recommendations', subtitle: 'Personalizing advice to your data...', icon: 'sparkles-outline' as const },
  { title: 'Prioritizing Actions', subtitle: 'What matters most right now...', icon: 'flash-outline' as const },
  { title: 'Factoring Growth Stage', subtitle: 'Adjusting for your maturity phase...', icon: 'trending-up-outline' as const },
  { title: 'Final Personalization', subtitle: 'Tailoring everything to you...', icon: 'person-outline' as const },
];

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function ForYouScreen() {
  const { colors } = useTheme();
  const pageConfig = usePageConfig('own_it');
  const navigation = useNavigation<any>();
  const { needsCheckin, isStale, checkinAgeHours } = useCheckinStatus();
  const {
    snapshot,
    sportsRecs,
    studyRecs,
    updateRecs,
    isLoading,
    error,
    refreshing,
    isDeepRefreshing,
    onRefresh,
    forceRefresh,
    refreshError,
  } = useOwnItData();
  const quickActions = useQuickActions(
    { key: 'refresh', icon: 'refresh-outline', label: 'Refresh', onPress: forceRefresh, accentColor: colors.accent2 },
    navigation,
  );

  const { data: outputData } = useOutputData();
  const strengths = outputData?.metrics?.strengths ?? [];
  const gaps = outputData?.metrics?.gaps ?? [];

  // ── Dynamic loading message rotation (2.5s interval, reshuffles each cycle) ──
  const [shuffledMsgs, setShuffledMsgs] = useState(() => shuffleArray(OWN_IT_LOADING_MESSAGES));
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);

  useEffect(() => {
    if (!isDeepRefreshing) return;
    setShuffledMsgs(shuffleArray(OWN_IT_LOADING_MESSAGES));
    setLoadingMsgIndex(0);
    const interval = setInterval(() => {
      setLoadingMsgIndex(prev => {
        const next = prev + 1;
        if (next >= OWN_IT_LOADING_MESSAGES.length) {
          setShuffledMsgs(shuffleArray(OWN_IT_LOADING_MESSAGES));
          return 0;
        }
        return next;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [isDeepRefreshing]);

  const allCards = [...sportsRecs, ...studyRecs, ...updateRecs].map(toCardRec);

  // Group by time horizon: Today (P1-P2), Tomorrow (P3-P4)
  const todayCards = allCards.filter((r) => r.priority <= 2);
  const tomorrowCards = allCards.filter((r) => r.priority >= 3);

  const hasAnyContent = snapshot || allCards.length > 0;
  const hasAnyRecs = allCards.length > 0;

  // ── Action handler — deep-links rec CTA to in-app screens ──
  const handleRecAction = useCallback((route: string, params?: Record<string, unknown>) => {
    navigation.navigate(route as any, params);
  }, [navigation]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* ── Header ── */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          paddingHorizontal: layout.screenMargin,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
        }}
      >
        {/* Left — QuickAccessBar */}
        <QuickAccessBar actions={quickActions} />

        {/* Right — Actions */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <CheckinHeaderButton needsCheckin={needsCheckin} isStale={isStale} checkinAgeHours={checkinAgeHours} onPress={() => navigation.navigate('Checkin' as any)} />
          <NotificationBell />
          <HeaderProfileButton />
        </View>
      </View>

      {/* ── Content ── */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent1}
          />
        }
      >
        <ScrollFadeOverlay />

        {/* Loading State */}
        {isLoading && !hasAnyContent && (
          <View style={{ paddingHorizontal: layout.screenMargin, gap: spacing.md, marginTop: spacing.md }}>
            <SkeletonCard style={{ height: 180 }} />
            <SkeletonCard style={{ height: 100 }} />
            <SkeletonCard style={{ height: 100 }} />
          </View>
        )}

        {/* Error State */}
        {error && !hasAnyContent && (
          <ErrorState message={error} onRetry={onRefresh} />
        )}

        {/* Deep Refresh Loading — dynamic rotating messages */}
        {isDeepRefreshing && !hasAnyRecs && !isLoading && (() => {
          const loadingMsg = shuffledMsgs[loadingMsgIndex] || OWN_IT_LOADING_MESSAGES[0];
          return (
            <View
              style={{
                alignItems: 'center',
                paddingVertical: spacing.xxl,
                gap: spacing.sm,
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.accent2 + '12',
                  marginBottom: spacing.xs,
                }}
              >
                <Ionicons name={loadingMsg.icon} size={28} color={colors.accent2} />
              </View>
              <Text
                style={{
                  fontFamily: fontFamily.semiBold,
                  fontSize: 16,
                  color: colors.textOnDark,
                  textAlign: 'center',
                }}
              >
                {loadingMsg.title}
              </Text>
              <Text
                style={{
                  fontFamily: fontFamily.regular,
                  fontSize: 13,
                  color: colors.textMuted,
                  textAlign: 'center',
                  paddingHorizontal: spacing.lg,
                  lineHeight: 19,
                }}
              >
                {loadingMsg.subtitle}
              </Text>
            </View>
          );
        })()}

        {/* Refresh Error */}
        {refreshError && !isDeepRefreshing && !hasAnyRecs && (
          <View
            style={{
              alignItems: 'center',
              paddingVertical: spacing.xl,
              paddingHorizontal: spacing.xxl,
              gap: spacing.sm,
            }}
          >
            <Ionicons name="warning-outline" size={32} color={colors.textMuted} />
            <Text
              style={{
                fontFamily: fontFamily.medium,
                fontSize: 13,
                color: colors.textMuted,
                textAlign: 'center',
              }}
            >
              {refreshError}
            </Text>
          </View>
        )}

        {/* Subtle updating banner when recs exist but refresh is running */}
        {isDeepRefreshing && hasAnyRecs && (() => {
          const bannerMsg = shuffledMsgs[loadingMsgIndex] || OWN_IT_LOADING_MESSAGES[0];
          return (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: spacing.md,
                marginHorizontal: layout.screenMargin,
                backgroundColor: 'rgba(0, 217, 255, 0.08)',
              }}
            >
              <Ionicons name={bannerMsg.icon} size={16} color={colors.accent2} />
              <Text
                style={{
                  fontFamily: fontFamily.medium,
                  fontSize: 13,
                  color: colors.accent2,
                }}
              >
                {bannerMsg.title}...
              </Text>
            </View>
          );
        })()}

        {/* Strengths & Growth Areas — from benchmark profile */}
        {(strengths.length > 0 || gaps.length > 0) && (
          <View style={{ paddingHorizontal: layout.screenMargin, marginTop: spacing.md }}>
            <StrengthsGrowthCard strengths={strengths} gaps={gaps} />
          </View>
        )}

        {/* Main Content */}
        {hasAnyContent && (
          <>
            {/* Today — Urgent + Important (P1-P2) */}
            <TimeSection
              title="Today"
              icon="flash-outline"
              color={colors.accent1}
              recs={todayCards}
              defaultExpanded={true}
              indexOffset={0}
              onAction={handleRecAction}
            />

            {/* Tomorrow & Ahead (P3-P4) */}
            <TimeSection
              title="Tomorrow"
              icon="calendar-outline"
              color={colors.accent2}
              recs={tomorrowCards}
              defaultExpanded={true}
              indexOffset={todayCards.length}
              onAction={handleRecAction}
            />
          </>
        )}

        {/* Empty State — new user */}
        {!isLoading && !hasAnyContent && !error && !isDeepRefreshing && (
          <View
            style={{
              alignItems: 'center',
              paddingTop: 80,
              paddingHorizontal: spacing.xxl,
            }}
          >
            <Ionicons name="star-outline" size={48} color={colors.textMuted} />
            <Text
              style={{
                fontFamily: fontFamily.semiBold,
                fontSize: 18,
                color: colors.textOnDark,
                marginTop: spacing.md,
                textAlign: 'center',
              }}
            >
              {pageConfig?.metadata?.pageTitle || 'Your Recommendations'}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.regular,
                fontSize: 13,
                color: colors.textMuted,
                marginTop: spacing.sm,
                textAlign: 'center',
                lineHeight: 20,
              }}
            >
              Tap the refresh button to generate personalized sports and study recommendations powered by AI.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
