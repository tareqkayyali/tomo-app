/**
 * Own It Screen — RIE-powered personalized recommendations.
 *
 * Single scrollable page:
 *   ReadinessHero — snapshot-driven readiness state
 *   Sports recs   — READINESS, LOAD_WARNING, RECOVERY, DEVELOPMENT, MOTIVATION
 *   Study recs    — ACADEMIC
 *   Updates       — CV_OPPORTUNITY, TRIANGLE_ALERT
 *
 * Data: GET /api/v1/snapshot + GET /api/v1/recommendations (parallel, ~100ms)
 */

import React from 'react';
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
import { QuickAccessBar } from '../components/QuickAccessBar';
import { ScrollFadeOverlay } from '../components/ScrollFadeOverlay';
import { ReadinessHero, RecSection } from '../components/ownit';
import type { ForYouRecommendation } from '../components/ownit';
import type { RIERecommendation } from '../services/api';
import { useOwnItData } from '../hooks/useOwnItData';
import { useTheme } from '../hooks/useTheme';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import {
  spacing,
  fontFamily,
  layout,
} from '../theme';

// ── Weekday helper ───────────────────────────────────────────────────
const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
function getWeekday() {
  return WEEKDAYS[new Date().getDay()];
}

// ── Map RIE rec → RecCard shape ──────────────────────────────────────
function toCardRec(r: RIERecommendation): ForYouRecommendation {
  return {
    recType: r.recType as any,
    priority: r.priority,
    title: r.title,
    bodyShort: r.bodyShort,
    bodyLong: r.bodyLong || '',
    confidence: r.confidenceScore,
    evidenceBasis: r.evidenceBasis,
    context: r.context,
    recId: r.recId,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    retrievedChunkIds: r.retrievedChunkIds,
  };
}

export function ForYouScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const { needsCheckin } = useCheckinStatus();
  const {
    snapshot,
    sportsRecs,
    studyRecs,
    updateRecs,
    isLoading,
    error,
    refreshing,
    onRefresh,
  } = useOwnItData();

  const sportsCards = sportsRecs.map(toCardRec);
  const studyCards = studyRecs.map(toCardRec);
  const updateCards = updateRecs.map(toCardRec);

  const hasAnyContent = snapshot || sportsRecs.length > 0 || studyRecs.length > 0 || updateRecs.length > 0;

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
        {/* Left — Title */}
        <View>
          <Text
            style={{
              fontFamily: fontFamily.medium,
              fontSize: 11,
              color: colors.textMuted,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            TOMO · {getWeekday()}
          </Text>
          <Text
            style={{
              fontFamily: fontFamily.bold,
              fontSize: 24,
              color: colors.textOnDark,
              marginTop: 2,
            }}
          >
            Own It
          </Text>
        </View>

        {/* Right — Actions */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <CheckinHeaderButton needsCheckin={needsCheckin} onPress={() => navigation.navigate('Checkin' as any)} />
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

        {/* Main Content */}
        {hasAnyContent && (
          <>
            {/* Readiness Hero */}
            <ReadinessHero snapshot={snapshot} />

            {/* Sports Recommendations */}
            <RecSection
              title="Sports"
              icon="fitness-outline"
              color={colors.accent1}
              recs={sportsCards}
              emptyMessage={snapshot ? 'No active sports recommendations' : undefined}
              indexOffset={0}
            />

            {/* Study Recommendations */}
            <RecSection
              title="Study"
              icon="school-outline"
              color={colors.accent2}
              recs={studyCards}
              emptyMessage={snapshot ? 'No active study recommendations' : undefined}
              indexOffset={sportsCards.length}
            />

            {/* Updates (CV, Triangle) — only if present */}
            <RecSection
              title="Updates"
              icon="bulb-outline"
              color="#7B61FF"
              recs={updateCards}
              indexOffset={sportsCards.length + studyCards.length}
            />
          </>
        )}

        {/* Empty State — new user */}
        {!isLoading && !hasAnyContent && !error && (
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
              Your Recommendations
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
              Check in and log sessions to get personalized sports and study recommendations powered by science.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
