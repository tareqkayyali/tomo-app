/**
 * Parent Child Detail Screen — Gen Z design with 3 inner tabs
 *
 * Tabs: Timeline | Exams | Mastery
 *
 * Child header card with avatar, readiness, wellness trend.
 * All content is in context of a specific child.
 */

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  PanResponder,
} from 'react-native';
import { SmartIcon } from '../../components/SmartIcon';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { UnifiedDayView } from '../../components/plan/UnifiedDayView';
import { ErrorState } from '../../components';
import { ProgressScreen } from '../ProgressScreen';
import { ParentExamScreen } from './ParentExamScreen';
import { usePlayerCalendarData } from '../../hooks/usePlayerCalendarData';
import { useTriangleSnapshot } from '../../hooks/useTriangleSnapshot';
import { ragToColor } from '../../hooks/useAthleteSnapshot';
import { useTheme } from '../../hooks/useTheme';
import { GlassCard } from '../../components/GlassCard';
import { toDateStr } from '../../utils/calendarHelpers';
import { spacing, borderRadius, layout, fontFamily } from '../../theme';
import type { ParentStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ParentStackParamList, 'ParentChildDetail'>;

type ActiveTab = 'timeline' | 'exams' | 'mastery';

const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'exams', label: 'Exams' },
  { key: 'mastery', label: 'Mastery' },
];

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function ParentChildDetailScreen({ route, navigation }: Props) {
  const { childId, childName } = route.params;
  const { colors } = useTheme();
  const { snapshot, isLive } = useTriangleSnapshot(childId);

  const [activeTab, setActiveTab] = useState<ActiveTab>('timeline');

  // Calendar data for Timeline tab
  const calendar = usePlayerCalendarData(childId, 'parent');
  const { events, isLoading, backendError, setSelectedDate, refresh, dayLocks } = calendar;

  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  // Day navigation
  const goToPrevDay = useCallback(() => {
    setSelectedDay((prev) => {
      const next = addDays(prev, -1);
      setSelectedDate(next);
      return next;
    });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [setSelectedDate]);

  const goToNextDay = useCallback(() => {
    setSelectedDay((prev) => {
      const next = addDays(prev, 1);
      setSelectedDate(next);
      return next;
    });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [setSelectedDate]);

  const goToToday = useCallback(() => {
    const today = new Date();
    setSelectedDay(today);
    setSelectedDate(today);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [setSelectedDate]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 1000);
  }, [refresh]);

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

  // Swipe between tabs
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dx) > 30 && Math.abs(gs.dy) < Math.abs(gs.dx) * 0.5,
      onPanResponderRelease: (_evt, gs) => {
        if (Math.abs(gs.dx) < 60) return;
        const currentIdx = TABS.findIndex(t => t.key === activeTabRef.current);
        if (currentIdx === -1) return;
        const nextIdx = gs.dx < 0
          ? Math.min(currentIdx + 1, TABS.length - 1)
          : Math.max(currentIdx - 1, 0);
        if (nextIdx !== currentIdx) {
          setActiveTab(TABS[nextIdx].key);
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },
    })
  ).current;

  const handleTabPress = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const initials = childName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
      {/* ─── Child Header ─── */}
      <View style={{ paddingHorizontal: layout.screenMargin, paddingTop: spacing.sm }}>
        <GlassCard>
          <View style={styles.headerRow}>
            <View style={[styles.avatar, { backgroundColor: colors.accent2 + '22' }]}>
              <Text style={[styles.avatarText, { color: colors.accent2 }]}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.childName, { color: colors.textOnDark }]}>{childName}</Text>
              <View style={styles.headerMeta}>
                <SmartIcon name="football-outline" size={14} color={colors.accent1} />
                <Text style={[styles.headerMetaText, { color: colors.textMuted }]}>Player</Text>
                {isLive && (
                  <View style={[styles.liveBadge, { backgroundColor: colors.success + '33' }]}>
                    <Text style={{ fontSize: 9, color: colors.success, fontFamily: fontFamily.semiBold }}>
                      LIVE
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Action buttons */}
            <View style={styles.actionButtons}>
              <Pressable
                onPress={() => navigation.navigate('ParentAddExam', { childId, childName })}
                style={[styles.actionBtn, { backgroundColor: colors.warning + '18' }]}
              >
                <SmartIcon name="school-outline" size={14} color={colors.warning} />
                <Text style={[styles.actionBtnText, { color: colors.warning }]}>Exam</Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate('ParentAddStudy', { childId, childName })}
                style={[styles.actionBtn, { backgroundColor: colors.accent2 + '18' }]}
              >
                <SmartIcon name="book-outline" size={14} color={colors.accent2} />
                <Text style={[styles.actionBtnText, { color: colors.accent2 }]}>Study</Text>
              </Pressable>
            </View>
          </View>

          {/* Snapshot metrics */}
          {snapshot && (
            <View style={styles.snapshotRow}>
              <View style={styles.snapshotChip}>
                <View style={[styles.ragDot, { backgroundColor: ragToColor(snapshot.readiness_rag) }]} />
                <Text style={[styles.snapshotLabel, { color: colors.textMuted }]}>Readiness</Text>
              </View>
              {snapshot.wellness_7day_avg != null && (
                <View style={styles.snapshotChip}>
                  <Text style={[styles.snapshotValue, { color: colors.accent2 }]}>
                    {snapshot.wellness_7day_avg.toFixed(0)}
                  </Text>
                  <Text style={[styles.snapshotLabel, { color: colors.textMuted }]}>Wellness</Text>
                </View>
              )}
              {snapshot.dual_load_index != null && (
                <View style={styles.snapshotChip}>
                  <Text style={[styles.snapshotValue, { color: colors.accent1 }]}>
                    {snapshot.dual_load_index}
                  </Text>
                  <Text style={[styles.snapshotLabel, { color: colors.textMuted }]}>Load</Text>
                </View>
              )}
            </View>
          )}
        </GlassCard>
      </View>

      {/* ─── Tab Bar ─── */}
      <View style={[styles.tabBar, { borderBottomColor: colors.borderLight }]}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => handleTabPress(tab.key)}
              style={[
                styles.tab,
                isActive && { borderBottomColor: colors.accent1, borderBottomWidth: 2 },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: isActive ? colors.accent1 : colors.textInactive,
                    fontFamily: isActive ? fontFamily.semiBold : fontFamily.medium,
                  },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ─── Tab Content ─── */}
      <View style={styles.tabContent}>
        {activeTab === 'timeline' && (
          <>
            {backendError && (
              <ErrorState message="Could not load data. Pull to retry." onRetry={refresh} compact />
            )}
            <UnifiedDayView
              role="parent"
              isOwner={false}
              targetUserName={childName}
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
          </>
        )}

        {activeTab === 'exams' && (
          <ParentExamScreen
            childId={childId}
            childName={childName}
            navigation={navigation as any}
          />
        )}

        {activeTab === 'mastery' && (
          <ProgressScreen
            navigation={navigation as any}
            targetPlayerId={childId}
            targetPlayerName={childName}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontFamily: fontFamily.bold,
  },
  childName: {
    fontSize: 20,
    fontFamily: fontFamily.bold,
    marginBottom: 2,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerMetaText: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
  },
  liveBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  actionBtnText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
  },

  // Snapshot
  snapshotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  snapshotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  snapshotValue: {
    fontSize: 14,
    fontFamily: fontFamily.bold,
  },
  snapshotLabel: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
  },
  ragDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginHorizontal: layout.screenMargin,
    marginTop: spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 13,
  },
  tabContent: {
    flex: 1,
  },
});
