/**
 * Output Screen — Three tabs: My Vitals | My Metrics | My Programs
 *
 * Unified data page aggregating vitals, test benchmarks, and training programs.
 * All data comes from a single /api/v1/output/snapshot endpoint.
 * Top row matches the Plan/Timeline screen pattern.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';
import { SmartIcon } from '../components/SmartIcon';
import { Loader } from '../components/Loader';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { QuickAccessBar } from '../components/QuickAccessBar';
import { useQuickActions } from '../hooks/useQuickActions';
import {
  spacing,
  fontFamily,
  layout,
  borderRadius,
} from '../theme';
import type { ThemeColors } from '../theme/colors';
import { screenBg } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useOutputData } from '../hooks/useOutputData';
import { useConnectedSources } from '../hooks/useConnectedSources';
import { interactWithProgram } from '../services/api';
import { usePrograms } from '../hooks/usePrograms';
import { VitalsSection } from '../components/output/VitalsSection';
import { MetricsSection } from '../components/output/MetricsSection';
import { ProgramsSection } from '../components/output/ProgramsSection';
import { PHVBanner } from '../components/output/PHVBanner';
import type { PHVCategory, LTADStage } from '../utils/phvCalculator';
import type { CompositeNavigationProp, RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, MainStackParamList } from '../navigation/types';
import { useSubTabRegistry } from '../hooks/useSubTabContext';
import { usePageConfig } from '../hooks/usePageConfig';
import { UnderlineTabSwitcher } from '../components/UnderlineTabSwitcher';

// ── Types ────────────────────────────────────────────────────────────────

type TestsScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Dashboard'>,
    NativeStackNavigationProp<MainStackParamList>
  >;
  route: any;
};

type Tab = 'vitals' | 'metrics' | 'programs';

// ── Tabs config ──────────────────────────────────────────────────────────

const OUTPUT_TABS: { key: Tab; label: string }[] = [
  { key: 'vitals', label: 'My Vitals' },
  { key: 'metrics', label: 'My Metrics' },
  { key: 'programs', label: 'My Programs' },
];

const LTAD_MAP: Record<string, LTADStage> = {
  'pre-phv-early': 'FUNdamentals',
  'pre-phv-approaching': 'Learn to Train',
  'at-phv': 'Train to Train',
  'post-phv-recent': 'Train to Compete',
  'post-phv-stable': 'Train to Win',
};

// ── Component ────────────────────────────────────────────────────────────

export function TestsScreen({ navigation, route }: TestsScreenProps) {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { needsCheckin, isStale, checkinAgeHours } = useCheckinStatus();
  const pageConfig = usePageConfig('output');
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, setData, loading, error, refresh, isDeepRefreshing, forceRefreshPrograms } = useOutputData();
  const { sources: connectedSources, loading: sourcesLoading } = useConnectedSources();

  const paramTab = route?.params?.initialTab as Tab | undefined;
  const [activeTab, setActiveTab] = useState<Tab>(paramTab || 'vitals');
  const isWhoopConnected = connectedSources.includes('whoop');
  const quickActions = useQuickActions(
    {
      key: 'wearables',
      icon: isWhoopConnected ? 'watch' : 'watch-outline',
      label: isWhoopConnected ? 'Connected' : 'Wearables',
      onPress: () => navigation.navigate('Settings' as any),
      accentColor: isWhoopConnected ? colors.readinessGreen : colors.error,
    },
    navigation,
  );

  // Switch tab when navigated with initialTab param
  useEffect(() => {
    if (paramTab && paramTab !== activeTab) {
      setActiveTab(paramTab);
    }
  }, [paramTab]);

  // Auto-refresh on focus removed — user uses manual refresh button in toolbar

  // Register sub-tabs for swipe navigation
  const subTabRegistry = useSubTabRegistry();
  const SUB_TABS: Tab[] = ['vitals', 'metrics', 'programs'];
  useEffect(() => {
    subTabRegistry.register('Test', {
      tabs: SUB_TABS,
      activeIndex: SUB_TABS.indexOf(activeTab),
      setTab: (idx: number) => setActiveTab(SUB_TABS[idx]),
    });
    return () => subTabRegistry.unregister('Test');
  }, [activeTab]);

  // ── Program interactions (active + player-added) ─────────────────
  const {
    active: activeEntries,
    playerAdded: playerAddedEntries,
    toggleActive,
    markDone,
    markDismissed,
    removePlayerAdded,
    refresh: refreshProgramInteractions,
  } = usePrograms();

  const [refreshing, setRefreshing] = useState(false);


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // On vitals tab, also trigger Whoop sync for fresh data
      if (activeTab === 'vitals' && isWhoopConnected) {
        try {
          const { syncWhoop } = await import('../services/api');
          await syncWhoop();
          await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          console.warn('[TestsScreen] Whoop sync on refresh failed:', e);
        }
      }
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh, activeTab, isWhoopConnected]);

  // ── Program interactions (done/dismiss) ─────────────────────────
  // Confirmation is handled inline by ProgramCard — this just does the action
  const handleProgramAction = useCallback((programId: string, action: 'done' | 'dismissed') => {
    // Optimistic removal — remove from local state immediately
    setData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        programs: {
          ...prev.programs,
          recommendations: prev.programs.recommendations.filter(
            (p: any) => p.programId !== programId
          ),
        },
      };
    });

    // Persist to backend via the shared hook
    if (action === 'done') markDone(programId);
    else markDismissed(programId);
  }, [setData, markDone, markDismissed]);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <PlayerScreen
      label="TESTS"
      title="All tests"
      onBack={() => navigation.goBack()}
      scroll={false}
    >
      {/* ── Tab Switcher (underline style — matches Timeline) ── */}
      <UnderlineTabSwitcher<Tab>
        tabs={OUTPUT_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        accentColor={colors.accent1}
        inactiveColor={colors.textInactive}
        borderColor={colors.borderLight}
        tabLabels={pageConfig?.metadata?.tabLabels as Partial<Record<Tab, string>> | undefined}
      />

      {/* ── PHV Banner (shows on all sub-tabs) ── */}
      {data && (
        <View style={{ paddingHorizontal: layout.screenMargin }}>
          <PHVBanner
            phvOffset={data.vitals.phv?.maturityOffset ?? null}
            phvStage={data.vitals.phv?.phvStage ?? null}
            ltadStage={data.vitals.phv?.ltad?.stageName ?? (data.vitals.phv?.phvStage ? LTAD_MAP[data.vitals.phv.phvStage] ?? null : null)}
            onCalculatePress={() => navigation.navigate('PHVCalculator' as any, {
              existingOffset: data.vitals.phv?.maturityOffset,
              existingStage: data.vitals.phv?.phvStage,
              existingLtad: data.vitals.phv?.ltad?.stageName,
              standingHeight: (data.vitals.phv as any)?.standingHeightCm,
              sittingHeight: (data.vitals.phv as any)?.sittingHeightCm,
              weight: (data.vitals.phv as any)?.weightKg,
            })}
          />
        </View>
      )}

      {/* ── Content ── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent1} />
        }
      >
        {loading && !data ? (
          <View style={styles.centered}>
            <Loader size="lg" />
          </View>
        ) : error && !data ? (
          <View style={styles.centered}>
            <SmartIcon name="cloud-offline-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.errorText, { color: colors.textMuted }]}>{error}</Text>
            <Pressable style={[styles.retryBtn, { backgroundColor: colors.accent1 }]} onPress={refresh}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : data ? (
          <>
            {activeTab === 'vitals' && (
              <VitalsSection
                vitals={data.vitals}
                isWhoopConnected={isWhoopConnected}
                onSyncNow={async () => {
                  try {
                    const { syncWhoop } = await import('../services/api');
                    const result = await syncWhoop();
                    // Wait briefly for any async writes to settle, then refresh
                    await new Promise(r => setTimeout(r, 1500));
                    await refresh();
                    // Show warning if health_data had write errors
                    if ((result?.health_data_errors ?? 0) > 0) {
                      const msg = `Synced but ${result.health_data_errors} vitals failed to save. Try again.`;
                      if (Platform.OS === 'web') window.alert(msg);
                      else Alert.alert('Partial Sync', msg);
                    }
                  } catch (e: any) {
                    const msg = e?.message || 'Could not sync WHOOP data. Please try again.';
                    console.error('[Vitals] Sync failed:', msg);
                    if (Platform.OS === 'web') window.alert(msg);
                    else Alert.alert('Sync Failed', msg);
                    // Still refresh to show latest available data
                    await refresh();
                  }
                }}
              />
            )}
            {activeTab === 'metrics' && (
              <MetricsSection metrics={data.metrics} onTestLogged={refresh} sport={profile?.sport ?? null} />
            )}
            {activeTab === 'programs' && (
              <ProgramsSection
                programs={data.programs}
                gaps={data.metrics?.gaps || []}
                isDeepRefreshing={isDeepRefreshing}
                onForceRefresh={forceRefreshPrograms}
                onNavigateCheckin={() => navigation.navigate('Checkin' as any)}
                onNavigateTests={() => setActiveTab('metrics')}
                onNavigateSettings={() => navigation.navigate('Settings' as any)}
                onProgramDone={(id) => handleProgramAction(id, 'done')}
                onProgramDismiss={(id) => handleProgramAction(id, 'dismissed')}
                activeEntries={activeEntries}
                playerAddedEntries={playerAddedEntries}
                onToggleActive={toggleActive}
                onPlayerSelect={(program) => {
                  interactWithProgram(program.id, 'player_selected', {
                    programSnapshot: program,
                    source: 'player_added',
                  })
                    .then(() => refreshProgramInteractions())
                    .catch((e) => console.warn('[TestsScreen] Player select failed:', e));
                }}
                onPlayerDeselect={removePlayerAdded}
              />
            )}
          </>
        ) : null}
      </ScrollView>
    </PlayerScreen>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: screenBg,
    },

    // Header
    headerArea: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    refreshBtn: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
    },

    // Tabs (underline style is handled by OutputTabSwitcher component)

    // Content
    scrollContent: {
      paddingHorizontal: layout.screenMargin,
      paddingBottom: 120,
    },

    // States
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      gap: spacing.md,
    },
    errorText: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      textAlign: 'center',
    },
    retryBtn: {
      borderRadius: borderRadius.md,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    retryText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
  });
}
