/**
 * Coach Player Detail Screen — Gen Z redesign with 3 inner tabs + swipe
 *
 * Tabs: Timeline | Programmes | Tests
 *
 * Compact player header card. Swipeable inner tabs.
 */

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  PanResponder,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SmartIcon } from '../../components/SmartIcon';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import { ErrorState } from '../../components';
import { ProgrammesTab } from '../../components/coach/ProgrammesTab';
import { TestsTab } from '../../components/coach/TestsTab';
import { PlayerScreen, FocusCard, type DialEvent } from '../../components/tomo-ui/playerDesign';
import { usePlayerCalendarData } from '../../hooks/usePlayerCalendarData';
import { fetchUnreadCommentEvents } from '../../services/api';
import { useTriangleSnapshot } from '../../hooks/useTriangleSnapshot';
import { ragToColor, acwrRiskLabel } from '../../hooks/useAthleteSnapshot';
import { useTheme } from '../../hooks/useTheme';
import { getPlayerReadiness } from '../../services/api';
import { toDateStr } from '../../utils/calendarHelpers';
import { GlassCard } from '../../components/GlassCard';
import { spacing, borderRadius, layout, fontFamily } from '../../theme';
import type { CoachStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<CoachStackParamList, 'CoachPlayerDetail'>;

type ActiveTab = 'timeline' | 'programmes' | 'metrics';

const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'programmes', label: 'Programs' },
  { key: 'metrics', label: 'Metrics' },
];

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dotColorForLevel(
  level: string | undefined,
  themeColors: { success: string; warning: string; error: string; textMuted: string },
): string {
  switch (level?.toUpperCase()) {
    case 'GREEN': return themeColors.success;
    case 'YELLOW': return themeColors.warning;
    case 'RED': return themeColors.error;
    default: return themeColors.textMuted;
  }
}

interface ReadinessEntry {
  date: string;
  level?: string;
  [key: string]: unknown;
}

const DIAL_TYPES: DialEvent['type'][] = ['training', 'match', 'recovery', 'study_block', 'exam', 'other'];
function toDialEventType(type: string): DialEvent['type'] {
  return (DIAL_TYPES as string[]).includes(type) ? (type as DialEvent['type']) : 'other';
}

function parseHHMM(hhmm: string): number {
  const [h, m] = (hhmm || '0:0').split(':').map((n) => parseInt(n, 10) || 0);
  return h + m / 60;
}

export function CoachPlayerDetailScreen({ route, navigation }: Props) {
  const { playerId, playerName } = route.params;
  const { colors } = useTheme();
  const { snapshot, isLive } = useTriangleSnapshot(playerId);

  const [activeTab, setActiveTab] = useState<ActiveTab>('timeline');
  const [readiness, setReadiness] = useState<ReadinessEntry[]>([]);

  // Calendar data for Timeline tab
  const calendar = usePlayerCalendarData(playerId, 'coach');
  const { events, isLoading, backendError, setSelectedDate, refresh, dayLocks } = calendar;

  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [unreadEventIds, setUnreadEventIds] = useState<Set<string>>(new Set());

  // Readiness dots
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await getPlayerReadiness(playerId);
        if (!isMounted) return;
        setReadiness((res.readiness as ReadinessEntry[]).slice(-14));
      } catch (e) {
        console.warn('[CoachPlayerDetailScreen] fetch readiness error:', e);
      }
    })();
    return () => { isMounted = false; };
  }, [playerId]);

  // Day navigation
  const goToPrevDay = useCallback(() => {
    setSelectedDay((prev) => { const next = addDays(prev, -1); setSelectedDate(next); return next; });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [setSelectedDate]);

  const goToNextDay = useCallback(() => {
    setSelectedDay((prev) => { const next = addDays(prev, 1); setSelectedDate(next); return next; });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [setSelectedDate]);

  const goToToday = useCallback(() => {
    const today = new Date(); setSelectedDay(today); setSelectedDate(today);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [setSelectedDate]);

  const todayStr = toDateStr(new Date());
  const selectedDayStr = toDateStr(selectedDay);
  const isToday = selectedDayStr === todayStr;

  // Load unread-comment event IDs for the visible day whenever the day or
  // player changes, and again on pull-to-refresh.
  const loadUnread = useCallback(async () => {
    try {
      const res = await fetchUnreadCommentEvents(selectedDayStr, selectedDayStr, playerId);
      setUnreadEventIds(new Set(res.eventIds || []));
    } catch (e) {
      console.warn('[CoachPlayerDetailScreen] fetchUnreadCommentEvents failed:', e);
    }
  }, [selectedDayStr, playerId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true); refresh(); loadUnread(); setTimeout(() => setRefreshing(false), 1000);
  }, [refresh, loadUnread]);

  useEffect(() => { loadUnread(); }, [loadUnread]);

  // Refresh the unread set whenever the screen regains focus — catches the
  // return path from CoachEventComments so the dot clears after opening.
  useFocusEffect(
    useCallback(() => { loadUnread(); }, [loadUnread])
  );

  const dayEvents = useMemo(
    () => events.filter((e) => e.date === selectedDayStr)
      .sort((a, b) => {
        if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
        if (a.startTime) return -1; if (b.startTime) return 1; return 0;
      }),
    [events, selectedDayStr],
  );

  const dayLabel = useMemo(() => {
    if (isToday) return 'Today';
    const yesterday = addDays(new Date(), -1);
    const tomorrow = addDays(new Date(), 1);
    if (toDateStr(yesterday) === selectedDayStr) return 'Yesterday';
    if (toDateStr(tomorrow) === selectedDayStr) return 'Tomorrow';
    return selectedDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }, [selectedDay, selectedDayStr, isToday]);

  // Tab swipe + press
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

  // Initials
  const initials = playerName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <PlayerScreen label="PLAYER" title={playerName ?? 'Detail'} onBack={() => navigation.goBack()} scroll={false}>
    <View style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
      {/* ─── Compact Player Header ─── */}
      <View style={{ paddingHorizontal: layout.screenMargin, paddingTop: spacing.xs }}>
        <View style={[styles.headerCard, { backgroundColor: colors.surfaceElevated }]}>
          <View style={styles.headerRow}>
            <View style={[styles.avatar, { backgroundColor: colors.accent1 + '22' }]}>
              <Text style={[styles.avatarText, { color: colors.accent1 }]}>{initials}</Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={[styles.playerName, { color: colors.textOnDark }]} numberOfLines={1}>
                {playerName}
              </Text>
              <View style={styles.headerChips}>
                {snapshot && (
                  <>
                    <View style={[styles.ragDot, { backgroundColor: ragToColor(snapshot.readiness_rag) }]} />
                    {snapshot.acwr != null && (
                      <Text style={[styles.chipText, { color: colors.accent2 }]}>
                        ACWR {snapshot.acwr.toFixed(1)}
                      </Text>
                    )}
                  </>
                )}
                {isLive && (
                  <View style={[styles.liveBadge, { backgroundColor: colors.success + '33' }]}>
                    <Text style={{ fontSize: 8, color: colors.success, fontFamily: fontFamily.semiBold }}>LIVE</Text>
                  </View>
                )}
              </View>
            </View>
            {/* Action buttons — compact */}
            <View style={styles.actionButtons}>
              <Pressable
                onPress={() => navigation.navigate('CoachAddProgram', { playerId, playerName })}
                style={[styles.actionBtn, { backgroundColor: colors.accent2 + '22' }]}
              >
                <SmartIcon name="barbell-outline" size={16} color={colors.accent2} />
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate('CoachTestInput', { playerId, playerName })}
                style={[styles.actionBtn, { backgroundColor: colors.accent1 }]}
              >
                <SmartIcon name="flash-outline" size={16} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          {/* Readiness dots — compact */}
          {readiness.length > 0 && (
            <View style={styles.readinessRow}>
              {readiness.map((entry, idx) => (
                <View
                  key={idx}
                  style={[styles.readinessDotSmall, { backgroundColor: dotColorForLevel(entry.level as string | undefined, colors) }]}
                />
              ))}
            </View>
          )}
        </View>
      </View>

      {/* ─── Tab Bar (text only, no icons) ─── */}
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
          <View style={{ flex: 1 }}>
            {backendError && <ErrorState message="Could not load data. Pull to retry." onRetry={refresh} compact />}

            {/* Day nav: prev / label / next */}
            <View style={styles.dayNav}>
              <Pressable onPress={goToPrevDay} hitSlop={12} style={[styles.dayNavArrow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                <SmartIcon name="chevron-back" size={22} color={colors.textOnDark} />
              </Pressable>
              <Pressable onPress={goToToday} style={styles.dayNavCenter}>
                <Text style={[styles.dayNavLabel, { color: isToday ? colors.accent1 : colors.textOnDark }]}>
                  {isToday ? `Today, ${selectedDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : selectedDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
              </Pressable>
              <Pressable onPress={goToNextDay} hitSlop={12} style={[styles.dayNavArrow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                <SmartIcon name="chevron-forward" size={22} color={colors.textOnDark} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.timelineScroll}
              contentContainerStyle={styles.timelineContent}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent1} />}
            >
              {dayEvents.length === 0 ? (
                <View style={styles.emptyTimeline}>
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>No events scheduled.</Text>
                </View>
              ) : (
                dayEvents.map((ev) => {
                  const nowDate = new Date();
                  const nowHour = nowDate.getHours() + nowDate.getMinutes() / 60;
                  const sH = parseHHMM(ev.startTime || '00:00');
                  const eH = parseHHMM(ev.endTime || ev.startTime || '00:00');
                  const running = isToday && nowHour >= sH && nowHour < eH;
                  const label = running ? 'Right now' : (ev.type || 'other').replace(/_/g, ' ').toUpperCase();
                  return (
                    <FocusCard
                      key={ev.id}
                      event={{
                        id: ev.id,
                        name: ev.name,
                        type: toDialEventType(ev.type),
                        startTime: ev.startTime || '00:00',
                        endTime: ev.endTime || ev.startTime || '00:00',
                      }}
                      label={label}
                      accent={running}
                      pulse={running}
                      unreadDot={unreadEventIds.has(ev.id)}
                      onPress={() => navigation.navigate('CoachEventComments', {
                        eventId: ev.id,
                        name: ev.name,
                        type: ev.type,
                        date: ev.date,
                        startTime: ev.startTime || '',
                        endTime: ev.endTime || '',
                        notes: ev.notes || '',
                        playerName,
                      })}
                    />
                  );
                })
              )}
            </ScrollView>
          </View>
        )}
        {activeTab === 'programmes' && (
          <ProgrammesTab playerId={playerId} playerName={playerName} />
        )}
        {activeTab === 'metrics' && (
          <TestsTab playerId={playerId} playerName={playerName} navigation={navigation} />
        )}
      </View>
    </View>
    </PlayerScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header — compact
  headerCard: {
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontFamily: fontFamily.bold,
  },
  headerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
  },
  headerChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  chipText: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
  },
  ragDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  liveBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Readiness dots
  readinessRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: spacing.xs,
    paddingHorizontal: 2,
  },
  readinessDotSmall: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
  },

  // Tab bar — text only
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginHorizontal: layout.screenMargin,
    marginTop: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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

  // Timeline (coach view — FocusCard list, no DayDial/PlanRow)
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenMargin,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  dayNavArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNavCenter: { alignItems: 'center' },
  dayNavLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
  },
  timelineScroll: { flex: 1 },
  timelineContent: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  emptyTimeline: {
    paddingVertical: spacing.huge,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
});
