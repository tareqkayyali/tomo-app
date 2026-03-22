/**
 * Output Screen — Three tabs: My Vitals | My Metrics | My Programs
 *
 * Unified data page aggregating vitals, test benchmarks, and training programs.
 * All data comes from a single /api/v1/output/snapshot endpoint.
 * Top row matches the Plan/Timeline screen pattern.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Animated,
  LayoutChangeEvent,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useOutputData } from '../hooks/useOutputData';
import { useConnectedSources } from '../hooks/useConnectedSources';
import { interactWithProgram, fetchActivePrograms } from '../services/api';
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

// ── Types ────────────────────────────────────────────────────────────────

type TestsScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Test'>,
    NativeStackNavigationProp<MainStackParamList>
  >;
  route: RouteProp<MainTabParamList, 'Test'>;
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

/** Animated underline tab switcher — same pattern as PlanTabSwitcher */
function OutputTabSwitcher({
  activeTab,
  onTabChange,
  colors,
  tabLabels,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  colors: ThemeColors;
  /** CMS-driven label overrides keyed by tab key */
  tabLabels?: Record<string, string>;
}) {
  const tabWidths = useRef<number[]>([0, 0, 0]);
  const tabOffsets = useRef<number[]>([0, 0, 0]);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;

  const activeIndex = OUTPUT_TABS.findIndex((t) => t.key === activeTab);

  useEffect(() => {
    const x = tabOffsets.current[activeIndex] || 0;
    const w = tabWidths.current[activeIndex] || 0;
    Animated.parallel([
      Animated.spring(indicatorX, { toValue: x, useNativeDriver: false, tension: 300, friction: 30 }),
      Animated.spring(indicatorW, { toValue: w, useNativeDriver: false, tension: 300, friction: 30 }),
    ]).start();
  }, [activeIndex]);

  const handleLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabWidths.current[index] = width;
    tabOffsets.current[index] = x;
    if (index === activeIndex) {
      indicatorX.setValue(x);
      indicatorW.setValue(width);
    }
  };

  return (
    <View style={{ marginBottom: spacing.sm, paddingHorizontal: spacing.md }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
        {OUTPUT_TABS.map((tab, i) => {
          const isActive = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              onLayout={handleLayout(i)}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  fontFamily: isActive ? fontFamily.semiBold : fontFamily.medium,
                  fontSize: 14,
                  color: isActive ? colors.accent1 : colors.textInactive,
                }}
              >
                {tabLabels?.[tab.key] || tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          height: 2,
          backgroundColor: colors.accent1,
          borderRadius: 1,
          left: indicatorX,
          width: indicatorW,
        }}
      />
    </View>
  );
}

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
  const quickActions = useQuickActions(
    { key: 'vitals', icon: 'pulse-outline', label: 'My Vitals', onPress: () => setActiveTab('vitals'), accentColor: colors.accent2 },
    navigation,
  );

  // Switch tab when navigated with initialTab param
  useEffect(() => {
    if (paramTab && paramTab !== activeTab) {
      setActiveTab(paramTab);
    }
  }, [paramTab]);

  // Refresh data when screen gains focus (e.g. returning from PHV calculator)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refresh();
    });
    return unsubscribe;
  }, [navigation, refresh]);

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

  // ── Active program IDs ──────────────────────────────────────
  const [activeIds, setActiveIds] = useState<string[]>([]);

  const loadActiveIds = useCallback(async () => {
    try {
      const { programIds } = await fetchActivePrograms();
      setActiveIds(programIds);
    } catch (e) {
      console.warn('[TestsScreen] Failed to fetch active programs:', e);
    }
  }, []);

  useEffect(() => {
    loadActiveIds();
  }, [loadActiveIds]);

  // Also reload active IDs on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadActiveIds();
    });
    return unsubscribe;
  }, [navigation, loadActiveIds]);

  const handleToggleActive = useCallback((programId: string) => {
    // Optimistic toggle
    setActiveIds((prev) => {
      if (prev.includes(programId)) {
        return prev.filter((id) => id !== programId);
      }
      return [...prev, programId];
    });

    // Persist to backend (non-blocking)
    interactWithProgram(programId, 'active').catch((e) =>
      console.warn('[TestsScreen] Active toggle failed:', e)
    );
  }, []);

  const [refreshing, setRefreshing] = useState(false);


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

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

    // Persist to backend (non-blocking)
    interactWithProgram(programId, action).catch((e) =>
      console.warn('[TestsScreen] Program interaction failed:', e)
    );
  }, [setData]);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Top Row ── */}
      <View style={styles.headerArea}>
        <QuickAccessBar actions={quickActions} />
        <View style={styles.headerRight}>
          <CheckinHeaderButton needsCheckin={needsCheckin} isStale={isStale} checkinAgeHours={checkinAgeHours} onPress={() => navigation.navigate('Checkin' as any)} />
          <NotificationBell />
          <HeaderProfileButton
            initial={profile?.name?.charAt(0)?.toUpperCase() || '?'}
            photoUrl={profile?.photoUrl}
          />
        </View>
      </View>

      {/* ── Tab Switcher (underline style — matches Timeline) ── */}
      <OutputTabSwitcher activeTab={activeTab} onTabChange={setActiveTab} colors={colors} tabLabels={pageConfig?.metadata?.tabLabels} />

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
            <ActivityIndicator size="large" color={colors.accent1} />
          </View>
        ) : error && !data ? (
          <View style={styles.centered}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
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
                connectedSources={connectedSources}
                sourcesLoading={sourcesLoading}
                onConnectWhoop={() => navigation.navigate('Settings' as any)}
                onSyncNow={async () => {
                  try {
                    const { syncWhoop } = await import('../services/api');
                    await syncWhoop();
                    refresh();
                  } catch { /* sync failed — refresh will show stale state */ }
                }}
                onCheckIn={() => navigation.navigate('Checkin' as any)}
              />
            )}
            {activeTab === 'metrics' && <MetricsSection metrics={data.metrics} onTestLogged={refresh} />}
            {activeTab === 'programs' && (
              <ProgramsSection
                programs={data.programs}
                gaps={data.metrics.gaps}
                isDeepRefreshing={isDeepRefreshing}
                onForceRefresh={forceRefreshPrograms}
                onNavigateCheckin={() => navigation.navigate('Checkin' as any)}
                onNavigateTests={() => setActiveTab('metrics')}
                onNavigateSettings={() => navigation.navigate('Settings' as any)}
                onProgramDone={(id) => handleProgramAction(id, 'done')}
                onProgramDismiss={(id) => handleProgramAction(id, 'dismissed')}
                activeIds={activeIds}
                onToggleActive={handleToggleActive}
              />
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
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
      color: '#FFF',
    },
  });
}
