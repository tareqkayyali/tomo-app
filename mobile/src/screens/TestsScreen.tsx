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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { QuickAccessBar } from '../components/QuickAccessBar';
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
import { VitalsSection } from '../components/output/VitalsSection';
import { MetricsSection } from '../components/output/MetricsSection';
import { ProgramsSection } from '../components/output/ProgramsSection';
import type { CompositeNavigationProp, RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, MainStackParamList } from '../navigation/types';

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

/** Animated underline tab switcher — same pattern as PlanTabSwitcher */
function OutputTabSwitcher({
  activeTab,
  onTabChange,
  colors,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  colors: ThemeColors;
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
                {tab.label}
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
  const { needsCheckin } = useCheckinStatus();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, loading, error, refresh } = useOutputData();

  const paramTab = route?.params?.initialTab as Tab | undefined;
  const [activeTab, setActiveTab] = useState<Tab>(paramTab || 'vitals');

  // Switch tab when navigated with initialTab param
  useEffect(() => {
    if (paramTab && paramTab !== activeTab) {
      setActiveTab(paramTab);
    }
  }, [paramTab]);
  const [refreshing, setRefreshing] = useState(false);


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Top Row ── */}
      <View style={styles.headerArea}>
        <QuickAccessBar actions={[
          { key: 'settings', icon: 'settings-outline', label: 'Settings', onPress: () => navigation.navigate('Settings') },
          { key: 'logTest', icon: 'create-outline', label: 'Log Test', onPress: () => navigation.navigate('PhoneTestsList') },
          { key: 'more', icon: 'ellipsis-horizontal', label: 'More', onPress: () => {} },
        ]} />
        <View style={styles.headerRight}>
          <CheckinHeaderButton needsCheckin={needsCheckin} onPress={() => navigation.navigate('Checkin' as any)} />
          <NotificationBell />
          <HeaderProfileButton
            initial={profile?.name?.charAt(0)?.toUpperCase() || '?'}
            photoUrl={profile?.photoUrl}
          />
        </View>
      </View>

      {/* ── Tab Switcher (underline style — matches Timeline) ── */}
      <OutputTabSwitcher activeTab={activeTab} onTabChange={setActiveTab} colors={colors} />

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
            {activeTab === 'vitals' && <VitalsSection vitals={data.vitals} />}
            {activeTab === 'metrics' && <MetricsSection metrics={data.metrics} onTestLogged={refresh} />}
            {activeTab === 'programs' && <ProgramsSection programs={data.programs} gaps={data.metrics.gaps} />}
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
