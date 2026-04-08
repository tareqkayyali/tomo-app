/**
 * Signal Dashboard Screen — Signal-First Daily Command Centre
 *
 * ── SECTIONS ──
 * 1. SignalHero — Arc icon (left), signal name, pills, coaching
 * 2. Daily Recs — Expandable RIE recommendation cards (diverse types)
 * 3. Today's Plan — Timeline activities for the day
 * 4. Signal Triggers — "What triggered this signal" rows
 * 5. Slide-up Panels — Program, Metrics, Progress (overlays)
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

// Event type → display label mapping
const EVENT_TYPE_LABELS: Record<string, string> = {
  training: 'Training',
  match: 'Match',
  gym: 'Gym',
  recovery: 'Recovery',
  study: 'Study',
  exam: 'Exam',
  sleep: 'Sleep',
  club: 'Club Session',
  personal: 'Personal',
};

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function SignalDashboardScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { needsCheckin } = useCheckinStatus();
  const navigation = useNavigation<any>();
  const { bootData, isBootLoading, refreshBoot } = useBootData();
  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';

  const [activePanel, setActivePanel] = useState<PanelId>(null);

  useFocusEffect(
    useCallback(() => {
      refreshBoot();
    }, [refreshBoot])
  );

  const signal = bootData?.signalContext ?? NEUTRAL_SIGNAL;
  const recentVitals = bootData?.recentVitals ?? [];
  const todayEvents = bootData?.todayEvents ?? [];

  // Loading state
  if (isBootLoading && !bootData) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#0F1219' }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Dashboard</Text>
          <View style={styles.headerRight}>
            <NotificationBell />
            <HeaderProfileButton initial={initial} photoUrl={profile?.photoUrl} />
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading your signal...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#0F1219' }]} edges={['top']}>
      {/* Header — consistent dark bg, no hero tint */}
      <View style={styles.header}>
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Signal Hero — compact, no full-width bg overlay */}
        <SignalHero
          signal={signal}
          activePanel={activePanel}
          onPanelPress={setActivePanel}
        />

        {/* Daily Recommendations from RIE — diverse, expandable */}
        <DailyRecommendations
          recs={bootData?.dashboardRecs ?? []}
          signalColor={signal.color}
        />

        {/* Today's Plan — shows actual Timeline activities */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TODAY&apos;S PLAN</Text>

          {/* Adapted session from signal (if signal overrides) */}
          {signal.adaptedPlan && (
            <TodaysPlanCard
              sessionName={signal.adaptedPlan.sessionName}
              sessionMeta={signal.adaptedPlan.sessionMeta}
              signalColor={signal.color}
            />
          )}

          {/* Timeline events for today */}
          {todayEvents.length > 0 ? (
            <View style={styles.timelineSection}>
              {todayEvents.map((event: any, i: number) => (
                <View
                  key={event.id ?? i}
                  style={[styles.timelineCard, i === 0 && !signal.adaptedPlan && styles.timelineCardFirst]}
                >
                  <View style={styles.timelineDot}>
                    <View style={[styles.timelineDotInner, { backgroundColor: signal.color }]} />
                  </View>
                  <View style={styles.timelineContent}>
                    <View style={styles.timelineHeader}>
                      <Text style={styles.timelineTime}>
                        {formatEventTime(event.startAt)}
                      </Text>
                      <View style={[styles.timelineTypeBadge, { backgroundColor: `${signal.color}18` }]}>
                        <Text style={[styles.timelineTypeText, { color: signal.color }]}>
                          {EVENT_TYPE_LABELS[event.type] ?? event.type}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.timelineTitle}>{event.title}</Text>
                    {event.intensity && (
                      <Text style={styles.timelineIntensity}>
                        Intensity: {event.intensity}/10
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ) : !signal.adaptedPlan ? (
            <View style={styles.emptyPlan}>
              <Text style={styles.emptyPlanText}>
                No activities scheduled today. Check in to see your adapted plan.
              </Text>
            </View>
          ) : null}
        </View>

        {/* Signal Triggers */}
        {signal.triggerRows.length > 0 && (
          <View style={styles.section}>
            <SignalTriggerSection
              triggerRows={signal.triggerRows}
              signalColor={signal.color}
            />
          </View>
        )}
      </ScrollView>

      {/* Slide-up Panels */}
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
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  // Timeline events
  timelineSection: {
    gap: 0,
  },
  timelineCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  timelineCardFirst: {
    // First card when no adapted plan — no extra styling needed
  },
  timelineDot: {
    width: 24,
    alignItems: 'center',
    paddingTop: 3,
    marginRight: 10,
  },
  timelineDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.6,
  },
  timelineContent: {
    flex: 1,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  timelineTime: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
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
  timelineTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: '#E5EBE8',
  },
  timelineIntensity: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
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
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
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
    color: 'rgba(255,255,255,0.40)',
  },
});
