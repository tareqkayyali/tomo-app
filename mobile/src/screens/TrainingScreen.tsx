/**
 * Training Screen (Plan Tab) — "Your Flow" single-day view
 *
 * Shows one day at a time with left/right arrows to navigate between days.
 * Readiness + Balance + AI card + Lock-In + Check-in pill + timeline + exam planner
 * FAB (floating + button) to add new blocks.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { SkeletonCard, ErrorState } from '../components';
import type { UpcomingExam } from '../components';
import { UnifiedDayView } from '../components/plan/UnifiedDayView';
// StudyPlanView and TrainingPlanView are now accessed via header buttons (separate screens)
import { spacing, layout, shadows, fontFamily, borderRadius } from '../theme';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../hooks/useAuth';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { QuickAccessBar } from '../components/QuickAccessBar';
import { useQuickActions } from '../hooks/useQuickActions';
import { SuggestionsBanner } from '../components/SuggestionsBanner';
import { useSuggestions } from '../hooks/useSuggestions';
import { useCalendarData } from '../hooks/useCalendarData';
import { useDayLock } from '../hooks/useDayLock';
import { toDateStr } from '../utils/calendarHelpers';
import { createCalendarEvent, autoFillWeek } from '../services/api';
import type { ReadinessLevel, Checkin } from '../types';
import { getReadinessScore } from '../services/readinessScore';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, MainStackParamList } from '../navigation/types';
import { useSubTabRegistry } from '../hooks/useSubTabContext';
import { usePageConfig } from '../hooks/usePageConfig';
import { useScheduleRules } from '../hooks/useScheduleRules';
import { useFocusEffect } from '@react-navigation/native';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Default readiness when no check-in exists
const DEFAULT_READINESS: { score: number; level: ReadinessLevel } = {
  score: 0,
  level: 'GREEN',
};

/**
 * Compute readiness from today's check-in (if available).
 * Returns default GREEN/0 if no check-in exists yet.
 */
function getReadinessFromCheckins(checkins: Checkin[]): { score: number; level: ReadinessLevel } {
  const todayStr = toDateStr(new Date());
  const todayCheckin = checkins.find((c) => c.date === todayStr);
  if (!todayCheckin) return DEFAULT_READINESS;

  // If the backend already computed a readiness level, use it
  if (todayCheckin.readinessLevel) {
    const result = getReadinessScore({
      energy: todayCheckin.energy,
      soreness: todayCheckin.soreness,
      sleepHours: todayCheckin.sleepHours,
      mood: todayCheckin.mood ?? 5,
      effort: todayCheckin.effortYesterday ?? 5,
      pain: todayCheckin.painFlag,
    });
    return { score: result.score, level: result.level };
  }

  return DEFAULT_READINESS;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TrainingScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Plan'>,
    NativeStackNavigationProp<MainStackParamList>
  >;
};

// ---------------------------------------------------------------------------
// Helpers — day navigation
// ---------------------------------------------------------------------------

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TrainingScreen({ navigation }: TrainingScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pageConfig = usePageConfig('timeline');

  const { profile, role } = useAuth();
  const { needsCheckin, isStale, checkinAgeHours } = useCheckinStatus();
  const { rules, refresh: refreshRules } = useScheduleRules();
  const examModeEnabled = rules?.preferences?.exam_period_active ?? false;

  // Refresh rules on screen focus (picks up unlinked programs from EventEdit)
  useFocusEffect(useCallback(() => { refreshRules(); }, [refreshRules]));
  const quickActions = useQuickActions(
    [
      { key: 'study', icon: 'book-outline', label: 'Study', onPress: () => navigation.navigate('StudyPlanView' as any), accentColor: colors.accent2 },
      { key: 'training', icon: 'barbell-outline', label: 'Training', onPress: () => navigation.navigate('TrainingPlanView' as any), accentColor: colors.accent1 },
      { key: 'rules', icon: 'options-outline', label: 'My Rules', onPress: () => navigation.navigate('MyRules'), accentColor: colors.accent2 },
      { key: 'bulk-edit', icon: 'copy-outline', label: 'Bulk Edit', onPress: () => navigation.navigate('BulkEditEvents' as any), accentColor: colors.accent1 },
    ],
    navigation,
  );
  const [refreshing, setRefreshing] = useState(false);

  // Pending suggestions from coach/parent (player-only feature)
  const { suggestions, handleResolved, refresh: refreshSuggestions } = useSuggestions();
  const [completedEvents, setCompletedEvents] = useState<Set<string>>(
    () => new Set<string>(),
  );

  // Gap setting — cycles through 15 / 30 / 45 / 60
  const GAP_OPTIONS = [15, 30, 45, 60] as const;
  const [gapMinutes, setGapMinutes] = useState(30);
  const cycleGap = useCallback(() => {
    setGapMinutes((prev) => {
      const idx = GAP_OPTIONS.indexOf(prev as any);
      return GAP_OPTIONS[(idx + 1) % GAP_OPTIONS.length];
    });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // ─── Calendar data hook (must come before callbacks that reference it) ───
  const calendar = useCalendarData();
  const {
    events: realEvents,
    checkins,
    isLoading,
    backendError,
    setSelectedDate,
    refresh,
    handleDeleteEvent,
    handleUpdateEvent,
  } = calendar;

  // Enrich training events with linked programs from schedule rules
  const trainingCategories = rules?.preferences?.training_categories ?? [];
  const events = useMemo(() => {
    if (trainingCategories.length === 0) return realEvents;
    return realEvents.map((evt) => {
      if (evt.type !== 'training') return evt;
      // Find the training category that matches this event name
      const matchedCat = trainingCategories.find(
        (cat) => cat.label && evt.name.toLowerCase().includes(cat.label.toLowerCase())
      );
      if (matchedCat?.linkedPrograms?.length) {
        return { ...evt, linkedPrograms: matchedCat.linkedPrograms };
      }
      // Also try matching all categories' linked programs for generic "training" events
      const allLinked = trainingCategories.flatMap((cat) => cat.linkedPrograms ?? []);
      if (allLinked.length > 0 && !matchedCat) {
        return { ...evt, linkedPrograms: allLinked };
      }
      return evt;
    });
  }, [realEvents, trainingCategories]);

  // Compute readiness from today's check-in
  const readiness = useMemo(
    () => getReadinessFromCheckins(checkins),
    [checkins],
  );

  // Track whether initial load is done
  const hasLoadedOnce = useRef(false);
  useEffect(() => {
    if (!isLoading && !hasLoadedOnce.current) {
      hasLoadedOnce.current = true;
    }
  }, [isLoading]);

  // Set view mode to day on mount
  useEffect(() => {
    calendar.setViewMode('day');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Selected day (for day navigation) ───
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  const goToPrevDay = useCallback(() => {
    setSelectedDay((prev) => {
      const next = addDays(prev, -1);
      setSelectedDate(next);
      return next;
    });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [setSelectedDate]);

  const goToNextDay = useCallback(() => {
    setSelectedDay((prev) => {
      const next = addDays(prev, 1);
      setSelectedDate(next);
      return next;
    });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [setSelectedDate]);

  const goToToday = useCallback(() => {
    const today = new Date();
    setSelectedDay(today);
    setSelectedDate(today);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [setSelectedDate]);

  const handleDaySelect = useCallback((date: Date) => {
    setSelectedDay(date);
    setSelectedDate(date);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [setSelectedDate]);

  // ─── Pull to refresh ───

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refresh();
    refreshSuggestions();
    setTimeout(() => setRefreshing(false), 1000);
  }, [refresh, refreshSuggestions]);

  // ─── Event completion handlers ───

  const handleCompleteEvent = useCallback((eventId: string) => {
    setCompletedEvents((prev) => new Set(prev).add(eventId));
  }, []);

  const handleSkipEvent = useCallback((eventId: string) => {
    setCompletedEvents((prev) => new Set(prev).add(eventId));
  }, []);

  const handleUndoEvent = useCallback((eventId: string) => {
    setCompletedEvents((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
  }, []);

  // ─── Day lock ───

  const todayStr = toDateStr(new Date());
  const selectedDayStr = toDateStr(selectedDay);
  const isToday = selectedDayStr === todayStr;

  const { isLocked, isLoading: isLockLoading, toggleLock } = useDayLock(selectedDayStr, true);

  // ─── Events for the selected day ───

  const dayEvents = useMemo(
    () =>
      events
        .filter((e) => e.date === selectedDayStr)
        .sort((a, b) => {
          if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
          if (a.startTime) return -1;
          if (b.startTime) return 1;
          return 0;
        }),
    [events, selectedDayStr],
  );

  // Day label for the navigation bar
  const dayLabel = useMemo(() => {
    if (isToday) return 'Today';
    const yesterday = addDays(new Date(), -1);
    const tomorrow = addDays(new Date(), 1);
    if (toDateStr(yesterday) === selectedDayStr) return 'Yesterday';
    if (toDateStr(tomorrow) === selectedDayStr) return 'Tomorrow';
    return selectedDay.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }, [selectedDay, selectedDayStr, isToday]);

  // ─── Training / Academic hours for balance ───

  const trainingHours = useMemo(
    () => dayEvents.filter((e) => e.type === 'training' || e.type === 'match').length * 1.5,
    [dayEvents],
  );

  const academicHours = useMemo(
    () => dayEvents.filter((e) => e.type === 'study_block' || e.type === 'exam').length * 1,
    [dayEvents],
  );

  // ─── AI insight text ───

  const aiInsightText = useMemo(() => {
    const hasExam = dayEvents.some((e) => e.type === 'exam');
    if (hasExam)
      return 'Exam detected \u2014 Tomo has optimized your training load and added study blocks to help you prepare.';
    const plan = calendar.plan;
    const explanation = plan?.decisionExplanation;
    if (typeof explanation === 'string') return explanation;
    if (explanation?.summary) return explanation.summary;
    return undefined;
  }, [dayEvents, calendar.plan]);

  // ─── Upcoming exams (next 14 days) ───

  const upcomingExams = useMemo(() => {
    const now = Date.now();
    return events
      .filter((e) => e.type === 'exam')
      .map((e) => ({
        id: e.id,
        subject: e.name,
        examDate: e.date,
        daysUntil: Math.max(0, Math.ceil((new Date(e.date).getTime() - now) / 86400000)),
      }))
      .filter((e) => e.daysUntil <= 14)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [events]);

  // ─── Check-in status ───

  const hasCheckedInToday = useMemo(() => {
    return checkins.some((c) => c.date === todayStr);
  }, [checkins, todayStr]);

  // ─── Header text ───

  const weekdayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  // ─── Loading state ───

  if (isLoading && !hasLoadedOnce.current) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerArea}>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <CheckinHeaderButton needsCheckin={needsCheckin} isStale={isStale} checkinAgeHours={checkinAgeHours} onPress={() => navigation.navigate('Checkin' as any)} />
            <NotificationBell />
            <HeaderProfileButton
              initial={profile?.name?.charAt(0)?.toUpperCase() || '?'}
              photoUrl={profile?.photoUrl}
            />
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main render ───

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ─── Header ─── */}
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

      {/* Error banner */}
      {backendError && (
        <ErrorState
          message="Could not load data. Pull to retry."
          onRetry={refresh}
          compact
        />
      )}

      {/* ─── Unified Day View (includes day nav, spine timeline, FAB) ─── */}
      <UnifiedDayView
        role="player"
        isOwner={true}
        events={dayEvents}
        selectedDay={selectedDay}
        dayLabel={dayLabel}
        isToday={isToday}
        isLoading={isLoading}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onPrevDay={goToPrevDay}
        onNextDay={goToNextDay}
        onToday={goToToday}
        onDaySelect={handleDaySelect}
        isLocked={isLocked}
        isLockLoading={isLockLoading}
        onToggleLock={toggleLock}
        onEmptySlotPress={(time) => {
          if (!isLocked) {
            navigation.navigate('AddEvent', { date: selectedDayStr, startTime: time });
          }
        }}
        onEventDrop={async (eventId, newStart, newEnd) => {
          if (!isLocked) {
            await handleUpdateEvent(eventId, { startTime: newStart, endTime: newEnd });
          }
        }}
        hasCheckedInToday={hasCheckedInToday}
        suggestions={suggestions}
        onSuggestionResolved={handleResolved}
        upcomingExams={examModeEnabled ? upcomingExams : []}
        completedEvents={completedEvents}
        onComplete={handleCompleteEvent}
        onSkip={handleSkipEvent}
        onUndo={handleUndoEvent}
        onDelete={(eventId) => handleDeleteEvent(eventId)}
        onUpdate={(eventId, patch) => handleUpdateEvent(eventId, patch)}
        onCheckinPress={() => navigation.navigate('Checkin')}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    // ─── Header ───
    headerArea: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: layout.screenMargin,
      paddingVertical: spacing.sm,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    loadingContainer: {
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.md,
    },
  });
}
