/**
 * Signal Dashboard Screen — Mode-First Daily Command Centre
 *
 * ── SECTIONS ──
 * 1. AthleteModeHero — Current mode display, quick mode switcher, panel pills
 * 2. Daily Recs — Expandable RIE recommendation cards (diverse types)
 * 3. CMS Sections — Dynamic sections from dashboard_sections table
 * 4. Up Next — Future timeline activities with contextual AI hints
 * 5. Slide-up Panels — Program, Metrics, Progress (overlays)
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Platform, Alert } from 'react-native';
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
import { useConnectedSources } from '../hooks/useConnectedSources';
import { useNavigation } from '@react-navigation/native';

// Dashboard components
import { AthleteModeHero } from '../components/dashboard/AthleteModeHero';
import { TodaysPlanCard } from '../components/dashboard/TodaysPlanCard';
import { DailyRecommendations } from '../components/dashboard/DailyRecommendations';
import { DashboardSectionRenderer } from '../components/dashboard/sections';
import { ProgramPanel } from '../components/dashboard/panels/ProgramPanel';
import { MetricsPanel } from '../components/dashboard/panels/MetricsPanel';
import { ProgressPanel } from '../components/dashboard/panels/ProgressPanel';

type PanelId = 'training' | 'metrics' | 'progress' | null;

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

/** Generate a contextual hint for the upcoming activity based on type + signal state */
function getActivityHint(
  event: { type: string; title: string; intensity: number | null },
  signalKey: string,
  activeRecs: { type: string; bodyShort: string | null }[],
): string | null {
  const type = event.type;
  const isOverloaded = signalKey === 'OVERLOADED' || signalKey === 'RECOVERING' || signalKey === 'SLEEP_DEBT';
  const hasRecoveryRec = activeRecs.some(r => r.type === 'RECOVERY' || r.type === 'READINESS');

  if (type === 'sleep') {
    if (hasRecoveryRec) {
      return 'Start winding down early — recovery is a priority today. Limit screens 30 min before bed.';
    }
    return 'Prepare for quality sleep — dim lights, cool room, consistent routine.';
  }
  if (type === 'training' || type === 'gym' || type === 'club') {
    if (isOverloaded) {
      return 'Signal says recovery mode — keep this light. Technical work only, no max efforts.';
    }
    if (event.intensity && event.intensity >= 7) {
      return 'High intensity planned — hydrate well beforehand and warm up thoroughly.';
    }
    return 'Stay present and focus on quality reps over volume.';
  }
  if (type === 'match') {
    if (isOverloaded) {
      return 'Your body is fatigued — focus on smart positioning and conserve energy for key moments.';
    }
    return 'Match day — activate with a dynamic warm-up 20 min before. Stay hydrated.';
  }
  if (type === 'study' || type === 'exam') {
    return 'Balance is key — take a 5-min movement break every 45 minutes to stay sharp.';
  }
  if (type === 'recovery') {
    return 'Active recovery session — gentle movement, stretching, and breathwork. No intensity.';
  }
  return null;
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
  const currentMode = bootData?.planningContext?.athlete_mode ?? (bootData?.snapshot as any)?.athlete_mode ?? 'balanced';

  // Filter to only upcoming events (start time > now)
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return todayEvents.filter((e: any) => new Date(e.startAt) > now);
  }, [todayEvents]);

  // Active recs for contextual hints
  const activeRecs = useMemo(() => {
    return (bootData?.dashboardRecs ?? []).map((r: any) => ({
      type: r.type,
      bodyShort: r.bodyShort,
    }));
  }, [bootData?.dashboardRecs]);

  // Build a set of enabled component_types from CMS layout.
  // Screen-level components (signal_hero, daily_recs, up_next) use this
  // to check if the CMS has them enabled — if the type is absent from the
  // boot layout, the section is hidden.
  const enabledTypes = useMemo(() => {
    const types = new Set<string>();
    (bootData?.dashboardLayout ?? []).forEach((s: { component_type: string }) => {
      types.add(s.component_type);
    });
    return types;
  }, [bootData?.dashboardLayout]);

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

  // Week-strip day tap in ProgramPanel: close the panel and deep-link to
  // the Plan (Timeline) tab focused on that date.
  const onProgramDayPress = useCallback(
    (dateISO: string) => {
      setActivePanel(null);
      navigation.navigate('Plan' as any, { date: dateISO });
    },
    [navigation]
  );

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
          <Text style={styles.loadingText}>Loading your signal...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
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
        {/* Athlete Mode Hero — current mode, quick switcher, panel pills */}
        {/* CMS-gated: only renders when signal_hero section is enabled in dashboard_sections */}
        {enabledTypes.has('signal_hero') && (
          <AthleteModeHero
            currentMode={currentMode}
            signal={{
              color: signal.color,
              showUrgencyBadge: signal.showUrgencyBadge,
              urgencyLabel: signal.urgencyLabel,
            }}
            activePanel={activePanel}
            onPanelPress={setActivePanel}
            onModeChanged={refreshBoot}
          />
        )}

        {/* Daily Recommendations from RIE */}
        {/* CMS-gated: only renders when daily_recs section is enabled in dashboard_sections */}
        {enabledTypes.has('daily_recs') && (
          <DailyRecommendations
            recs={bootData?.dashboardRecs ?? []}
            signalColor={signal.color}
          />
        )}

        {/* CMS-Driven Dashboard Sections */}
        {bootData && Array.isArray(bootData.dashboardLayout) && bootData.dashboardLayout.length > 0 && (
          <View style={styles.section}>
            <DashboardSectionRenderer
              layout={bootData.dashboardLayout}
              bootData={bootData}
            />
          </View>
        )}

        {/* Up Next — future timeline activities with contextual hints */}
        {/* CMS-gated: only renders when up_next section is enabled in dashboard_sections */}
        {enabledTypes.has('up_next') && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {signal.adaptedPlan ? "TODAY\u2019S PLAN" : "UP NEXT"}
            </Text>

            {/* Adapted session from signal (if signal overrides) */}
            {signal.adaptedPlan && (
              <TodaysPlanCard
                sessionName={signal.adaptedPlan.sessionName}
                sessionMeta={signal.adaptedPlan.sessionMeta}
                signalColor={signal.color}
              />
            )}

            {/* Upcoming activities only (after current time) */}
            {upcomingEvents.length > 0 ? (
              <View style={styles.timelineSection}>
                {upcomingEvents.map((event: any, i: number) => {
                  const hint = getActivityHint(event, signal.key, activeRecs);
                  const isNext = i === 0;
                  return (
                    <View
                      key={event.id ?? i}
                      style={[
                        styles.timelineCard,
                        isNext && styles.timelineCardNext,
                      ]}
                    >
                      {/* Time column */}
                      <View style={styles.timeColumn}>
                        <Text style={[styles.timelineTime, isNext && { color: signal.color }]}>
                          {formatEventTime(event.startAt)}
                        </Text>
                      </View>

                      {/* Content */}
                      <View style={styles.timelineContent}>
                        <View style={styles.timelineHeader}>
                          <Text style={[styles.timelineTitle, isNext && { color: '#F5F3ED' }]}>
                            {event.title}
                          </Text>
                          <View style={[
                            styles.timelineTypeBadge,
                            { backgroundColor: isNext ? `${signal.color}20` : 'rgba(245,243,237,0.05)' },
                          ]}>
                            <Text style={[
                              styles.timelineTypeText,
                              { color: isNext ? signal.color : 'rgba(245,243,237,0.35)' },
                            ]}>
                              {EVENT_TYPE_LABELS[event.type] ?? event.type}
                            </Text>
                          </View>
                        </View>

                        {/* Contextual AI hint — only for next activity */}
                        {isNext && hint && (
                          <Text style={[styles.timelineHint, { color: `${signal.color}B3` }]}>
                            {hint}
                          </Text>
                        )}

                        {event.intensity && (
                          <Text style={styles.timelineIntensity}>
                            Intensity {event.intensity}/10
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : !signal.adaptedPlan ? (
              <View style={styles.emptyPlan}>
                <Text style={styles.emptyPlanText}>
                  No upcoming activities today. You&apos;re all caught up.
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Slide-up Panels */}
      <ProgramPanel
        isOpen={activePanel === 'training'}
        onClose={() => setActivePanel(null)}
        adaptedPlan={signal.adaptedPlan}
        activePrograms={bootData?.activePrograms}
        coachProgrammes={bootData?.coachProgrammes}
        recommendedPrograms={bootData?.recommendedPrograms}
        signalColor={signal.color}
        freshness={freshness}
        onDayPress={onProgramDayPress}
        panelLayout={bootData?.panelLayouts?.program}
      />
      <MetricsPanel
        isOpen={activePanel === 'metrics'}
        onClose={() => setActivePanel(null)}
        snapshot={bootData?.snapshot ?? null}
        recentVitals={recentVitals}
        dailyLoad={bootData?.dailyLoad}
        signalColor={signal.color}
        freshness={freshness}
        isWearableConnected={isWearableConnected}
        onSyncVitals={onSyncVitals}
        onOpenSettings={onOpenSettings}
        panelLayout={bootData?.panelLayouts?.metrics}
      />
      <ProgressPanel
        isOpen={activePanel === 'progress'}
        onClose={() => setActivePanel(null)}
        snapshot={bootData?.snapshot ?? null}
        dailyLoad={bootData?.dailyLoad}
        benchmarkSummary={bootData?.benchmarkSummary}
        signalColor={signal.color}
        freshness={freshness}
        panelLayout={bootData?.panelLayouts?.progress}
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
