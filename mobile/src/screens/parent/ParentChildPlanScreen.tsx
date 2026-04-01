/**
 * Parent Child Plan Screen
 * Read-only unified day view of a child's calendar.
 * Child selector chips at top (if multiple children).
 * FAB opens RecommendEvent screen.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { SmartIcon } from '../../components/SmartIcon';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { UnifiedDayView } from '../../components/plan/UnifiedDayView';
import { ErrorState } from '../../components';
import { usePlayerCalendarData } from '../../hooks/usePlayerCalendarData';
import { useTheme } from '../../hooks/useTheme';
import { getParentChildren } from '../../services/api';
import { toDateStr } from '../../utils/calendarHelpers';
import { useTriangleSnapshot } from '../../hooks/useTriangleSnapshot';
import { ragToColor } from '../../hooks/useAthleteSnapshot';
import { spacing, layout, fontFamily, borderRadius } from '../../theme';
import type { ParentTabParamList, ParentStackParamList } from '../../navigation/types';
import type { PlayerSummary } from '../../types';

// @ts-ignore — Legacy screen, kept for backward compat. New flow uses ParentChildDetailScreen.
type Props = CompositeScreenProps<
  BottomTabScreenProps<ParentTabParamList, 'Children'>,
  NativeStackScreenProps<ParentStackParamList>
>;

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

export function ParentChildPlanScreen({ navigation }: Props) {
  const { colors } = useTheme();

  // ─── Children list ────────────────────────────────────────────────

  const [children, setChildren] = useState<PlayerSummary[]>([]);
  const [selectedChild, setSelectedChild] = useState<PlayerSummary | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await getParentChildren();
        setChildren(res.children);
        if (res.children.length > 0) {
          setSelectedChild(res.children[0]);
        }
      } catch {
        // silent
      } finally {
        setChildrenLoading(false);
      }
    })();
  }, []);

  // ─── Calendar data for selected child ─────────────────────────────

  const { snapshot } = useTriangleSnapshot(selectedChild?.id ?? '');
  const calendar = usePlayerCalendarData(selectedChild?.id ?? '', 'parent');
  const { events, isLoading, backendError, setSelectedDate, refresh, dayLocks } = calendar;

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

  // ─── Loading / empty states ───────────────────────────────────────

  if (childrenLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.accent1} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (children.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.emptyContainer}>
          <SmartIcon name="lock-closed-outline" size={40} color={colors.textInactive} />
          <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>
            Waiting for confirmation
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Your child hasn't confirmed the link yet. Once they accept, their schedule will appear here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* ─── Header + Child selector ─── */}
      <View style={styles.headerArea}>
        <Text style={[styles.screenTitle, { color: colors.textOnDark }]}>
          {selectedChild?.name ? `${selectedChild.name.split(' ')[0]}'s Plan` : 'Plan'}
        </Text>
      </View>

      {children.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.childSelector}
          contentContainerStyle={styles.childSelectorContent}
        >
          {children.map((child) => (
            <TouchableOpacity
              key={child.id}
              style={[
                styles.childChip,
                {
                  backgroundColor:
                    selectedChild?.id === child.id ? colors.accent1 : colors.surface,
                  borderColor:
                    selectedChild?.id === child.id ? colors.accent1 : colors.border,
                },
              ]}
              onPress={() => setSelectedChild(child)}
            >
              <Text
                style={[
                  styles.childChipText,
                  {
                    color:
                      selectedChild?.id === child.id ? colors.textOnDark : colors.textOnDark,
                  },
                ]}
              >
                {child.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {snapshot?.readiness_rag && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm, paddingHorizontal: layout.screenMargin }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ragToColor(snapshot.readiness_rag) }} />
          <Text style={{ fontSize: 13, fontFamily: fontFamily.semiBold, color: ragToColor(snapshot.readiness_rag) }}>
            {snapshot.readiness_rag === 'GREEN' ? 'Good to go' : snapshot.readiness_rag === 'AMBER' ? 'Take it easy' : 'Rest day recommended'}
          </Text>
        </View>
      )}

      {backendError && (
        <ErrorState
          message="Could not load data. Pull to retry."
          onRetry={refresh}
          compact
        />
      )}

      {selectedChild && (
        <UnifiedDayView
          role="parent"
          isOwner={false}
          targetUserName={selectedChild.name}
          events={dayEvents}
          selectedDay={selectedDay}
          dayLabel={dayLabel}
          isToday={isToday}
          isLoading={isLoading}
          isLocked={!!dayLocks[selectedDayStr]}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onPrevDay={goToPrevDay}
          onNextDay={goToNextDay}
          onToday={goToToday}
        />
      )}
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
  headerArea: {
    paddingHorizontal: layout.screenMargin,
    paddingVertical: spacing.sm,
  },
  screenTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
  },

  // Child selector
  childSelector: {
    maxHeight: 44,
    marginBottom: spacing.xs,
  },
  childSelectorContent: {
    paddingHorizontal: layout.screenMargin,
    gap: spacing.sm,
  },
  childChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  childChipText: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 80,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: fontFamily.bold,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
