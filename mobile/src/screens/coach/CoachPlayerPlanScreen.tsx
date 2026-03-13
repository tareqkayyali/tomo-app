/**
 * Coach Player Plan Screen
 * Read-only view of a player's calendar using the UnifiedDayView.
 * FAB opens RecommendEvent screen.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { UnifiedDayView } from '../../components/plan/UnifiedDayView';
import { SkeletonCard, ErrorState } from '../../components';
import { usePlayerCalendarData } from '../../hooks/usePlayerCalendarData';
import { useTheme } from '../../hooks/useTheme';
import { toDateStr } from '../../utils/calendarHelpers';
import { spacing, layout, fontFamily } from '../../theme';
import type { CoachStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<CoachStackParamList, 'CoachPlayerPlan'>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CoachPlayerPlanScreen({ route, navigation }: Props) {
  const { playerId, playerName } = route.params;
  const { colors } = useTheme();

  const calendar = usePlayerCalendarData(playerId, 'coach');
  const { events, isLoading, backendError, setSelectedDate, refresh } = calendar;

  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  // ─── Day navigation ───────────────────────────────────────────────

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

  // ─── Pull to refresh ──────────────────────────────────────────────

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 1000);
  }, [refresh]);

  // ─── Computed values ──────────────────────────────────────────────

  const todayStr = toDateStr(new Date());
  const selectedDayStr = toDateStr(selectedDay);
  const isToday = selectedDayStr === todayStr;

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

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {backendError && (
        <ErrorState
          message="Could not load data. Pull to retry."
          onRetry={refresh}
          compact
        />
      )}

      <UnifiedDayView
        role="coach"
        isOwner={false}
        targetUserName={playerName}
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
        onFabPress={() =>
          navigation.navigate('RecommendEvent', {
            playerId,
            playerName,
            allowedTypes: ['training', 'match'],
          })
        }
        fabIcon="paper-plane-outline"
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
