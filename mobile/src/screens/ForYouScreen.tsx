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

import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
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
import { RecSection } from '../components/ownit';
import type { ForYouRecommendation } from '../components/ownit';
import type { RIERecommendation } from '../services/api';
import { useOwnItData } from '../hooks/useOwnItData';
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

  const sportsCards = sportsRecs.map(toCardRec);
  const studyCards = studyRecs.map(toCardRec);
  const updateCards = updateRecs.map(toCardRec);

  const hasAnyContent = snapshot || sportsRecs.length > 0 || studyRecs.length > 0 || updateRecs.length > 0;
  const hasAnyRecs = sportsRecs.length > 0 || studyRecs.length > 0 || updateRecs.length > 0;

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

        {/* Deep Refresh Loading — analyzing data */}
        {isDeepRefreshing && !hasAnyRecs && !isLoading && (
          <View
            style={{
              alignItems: 'center',
              paddingVertical: spacing.xxl,
              gap: spacing.md,
            }}
          >
            <ActivityIndicator size="large" color={colors.accent1} />
            <Text
              style={{
                fontFamily: fontFamily.medium,
                fontSize: 14,
                color: colors.textMuted,
                textAlign: 'center',
              }}
            >
              Analyzing your data...
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.regular,
                fontSize: 12,
                color: colors.textMuted,
                textAlign: 'center',
                paddingHorizontal: spacing.xxl,
              }}
            >
              Building personalized recommendations from your training, health, and academic data.
            </Text>
          </View>
        )}

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

        {/* Subtle updating indicator when recs exist but refresh is running */}
        {isDeepRefreshing && hasAnyRecs && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
              paddingVertical: spacing.sm,
            }}
          >
            <ActivityIndicator size="small" color={colors.accent2} />
            <Text
              style={{
                fontFamily: fontFamily.medium,
                fontSize: 11,
                color: colors.textMuted,
              }}
            >
              Updating...
            </Text>
          </View>
        )}

        {/* Main Content */}
        {hasAnyContent && (
          <>
            {/* Sports Recommendations */}
            <RecSection
              title={pageConfig?.metadata?.tabLabels?.['sports'] || "Sports"}
              icon="fitness-outline"
              color={colors.accent1}
              recs={sportsCards}
              emptyMessage={snapshot ? (pageConfig?.metadata?.emptyStates?.['sports'] || 'No active sports recommendations') : undefined}
              indexOffset={0}
              onAction={handleRecAction}
            />

            {/* Study Recommendations */}
            <RecSection
              title={pageConfig?.metadata?.tabLabels?.['study'] || "Study"}
              icon="school-outline"
              color={colors.accent2}
              recs={studyCards}
              emptyMessage={snapshot ? (pageConfig?.metadata?.emptyStates?.['study'] || 'No active study recommendations') : undefined}
              indexOffset={sportsCards.length}
              onAction={handleRecAction}
            />

            {/* Updates (CV, Triangle) — only if present */}
            <RecSection
              title={pageConfig?.metadata?.tabLabels?.['updates'] || "Updates"}
              icon="bulb-outline"
              color={colors.info}
              recs={updateCards}
              indexOffset={sportsCards.length + studyCards.length}
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
