/**
 * Signal Dashboard Screen — Mode-First Daily Command Centre
 *
 * ── DASHBOARD TAB SECTIONS ──
 *   Rendered by <SignalDashboardTab/> (six-section snapshot layout):
 *     FocusHero · WhatsComingTimeline · SleepTrendCard · BenchmarkGrid ·
 *     WeeklyPulseStrip · TomoTakeCard
 *
 * ── OTHER TABS ──
 *   Programs / Metrics / Progress are siblings in the underline tab switcher,
 *   each delegating to existing Output sections + Progress panel.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Platform, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { useBootData } from '../hooks/useBootData';
import { useOutputData } from '../hooks/useOutputData';
import { useTheme } from '../hooks/useTheme';
import { fontFamily } from '../theme/typography';
import { spacing } from '../theme';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { QuickAccessBar } from '../components/QuickAccessBar';
import { UnderlineTabSwitcher } from '../components/UnderlineTabSwitcher';
import { useAuth } from '../hooks/useAuth';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { useConnectedSources } from '../hooks/useConnectedSources';
import { useNavigation } from '@react-navigation/native';

// Dashboard tab — rebuilt Signal Dashboard (spec: "Signal · Dashboard")
import { SignalDashboardTab } from '../components/dashboard/signal/SignalDashboardTab';
import { ProgramPanel } from '../components/dashboard/panels/ProgramPanel';
import { MetricsPanel } from '../components/dashboard/panels/MetricsPanel';
import { ProgressPanel } from '../components/dashboard/panels/ProgressPanel';
// Output sections — reused under the Programs + Metrics tabs to match the
// Coach portal's ProgrammesTab / TestsTab layout (both delegated to these
// sections already). Single source of truth for the athlete's own view
// across Dashboard tabs and the Output screen.
import { ProgramsSection } from '../components/output/ProgramsSection';
import { MetricsSection } from '../components/output/MetricsSection';

type PanelId = 'training' | 'metrics' | 'progress' | null;
type DashboardTabKey = 'dashboard' | 'program' | 'metrics' | 'progress';

const DASHBOARD_TABS: { key: DashboardTabKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'program', label: 'Programs' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'progress', label: 'Progress' },
];

const NEUTRAL_SIGNAL = {
  key: 'BASELINE',
  displayName: 'BASELINE',
  subtitle: 'Check in to activate your signal',
  color: '#7a9b76',
  heroBackground: '#12141F',
  arcOpacity: { large: 0.3, medium: 0.3, small: 0.3 },
  pillBackground: 'rgba(122,155,118,0.08)',
  barRgba: 'rgba(122,155,118,0.3)',
  coachingColor: '#567A5C',
  pills: [] as { label: string; subLabel: string }[],
  coaching: 'Complete your daily check-in to activate your personalised signal and adapted training plan.',
  triggerRows: [] as { metric: string; value: string; baseline: string; delta: string; isPositive: boolean }[],
  adaptedPlan: null as { sessionName: string; sessionMeta: string } | null,
  showUrgencyBadge: false,
  urgencyLabel: null as string | null,
  signalId: 'default',
  priority: 999,
  evaluatedAt: new Date().toISOString(),
};

/**
 * Returns a user-facing "Updated Nm/h ago · tap to refresh" label when the
 * underlying snapshot (or payload) is older than 5 minutes. Prefers the
 * server-authoritative `snapshot.snapshot_at` (when the snapshot was last
 * recomputed on the server) and falls back to the payload's client-fetch
 * timestamp so the stamp still works if the snapshot field is missing.
 *
 * Returns null when fresh or when both timestamps are missing/invalid
 * (fail open — no stamp beats a broken one).
 */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

function formatStaleLabel(
  snapshotAt: string | undefined | null,
  fetchedAt: string | undefined | null,
): string | null {
  const primary = snapshotAt ? Date.parse(snapshotAt) : NaN;
  const fallback = fetchedAt ? Date.parse(fetchedAt) : NaN;
  const whenMs = Number.isFinite(primary) ? primary : Number.isFinite(fallback) ? fallback : NaN;
  if (!Number.isFinite(whenMs)) return null;
  const ageMs = Date.now() - whenMs;
  if (ageMs < STALE_THRESHOLD_MS) return null;
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 60) return `Updated ${minutes}m ago · tap to refresh`;
  const hours = Math.floor(minutes / 60);
  return `Updated ${hours}h ago · tap to refresh`;
}

export function SignalDashboardScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { needsCheckin } = useCheckinStatus();
  const navigation = useNavigation<any>();
  const { bootData, isBootLoading, refreshBoot } = useBootData();
  // Output data drives the Programs + Metrics tabs (same source the Output
  // screen uses, and that the Coach portal's ProgrammesTab / TestsTab
  // delegate to). We call it unconditionally so the data is ready the
  // moment the athlete taps one of those tabs.
  const { data: outputData, loading: outputLoading, error: outputError, refresh: refreshOutput, isDeepRefreshing: outputDeepRefreshing } = useOutputData();
  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';

  const [activePanel, setActivePanel] = useState<PanelId>(null);
  const [activeTab, setActiveTab] = useState<DashboardTabKey>('dashboard');
  const [outputRefreshing, setOutputRefreshing] = useState(false);
  // Pull-to-refresh state for the Dashboard tab specifically. Program /
  // Metrics already own their own refresh spinner via outputRefreshing; the
  // Dashboard tab reads from bootData so it needs its own.
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);

  const onDashboardRefresh = useCallback(async () => {
    setDashboardRefreshing(true);
    try {
      await refreshBoot();
    } finally {
      setDashboardRefreshing(false);
    }
  }, [refreshBoot]);

  useFocusEffect(
    useCallback(() => {
      refreshBoot();
    }, [refreshBoot])
  );

  const signal = bootData?.signalContext ?? NEUTRAL_SIGNAL;
  const currentMode = bootData?.planningContext?.athlete_mode ?? (bootData?.snapshot as any)?.athlete_mode ?? 'balanced';

  // Freshness stamp — rendered in panel headers only when the underlying
  // snapshot is >5 min stale. Prefer the server-authoritative `snapshot_at`
  // from the snapshot itself; fall back to the payload's client-fetch
  // timestamp when the snapshot field is missing.
  const snapshotAt = (bootData?.snapshot as any)?.snapshot_at as string | undefined;
  const staleLabel = formatStaleLabel(snapshotAt, bootData?.fetchedAt);
  const freshness = useMemo(
    () => (staleLabel ? { label: staleLabel, onRefresh: refreshBoot } : null),
    [staleLabel, refreshBoot]
  );

  // Auto-refetch once when a panel opens if data is already stale. Version-counter
  // guards in useBootData make overlapping refreshBoot() calls safe.
  useEffect(() => {
    if (activePanel && staleLabel) {
      refreshBoot();
    }
  }, [activePanel, staleLabel, refreshBoot]);

  // Wearable sync for the MetricsPanel "Sync vitals now" action.
  const { sources: connectedSources } = useConnectedSources();
  const isWearableConnected = connectedSources.includes('whoop');

  const onSyncVitals = useCallback(async () => {
    try {
      const { syncWhoop } = await import('../services/api');
      const result = await syncWhoop();
      // Wait briefly for any async writes to settle, then refresh boot data.
      await new Promise((r) => setTimeout(r, 1500));
      await refreshBoot();
      if ((result?.health_data_errors ?? 0) > 0) {
        const msg = `Synced but ${result.health_data_errors} vitals failed to save. Try again.`;
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Partial Sync', msg);
      }
    } catch (err: any) {
      const msg = err?.message || 'Could not sync wearable data. Please try again.';
      console.warn('[Dashboard] Vitals sync failed:', msg);
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Sync Failed', msg);
      await refreshBoot();
    }
  }, [refreshBoot]);

  const onOpenSettings = useCallback(() => {
    navigation.navigate('Settings' as any);
  }, [navigation]);

  // Sub-tab swipe + edge-swipe-back. Two overlaid behaviours on the same pan:
  //   • Swipe left  (in-content) → next sub-tab (Dashboard → Program → Metrics → Progress)
  //   • Swipe right (in-content) → previous sub-tab
  //   • Swipe RIGHT starting from the far-left edge (≤ 24 pts from screen left)
  //     → navigate to Chat main tab, regardless of which sub-tab we're on.
  //     This mirrors the iOS edge-back gesture: "back to parent navigation"
  //     lives on the edge; tab switching lives in the content body.
  //
  // The outer Material Top Tab pager is disabled on Signal so the inner pan
  // fully owns horizontal gestures. failOffsetY yields to vertical scrolls
  // inside each panel; activeOffsetX requires a meaningful horizontal drag
  // before the pan claims the gesture.
  //
  // Double-fire defence: goSubTab reads activeTab through a ref so its
  // identity stays stable across re-renders. Without this, every tab change
  // recreated goSubTab → recreated the gesture memo → GestureDetector
  // remounted the gesture mid-interaction and a quick swipe would advance
  // two tabs at once (e.g. Dashboard → Metrics, skipping Programs).
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const goSubTab = useCallback((direction: 'next' | 'prev') => {
    const idx = DASHBOARD_TABS.findIndex((t) => t.key === activeTabRef.current);
    if (idx < 0) return;
    const nextIdx = direction === 'next' ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= DASHBOARD_TABS.length) return;
    setActiveTab(DASHBOARD_TABS[nextIdx].key);
  }, []);

  const navigateToChat = useCallback(() => {
    navigation.navigate('Chat' as any);
  }, [navigation]);

  const subTabSwipe = useMemo(() => {
    const EDGE_ZONE = 24; // pts from the screen's left edge that count as "back-swipe territory"
    return Gesture.Pan()
      .activeOffsetX([-15, 15])
      .failOffsetY([-30, 30])
      .onEnd((e) => {
        'worklet';
        const swipedLeft = e.translationX < -30 || e.velocityX < -300;
        const swipedRight = e.translationX > 30 || e.velocityX > 300;
        // Starting x in window coordinates = current absoluteX − total translation.
        const startedFromLeftEdge = e.absoluteX - e.translationX <= EDGE_ZONE;

        if (startedFromLeftEdge && swipedRight) {
          runOnJS(navigateToChat)();
          return;
        }
        if (swipedLeft) runOnJS(goSubTab)('next');
        else if (swipedRight) runOnJS(goSubTab)('prev');
      });
  }, [goSubTab, navigateToChat]);

  // Week-strip day tap in ProgramPanel: close the panel and deep-link to
  // the Plan (Timeline) tab focused on that date.
  const onProgramDayPress = useCallback(
    (dateISO: string) => {
      setActivePanel(null);
      navigation.navigate('Plan' as any, { date: dateISO });
    },
    [navigation]
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <QuickAccessBar
        actions={[
          {
            key: 'rules',
            icon: 'options-outline',
            label: 'My Rules',
            onPress: () => navigation.navigate('MyRules'),
            accentColor: colors.accent2,
          },
        ]}
      />
      <View style={styles.headerRight}>
        <CheckinHeaderButton
          needsCheckin={needsCheckin}
          onPress={() => navigation.navigate('Checkin')}
        />
        <NotificationBell />
        <HeaderProfileButton initial={initial} photoUrl={profile?.photoUrl} />
      </View>
    </View>
  );

  if (isBootLoading && !bootData) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading your signal...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {renderHeader()}

      <UnderlineTabSwitcher<DashboardTabKey>
        tabs={DASHBOARD_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        accentColor={colors.accent1}
        inactiveColor={colors.textMuted}
        borderColor={colors.borderLight}
      />

      <GestureDetector gesture={subTabSwipe}>
      <View style={styles.subTabContainer}>
      {activeTab === 'dashboard' && (
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={dashboardRefreshing}
            onRefresh={onDashboardRefresh}
            tintColor={colors.accent}
          />
        }
      >
        <SignalDashboardTab
          bootData={bootData ?? null}
          modeLabel={currentMode ?? 'balanced'}
          signalCoaching={signal.coaching ?? ''}
          onSleepPress={() => setActiveTab('metrics')}
          onStrengthPress={() => setActiveTab('metrics')}
          onGapPress={() => setActiveTab('metrics')}
          onPulseCellPress={() => setActiveTab('metrics')}
          onMilestonePress={(m) => {
            try {
              navigation.navigate('Main', { screen: 'Plan', params: { eventId: m.id } });
            } catch {
              // Graceful no-op if the caller nav isn't available.
            }
          }}
        />
      </ScrollView>
      )}

      {activeTab === 'program' && (
        outputLoading && !outputData ? (
          <View style={styles.tabLoading}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : outputError || !outputData ? (
          <ScrollView
            contentContainerStyle={styles.tabErrorContent}
            refreshControl={
              <RefreshControl
                refreshing={outputRefreshing}
                onRefresh={async () => {
                  setOutputRefreshing(true);
                  await refreshOutput();
                  setOutputRefreshing(false);
                }}
                tintColor={colors.accent}
              />
            }
          >
            <Text style={[styles.tabErrorTitle, { color: colors.textOnDark }]}>
              Could not load programs
            </Text>
            <Text style={[styles.tabErrorBody, { color: colors.textMuted }]}>
              Pull down to retry
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.tabContent}
            refreshControl={
              <RefreshControl
                refreshing={outputRefreshing}
                onRefresh={async () => {
                  setOutputRefreshing(true);
                  await refreshOutput();
                  setOutputRefreshing(false);
                }}
                tintColor={colors.accent}
              />
            }
          >
            <ProgramsSection
              programs={outputData.programs}
              gaps={outputData.metrics?.gaps}
              isDeepRefreshing={outputDeepRefreshing}
              onNavigateCheckin={() => navigation.navigate('Checkin' as any)}
              onNavigateSettings={() => navigation.navigate('Settings' as any)}
            />
          </ScrollView>
        )
      )}

      {activeTab === 'metrics' && (
        outputLoading && !outputData ? (
          <View style={styles.tabLoading}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : outputError || !outputData ? (
          <ScrollView
            contentContainerStyle={styles.tabErrorContent}
            refreshControl={
              <RefreshControl
                refreshing={outputRefreshing}
                onRefresh={async () => {
                  setOutputRefreshing(true);
                  await refreshOutput();
                  setOutputRefreshing(false);
                }}
                tintColor={colors.accent}
              />
            }
          >
            <Text style={[styles.tabErrorTitle, { color: colors.textOnDark }]}>
              Could not load metrics
            </Text>
            <Text style={[styles.tabErrorBody, { color: colors.textMuted }]}>
              Pull down to retry
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.tabContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={outputRefreshing}
                onRefresh={async () => {
                  setOutputRefreshing(true);
                  await refreshOutput();
                  setOutputRefreshing(false);
                }}
                tintColor={colors.accent}
              />
            }
          >
            <MetricsSection
              metrics={outputData.metrics}
              onTestLogged={() => refreshOutput()}
              sport={bootData?.sport}
            />
          </ScrollView>
        )
      )}

      {activeTab === 'progress' && (
        <ProgressPanel
          variant="inline"
          snapshot={bootData?.snapshot ?? null}
          dailyLoad={bootData?.dailyLoad}
          benchmarkSummary={bootData?.benchmarkSummary}
          signalColor={signal.color}
          freshness={freshness}
          panelLayout={bootData?.panelLayouts?.progress}
        />
      )}
      </View>
      </GestureDetector>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Wraps the 4 sub-tab panels so a single GestureDetector can handle
  // horizontal swipes between them without rebuilding on every tab change.
  subTabContainer: {
    flex: 1,
  },
  // Tab content wrappers (Programs / Metrics — Coach-portal sections)
  tabContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
    gap: 8,
  },
  tabLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabErrorContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  tabErrorTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
  },
  tabErrorBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  sectionLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    color: 'rgba(245,243,237,0.35)',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  // Timeline
  timelineSection: {
    gap: 0,
  },
  timelineCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245,243,237,0.04)',
  },
  timelineCardNext: {
    backgroundColor: 'rgba(245,243,237,0.02)',
    borderRadius: 12,
    paddingHorizontal: 10,
    marginHorizontal: -10,
    borderBottomWidth: 0,
    marginBottom: 4,
  },
  timeColumn: {
    width: 48,
    paddingTop: 1,
  },
  timelineTime: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: 'rgba(245,243,237,0.40)',
  },
  timelineContent: {
    flex: 1,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  timelineTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: 'rgba(245,243,237,0.65)',
    flex: 1,
  },
  timelineTypeBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  timelineTypeText: {
    fontFamily: fontFamily.medium,
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timelineHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
    marginBottom: 2,
  },
  timelineIntensity: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: 'rgba(245,243,237,0.28)',
    marginTop: 2,
  },
  emptyPlan: {
    // Canonical card surface — matches GlassCard / Timeline event cards.
    backgroundColor: 'rgba(245,243,237,0.03)',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.10)',
    marginBottom: 14,
  },
  emptyPlanText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: 'rgba(245,243,237,0.35)',
    lineHeight: 18,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: 'rgba(245,243,237,0.40)',
  },
});
