/**
 * Signal Dashboard Screen — Signal-First Daily Command Centre
 *
 * Tomo's core product differentiator. Instead of raw numbers (WHOOP: "72/100"),
 * the Dashboard synthesises 2–5 metrics into a single named signal (e.g. "PRIMED")
 * with plain-English coaching and an adapted training plan.
 *
 * ── ARCHITECTURE ──
 * Pure renderer — receives SignalContext from boot endpoint, renders it.
 * Zero decision-making on the client. The PD controls everything via CMS.
 *
 * ── SECTIONS ──
 * 1. SignalHero — Arc icon, signal name, pills, coaching
 * 2. Today's Plan — Adapted session card
 * 3. Signal Triggers — "What triggered this signal" rows
 * 4. Slide-up Panels — Program, Metrics, Progress (overlays)
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useBootData } from '../hooks/useBootData';
import { useTheme } from '../hooks/useTheme';
import { fontFamily } from '../theme/typography';
import { spacing } from '../theme';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { useAuth } from '../hooks/useAuth';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { useNavigation } from '@react-navigation/native';

// Dashboard components
import { SignalHero } from '../components/dashboard/SignalHero';
import { TodaysPlanCard } from '../components/dashboard/TodaysPlanCard';
import { SignalTriggerSection } from '../components/dashboard/SignalTriggerSection';
import { DailyRecommendations } from '../components/dashboard/DailyRecommendations';
import { ProgramPanel } from '../components/dashboard/panels/ProgramPanel';
import { MetricsPanel } from '../components/dashboard/panels/MetricsPanel';
import { ProgressPanel } from '../components/dashboard/panels/ProgressPanel';

type PanelId = 'training' | 'metrics' | 'progress' | null;

// Default signal when no data available (neutral state)
const NEUTRAL_SIGNAL = {
  key: 'BASELINE',
  displayName: 'BASELINE',
  subtitle: 'Check in to activate your signal',
  color: '#7a9b76',
  heroBackground: '#0F1219',
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

export function SignalDashboardScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { needsCheckin } = useCheckinStatus();
  const navigation = useNavigation<any>();
  const { bootData, isBootLoading, refreshBoot } = useBootData();
  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';

  const [activePanel, setActivePanel] = useState<PanelId>(null);

  // Refresh boot data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refreshBoot();
    }, [refreshBoot])
  );

  // Extract signal context from boot data (or use neutral fallback)
  const signal = bootData?.signalContext ?? NEUTRAL_SIGNAL;
  const recentVitals = bootData?.recentVitals ?? [];

  // Loading state
  if (isBootLoading && !bootData) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Dashboard</Text>
          <View style={styles.headerRight}>
            <NotificationBell />
            <HeaderProfileButton initial={initial} photoUrl={profile?.photoUrl} />
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading your signal...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#0F1219' }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: signal.heroBackground }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Dashboard</Text>
        <View style={styles.headerRight}>
          <CheckinHeaderButton
            needsCheckin={needsCheckin}
            onPress={() => navigation.navigate('Checkin')}
          />
          <NotificationBell />
          <HeaderProfileButton initial={initial} photoUrl={profile?.photoUrl} />
        </View>
      </View>

      {/* Main Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Signal Hero */}
        <SignalHero
          signal={signal}
          activePanel={activePanel}
          onPanelPress={setActivePanel}
        />

        {/* Daily Recommendations from RIE */}
        <DailyRecommendations
          recs={bootData?.dashboardRecs ?? []}
          signalColor={signal.color}
        />

        {/* Today's Plan */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TODAY&apos;S PLAN</Text>
          {signal.adaptedPlan ? (
            <TodaysPlanCard
              sessionName={signal.adaptedPlan.sessionName}
              sessionMeta={signal.adaptedPlan.sessionMeta}
              signalColor={signal.color}
            />
          ) : (
            <View style={styles.emptyPlan}>
              <Text style={styles.emptyPlanText}>
                No session scheduled. Complete a check-in to see your adapted plan.
              </Text>
            </View>
          )}

          {/* Signal Triggers */}
          <SignalTriggerSection
            triggerRows={signal.triggerRows}
            signalColor={signal.color}
          />
        </View>
      </ScrollView>

      {/* Slide-up Panels (rendered above scroll, managed by z-index) */}
      <ProgramPanel
        isOpen={activePanel === 'training'}
        onClose={() => setActivePanel(null)}
        adaptedPlan={signal.adaptedPlan}
        activePrograms={bootData?.activePrograms}
        signalColor={signal.color}
      />
      <MetricsPanel
        isOpen={activePanel === 'metrics'}
        onClose={() => setActivePanel(null)}
        snapshot={bootData?.snapshot ?? null}
        recentVitals={recentVitals}
        dailyLoad={bootData?.dailyLoad}
        signalColor={signal.color}
      />
      <ProgressPanel
        isOpen={activePanel === 'progress'}
        onClose={() => setActivePanel(null)}
        snapshot={bootData?.snapshot ?? null}
        dailyLoad={bootData?.dailyLoad}
        benchmarkSummary={bootData?.benchmarkSummary}
        signalColor={signal.color}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    paddingTop: 14,
  },
  sectionLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.18)',
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  emptyPlan: {
    backgroundColor: '#1B1F2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 14,
  },
  emptyPlanText: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: '#4A5E50',
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
  },
});
