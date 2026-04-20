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
  Pressable,
} from 'react-native';
import { SmartIcon } from '../components/SmartIcon';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SkeletonCard, ErrorState } from '../components';
import { animation } from '../theme/spacing';
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
  borderRadius,
} from '../theme';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../hooks/useAuth';
import { apiRequest } from '../services/api';
import type { NotificationData } from '../components/notifications/NotificationCard';
import { CATEGORY_CONFIG } from '../components/notifications/constants';

import { colors } from '../theme/colors';

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

function timeAgoShort(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function LatestNotificationsCard({ navigation, refreshKey }: { navigation: any; refreshKey?: number }) {
  const { colors } = useTheme();
  const { centerUnreadCount } = useNotifications();
  const { profile } = useAuth();
  const [items, setItems] = React.useState<NotificationData[]>([]);
  const [fetchError, setFetchError] = React.useState(false);

  React.useEffect(() => {
    if (!profile) return;
    setFetchError(false);
    apiRequest<{ notifications: NotificationData[] }>('/api/v1/notifications?source=center&limit=20')
      .then((res) => {
        const now = Date.now();
        // Time-sensitive types: show only within N minutes of creation
        // BEDTIME_REMINDER fires 30 min before bedtime — 30 min window drops it exactly at bedtime
        const FRESH_WINDOW_MS: Record<string, number> = {
          BEDTIME_REMINDER: 30 * 60 * 1000,
          PRE_MATCH_SLEEP_IMPORTANCE: 30 * 60 * 1000,
          SESSION_STARTING_SOON: 35 * 60 * 1000,
        };
        const filtered = (res.notifications ?? [])
          .filter(n => {
            // Only show active notifications (not acted-on or dismissed)
            if (!['unread', 'read'].includes(n.status)) return false;
            // Drop notifications that have passed their expiry
            if (n.expires_at && new Date(n.expires_at).getTime() <= now) return false;
            // Time-sensitive types: drop if past their relevance window
            const freshWindow = FRESH_WINDOW_MS[n.type];
            if (freshWindow !== undefined) {
              const age = now - new Date(n.created_at).getTime();
              if (age > freshWindow) return false;
            }
            // Drop notifications older than 48h with no expiry (general cleanup)
            const age = now - new Date(n.created_at).getTime();
            if (!n.expires_at && age > 48 * 3600 * 1000) return false;
            return true;
          })
          .sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          })
          .slice(0, 3);
        setItems(filtered);
      })
      .catch((err) => {
        console.error('[LatestNotificationsCard] fetch error:', err);
        setFetchError(true);
      });
  }, [profile?.id, refreshKey]);

  if (fetchError || items.length === 0) return null;

  // Sort: critical first, then by created_at desc
  const sorted = [...items].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <Pressable
      onPress={() => navigation.navigate('Notifications')}
      style={({ pressed }) => ({
        marginHorizontal: layout.screenMargin,
        marginTop: spacing.md,
        borderRadius: borderRadius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: sorted[0]?.category === 'critical' ? colors.secondaryMuted : 'rgba(245,243,237,0.07)',
        borderLeftWidth: 3,
        borderLeftColor: CATEGORY_CONFIG[sorted[0]?.category as keyof typeof CATEGORY_CONFIG]?.color ?? colors.accent1,
        padding: spacing.md,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <SmartIcon name="notifications-outline" size={14} color={colors.textSecondary} />
          <Text style={{ fontFamily: fontFamily.semiBold, fontSize: 12, color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Notifications
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {centerUnreadCount > 0 && (
            <View style={{ backgroundColor: colors.accent1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontFamily: fontFamily.bold, fontSize: 11, color: colors.textPrimary }}>{centerUnreadCount > 99 ? '99+' : centerUnreadCount}</Text>
            </View>
          )}
          <SmartIcon name="chevron-forward" size={14} color={colors.textSecondary} />
        </View>
      </View>

      {/* Notification rows */}
      {sorted.map((n, i) => {
        const cat = CATEGORY_CONFIG[n.category as keyof typeof CATEGORY_CONFIG] ?? CATEGORY_CONFIG.system;
        return (
          <View
            key={n.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              paddingVertical: spacing.xs,
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: 'rgba(245,243,237,0.05)',
            }}
          >
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: cat.color + '20', justifyContent: 'center', alignItems: 'center' }}>
              <SmartIcon name={cat.icon} size={13} color={cat.color} />
            </View>
            <Text style={{ flex: 1, fontFamily: fontFamily.medium, fontSize: 13, color: colors.textPrimary }} numberOfLines={1}>
              {n.title}
            </Text>
            <Text style={{ fontFamily: fontFamily.regular, fontSize: 11, color: colors.textSecondary }}>
              {timeAgoShort(n.created_at)}
            </Text>
          </View>
        );
      })}
    </Pressable>
  );
}

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

  const { profile } = useAuth();
  const playerName = profile?.name?.split(' ')[0] || 'Athlete';
  const { data: outputData } = useOutputData();
  const strengths = outputData?.metrics?.strengths ?? [];
  const gaps = outputData?.metrics?.gaps ?? [];

  // ── Notification refresh counter — increments on each page refresh ──
  const [notifRefreshKey, setNotifRefreshKey] = useState(0);
  useEffect(() => {
    if (!refreshing) setNotifRefreshKey(k => k + 1);
  }, [refreshing]);

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
    <PlayerScreen
      label="FOR YOU"
      title="Recommended"
      onBack={() => navigation.goBack()}
      scrollProps={{
        keyboardShouldPersistTaps: 'handled',
        refreshControl: (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent1}
          />
        ),
      }}
    >
        <ScrollFadeOverlay />

        {/* ── Coach Greeting ── */}
        <Animated.View
          entering={FadeIn.delay(animation.stagger.default).duration(animation.duration.normal)}
          style={{ paddingHorizontal: layout.screenMargin, marginTop: spacing.md, marginBottom: spacing.md }}
        >
          <Text style={{ fontFamily: fontFamily.display, fontSize: 28, lineHeight: 34, color: colors.textPrimary }}>
            Hey <Text style={{ color: colors.electricGreen }}>{playerName}</Text>,
          </Text>
          <Text style={{ fontFamily: fontFamily.note, fontSize: 15, color: colors.chalkDim, marginTop: 2 }}>
            here's what matters today
          </Text>
        </Animated.View>

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
                  backgroundColor: colors.accent + '12',
                  marginBottom: spacing.xs,
                }}
              >
                <SmartIcon name={loadingMsg.icon} size={28} color={colors.accent} />
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
            <SmartIcon name="warning-outline" size={32} color={colors.textMuted} />
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
                backgroundColor: colors.accentSubtle,
              }}
            >
              <SmartIcon name={bannerMsg.icon} size={16} color={colors.accent} />
              <Text
                style={{
                  fontFamily: fontFamily.medium,
                  fontSize: 13,
                  color: colors.accent,
                }}
              >
                {bannerMsg.title}...
              </Text>
            </View>
          );
        })()}

        {/* Latest Notifications Card */}
        <LatestNotificationsCard navigation={navigation} refreshKey={notifRefreshKey} />

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
              color={colors.accent}
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
            <SmartIcon name="star-outline" size={48} color={colors.textMuted} />
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
    </PlayerScreen>
  );
}
