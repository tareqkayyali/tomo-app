/**
 * Signal Dashboard Screen — Mode-First Daily Command Centre
 *
 * ── DASHBOARD TAB ──
 *   Always rendered by <PulseDashboardTab/>.
 *   CMS-controlled: admin enables/disables pulse_* section types via
 *   dashboard_sections table; bootData.dashboardLayout drives which
 *   sections appear. Empty layout = all 11 sections in default Pulse order.
 *
 * ── OTHER TABS ──
 *   Programs / Metrics / Progress are siblings in the underline tab switcher,
 *   each delegating to existing Output sections + Progress panel.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Alert } from 'react-native';
import { TomoRefreshControl, PullRefreshOverlay } from '../components';
import { Loader } from '../components/Loader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import PagerView from 'react-native-pager-view';
import { useFocusEffect } from '@react-navigation/native';
import { useBootData } from '../hooks/useBootData';
import { useOutputData } from '../hooks/useOutputData';
import { usePrograms } from '../hooks/usePrograms';
import { interactWithProgram } from '../services/api';
import { useTheme } from '../hooks/useTheme';
import { fontFamily } from '../theme/typography';
import { spacing } from '../theme';
import { screenBg } from '../theme/colors';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { QuickAccessBar } from '../components/QuickAccessBar';
import { UnderlineTabSwitcher } from '../components/UnderlineTabSwitcher';
import { useAuth } from '../hooks/useAuth';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { useConnectedSources } from '../hooks/useConnectedSources';
import { useNavigation } from '@react-navigation/native';
// Dashboard tab — Pulse design is permanent; CMS dashboardLayout controls which
// sections render (pulse_* component types) and their order.
import { PulseDashboardTab } from '../components/dashboard/pulse/PulseDashboardTab';
import { ProgramPanel } from '../components/dashboard/panels/ProgramPanel';
import { MetricsPanel } from '../components/dashboard/panels/MetricsPanel';
import { ProgressTab } from '../components/dashboard/progress/ProgressTab';
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

// Pre-checkin fallback only. Post-checkin the backend synthesises a BASELINE
// signalContext carrying a motivational vibe (see boot/route.ts dynamic hero
// coaching block), so this copy is reserved for the "no check-in yet today"
// state where the ring shows 0 and the right next action is to check in.
const NEUTRAL_SIGNAL = {
  key: 'BASELINE',
  displayName: 'BASELINE',
  subtitle: 'Check in to unlock today',
  color: '#7a9b76',
  heroBackground: '#12141F',
  arcOpacity: { large: 0.3, medium: 0.3, small: 0.3 },
  pillBackground: 'rgba(122,155,118,0.08)',
  barRgba: 'rgba(122,155,118,0.3)',
  coachingColor: '#567A5C',
  pills: [] as { label: string; subLabel: string }[],
  coaching: 'Check in to unlock today — readiness, plan, and the next right thing.',
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
  const { profile, user } = useAuth();
  const { needsCheckin } = useCheckinStatus();
  const navigation = useNavigation<any>();
  const { bootData, isBootLoading, refreshBoot } = useBootData();
  // Output data drives the Programs + Metrics tabs (same source the Output
  // screen uses, and that the Coach portal's ProgrammesTab / TestsTab
  // delegate to). We call it unconditionally so the data is ready the
  // moment the athlete taps one of those tabs.
  const { data: outputData, loading: outputLoading, error: outputError, refresh: refreshOutput, refetchSnapshot: refetchOutputSnapshot, isDeepRefreshing: outputDeepRefreshing } = useOutputData();
  const {
    active: activeProgramEntries,
    playerAdded: playerAddedProgramEntries,
    toggleActive: toggleProgramActive,
    markDone: markProgramDone,
    markDismissed: markProgramDismissed,
    removePlayerAdded: removePlayerAddedProgram,
    refresh: refreshProgramInteractions,
  } = usePrograms();
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
      // Output snapshot is separate from boot. If the first fetch ran before
      // auth (or failed), Programs / Metrics stay empty until pull; recover here.
      if (user?.uid && !outputData && !outputLoading) {
        void refetchOutputSnapshot();
      }
    }, [refreshBoot, user?.uid, outputData, outputLoading, refetchOutputSnapshot])
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

  // ── Sub-tab pager ────────────────────────────────────────────────────
  // PagerView owns horizontal drags within the content body — native 60fps
  // tracking, adjacent-page preloading, and momentum fling without JS thread
  // hops. The outer Material Top Tab's `swipeEnabled` is false on Dashboard
  // specifically to avoid pager-in-pager gesture arbitration.
  //
  // Two-way sync:
  //   • Tap on UnderlineTabSwitcher → setActiveTab → useEffect calls
  //     pagerRef.setPage() to animate to the page.
  //   • Swipe on PagerView → onPageSelected fires after settle → setActiveTab
  //     keeps the underline + `signal.coaching` consumers in lock-step.
  //
  // The scrollPosition shared value mirrors the pager's real-time offset
  // during drag (position + offset). We keep it around for future use by
  // any caller that wants a finger-tracking indicator — the current
  // UnderlineTabSwitcher springs post-settle which is already smooth
  // enough at page-level native 60fps.
  const pagerRef = useRef<PagerView>(null);
  const pagerIndex = useSharedValue(0);
  const scrollPosition = useSharedValue(0);
  const activeIndex = DASHBOARD_TABS.findIndex((t) => t.key === activeTab);

  useEffect(() => {
    // Guard against redundant setPage during programmatic transitions — the
    // pager settles and calls onPageSelected, which calls setActiveTab,
    // which fires this effect; skipping when already there prevents a
    // second setPage in the same frame.
    if (activeIndex >= 0 && pagerIndex.value !== activeIndex) {
      pagerRef.current?.setPage(activeIndex);
    }
  }, [activeIndex, pagerIndex]);

  const onPagerSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      const idx = e.nativeEvent.position;
      const tab = DASHBOARD_TABS[idx];
      if (tab) setActiveTab(tab.key);
    },
    [],
  );

  const onPagerScroll = useCallback(
    (e: { nativeEvent: { position: number; offset: number } }) => {
      // Continuous 0..N-1 across all tabs — useful for finger-tracking
      // indicators. Written on JS thread; consumers that care about 60fps
      // should read from a native-side onPageScroll variant instead.
      scrollPosition.value = e.nativeEvent.position + e.nativeEvent.offset;
      pagerIndex.value = e.nativeEvent.position;
    },
    [pagerIndex, scrollPosition],
  );

  // ── Outer-pager swipe coordination ──────────────────────────────────
  // The MaterialTopTabNavigator owns horizontal swipes between the three
  // top-level tabs (Plan / Chat / Dashboard). Inside Dashboard we have an
  // inner PagerView for sub-tabs (Dashboard / Programs / Metrics / Progress)
  // that ALSO wants horizontal swipes. We arbitrate by toggling the outer
  // pager's `swipeEnabled` based on which sub-tab is active:
  //   - On the Dashboard sub-tab → outer swipe enabled, so a swipe-right
  //     navigates back to Chat (Chat sits to the left of Dashboard in the
  //     tab order). The inner pager has no previous page here, so there's
  //     no arbitration conflict.
  //   - On Programs / Metrics / Progress → outer swipe disabled, so the
  //     inner pager owns horizontal swipes for sub-tab navigation. Users
  //     leave Dashboard by tapping the Dashboard sub-tab first, then
  //     swiping (or by tapping the Chat tab pill).
  // This replaces the previous static `swipeEnabled: false` on Dashboard,
  // which caused Chat→Dashboard swipes to freeze mid-transition because the
  // pager's scrollEnabled flipped to false the moment Dashboard took focus.
  useEffect(() => {
    navigation.setOptions({ swipeEnabled: activeTab === 'dashboard' } as any);
  }, [activeTab, navigation]);

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
      <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top']}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <Loader size="sm" />
          <Text style={styles.loadingText}>Loading your signal...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top']}>
      {renderHeader()}

      <UnderlineTabSwitcher<DashboardTabKey>
        tabs={DASHBOARD_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        accentColor={colors.accent1}
        inactiveColor={colors.textMuted}
        borderColor={colors.borderLight}
      />

      <PagerView
        ref={pagerRef}
        style={styles.subTabContainer}
        initialPage={activeIndex >= 0 ? activeIndex : 0}
        onPageSelected={onPagerSelected}
        onPageScroll={onPagerScroll}
        offscreenPageLimit={1}
        scrollEnabled
      >
          <View key="dashboard" style={styles.pagerPage} collapsable={false}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={styles.scrollContent}
              refreshControl={
                <TomoRefreshControl
                  refreshing={dashboardRefreshing}
                  onRefresh={onDashboardRefresh}
                />
              }
            >
              {bootData && (
                <PulseDashboardTab
                  bootData={bootData}
                  outputData={outputData ?? null}
                  modeLabel={currentMode ?? 'balanced'}
                  signal={signal}
                  dashboardLayout={bootData.dashboardLayout}
                  onSleepPress={() => setActiveTab('metrics')}
                  onStrengthPress={() => setActiveTab('metrics')}
                  onGapPress={() => setActiveTab('metrics')}
                  onOpenMetricsTab={() => setActiveTab('metrics')}
                  onOpenProgramsTab={() => setActiveTab('program')}
                />
              )}
            </ScrollView>
            <PullRefreshOverlay refreshing={dashboardRefreshing} />
          </View>

          <View key="program" style={styles.pagerPage} collapsable={false}>
            {outputLoading && !outputData ? (
              <View style={styles.tabLoading}>
                <Loader size="sm" />
              </View>
            ) : outputError || !outputData ? (
              <ScrollView
                contentContainerStyle={styles.tabErrorContent}
                refreshControl={
                  <TomoRefreshControl
                    refreshing={outputRefreshing}
                    onRefresh={async () => {
                      setOutputRefreshing(true);
                      await refreshOutput();
                      setOutputRefreshing(false);
                    }}
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
                  <TomoRefreshControl
                    refreshing={outputRefreshing}
                    onRefresh={async () => {
                      setOutputRefreshing(true);
                      await refreshOutput();
                      setOutputRefreshing(false);
                    }}
                  />
                }
              >
                <ProgramsSection
                  programs={outputData.programs}
                  gaps={outputData.metrics?.gaps}
                  isDeepRefreshing={outputDeepRefreshing}
                  onNavigateCheckin={() => navigation.navigate('Checkin' as any)}
                  onNavigateSettings={() => navigation.navigate('Settings' as any)}
                  activeEntries={activeProgramEntries}
                  playerAddedEntries={playerAddedProgramEntries}
                  onToggleActive={toggleProgramActive}
                  onProgramDone={markProgramDone}
                  onProgramDismiss={markProgramDismissed}
                  onPlayerSelect={(program) => {
                    interactWithProgram(program.id, 'player_selected', {
                      programSnapshot: program,
                      source: 'player_added',
                    })
                      .then(() => refreshProgramInteractions())
                      .catch((e) => console.warn('[SignalDashboard] Player select failed:', e));
                  }}
                  onPlayerDeselect={removePlayerAddedProgram}
                />
              </ScrollView>
            )}
            <PullRefreshOverlay refreshing={outputRefreshing} />
          </View>

          <View key="metrics" style={styles.pagerPage} collapsable={false}>
            {outputLoading && !outputData ? (
              <View style={styles.tabLoading}>
                <Loader size="sm" />
              </View>
            ) : outputError || !outputData ? (
              <ScrollView
                contentContainerStyle={styles.tabErrorContent}
                refreshControl={
                  <TomoRefreshControl
                    refreshing={outputRefreshing}
                    onRefresh={async () => {
                      setOutputRefreshing(true);
                      await refreshOutput();
                      setOutputRefreshing(false);
                    }}
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
                  <TomoRefreshControl
                    refreshing={outputRefreshing}
                    onRefresh={async () => {
                      setOutputRefreshing(true);
                      await refreshOutput();
                      setOutputRefreshing(false);
                    }}
                  />
                }
              >
                <MetricsSection
                  metrics={outputData.metrics}
                  onTestLogged={() => refreshOutput()}
                  sport={bootData?.sport}
                />
              </ScrollView>
            )}
            <PullRefreshOverlay refreshing={outputRefreshing} />
          </View>

          <View key="progress" style={styles.pagerPage} collapsable={false}>
            <ProgressTab />
          </View>
      </PagerView>
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
  // Each PagerView child must fill its page — PagerView lays out children
  // at page-width, and `flex: 1` lets the inner ScrollView claim the full
  // height. `collapsable={false}` on the View prevents Android's view
  // flattening from eliding the wrapper and breaking page snapshots.
  pagerPage: {
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
