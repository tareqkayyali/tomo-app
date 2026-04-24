/**
 * Training Screen (Timeline tab) — 1:1 port of variant-arc.jsx.
 *
 * Composition (top → bottom):
 *   Toolbar     — left: MyRules + BulkEdit, right: Checkin + Bell + Profile
 *   WeekStrip   — rolling 7-day window (today-5..today+1), grouped pill
 *   Day body     — single selected day: DayDial, PlanRow, FocusCard list (change day via week strip)
 *
 * Business-logic hooks preserved: useCalendarData, useCheckinStatus,
 * useBootData, useAuth. UnifiedDayView is gone — event CRUD lives behind
 * FocusCard press / dial-arc tap → EventEdit.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ErrorState, SkeletonCard } from '../components';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { SmartIcon } from '../components/SmartIcon';
import { SessionCompletionSheet } from '../components/calendar/SessionCompletionSheet';
import { skipCalendarEvent } from '../services/api';
import { emitRefresh } from '../utils/refreshBus';
import { fontFamily, screenBg } from '../theme';
import {
  PlanRow,
  DayDial,
  FocusCard,
  IconBtn,
  WeekStrip,
  type DialEvent,
  type WeekDay,
} from '../components/tomo-ui/playerDesign';
import { useAuth } from '../hooks/useAuth';
import { useBootData } from '../hooks/useBootData';
import { useCalendarData } from '../hooks/useCalendarData';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { useEnter } from '../hooks/useEnter';
import { useScheduleRules } from '../hooks/useScheduleRules';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';
import type { CalendarEvent } from '../types';
import { toDateStr } from '../utils/calendarHelpers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TIMELINE_FAB_PLUS = require('../../assets/plus-icon/timeline-fab-plus.png');
import { syncAutoBlocks } from '../services/api';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchUnreadCommentEvents } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList, MainTabParamList } from '../navigation/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TrainingScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Plan'>,
    NativeStackNavigationProp<MainStackParamList>
  >;
  route: {
    key: string;
    name: 'Plan';
    params?: { date?: string };
  };
};

type DotLevel = 'green' | 'yellow' | 'red';

/** Calendar row with a concrete time range (timeline cards / completion flow). */
type TimedCalendarEvent = CalendarEvent & { startTime: string; endTime: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Rolling 7-day window that centers `today`.
 * Produces [today-3 .. today+3], placing today at index 3 of 7.
 */
function windowStart(today: Date): Date {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 3);
  return d;
}

/** Horizontal week strip page index for the week that contains `selected` (local midnight). */
function weekScrollIndexForDate(selected: Date, anchorWeekStart: Date, numWeeks: number): number {
  const anchor = new Date(anchorWeekStart);
  anchor.setHours(0, 0, 0, 0);
  const sel = new Date(selected);
  sel.setHours(0, 0, 0, 0);
  const diffDays = Math.round((sel.getTime() - anchor.getTime()) / 86400000);
  let wk = Math.floor(diffDays / 7);
  if (wk < 0) wk = 0;
  if (wk >= numWeeks) wk = numWeeks - 1;
  return wk;
}

function normalizeRag(rag: string | null | undefined): DotLevel | null {
  if (!rag) return null;
  const v = rag.toUpperCase();
  if (v === 'GREEN') return 'green';
  if (v === 'YELLOW' || v === 'AMBER') return 'yellow';
  if (v === 'RED') return 'red';
  return null;
}

function ragLabel(rag: string | null | undefined): string {
  const v = normalizeRag(rag);
  if (v === 'green') return 'Recovered';
  if (v === 'yellow') return 'Hold steady';
  if (v === 'red') return 'Rest';
  return 'Check in';
}

/** Map a CalendarEvent.type to the DialEvent type palette. */
function toDialEventType(type: string): DialEvent['type'] {
  const allowed: DialEvent['type'][] = ['training', 'match', 'recovery', 'study_block', 'exam', 'other'];
  return (allowed as string[]).includes(type) ? (type as DialEvent['type']) : 'other';
}

// ---------------------------------------------------------------------------
// One day of Timeline (dial + plan + scrollable events)
// ---------------------------------------------------------------------------

type TimelineDayPaneProps = {
  pageDate: Date;
  todayStr: string;
  realEvents: CalendarEvent[];
  nowHour: number;
  parseHHMM: (s: string) => number;
  isWithin: (startTime: string, endTime: string) => boolean;
  readinessScore: number | null;
  readinessLabelStr: string;
  unreadCommentEventIds: Set<string>;
  dialSize: number;
  dialFabRight: number;
  dialFabBottom: number;
  navigation: TrainingScreenProps['navigation'];
  onAddEvent: () => void;
  onPlanDay: () => void;
  onPlanWeek: () => void;
  PHYSICAL_TYPES: Set<string>;
  busySkipId: string | null;
  onSkipPress: (e: TimedCalendarEvent) => void;
  onMarkDonePress: (e: TimedCalendarEvent) => void;
  shouldScrollOnFocus: boolean;
  /** True for the selected (center) day while calendar events for that day are loading. */
  blocksLoading: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
};

const TimelineDayPane = memo(function TimelineDayPane({
  pageDate,
  todayStr,
  realEvents,
  nowHour,
  parseHHMM,
  isWithin,
  readinessScore,
  readinessLabelStr,
  unreadCommentEventIds,
  dialSize,
  dialFabRight,
  dialFabBottom,
  navigation,
  onAddEvent,
  onPlanDay,
  onPlanWeek,
  PHYSICAL_TYPES,
  busySkipId,
  onSkipPress,
  onMarkDonePress,
  shouldScrollOnFocus,
  blocksLoading,
  styles,
  colors,
}: TimelineDayPaneProps) {
  const dayStr = toDateStr(pageDate);
  const isToday = dayStr === todayStr;
  const dialDateText = pageDate.toLocaleDateString('en', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const dayEvents = useMemo(
    () =>
      realEvents
        .filter((e) => e.date === dayStr)
        .sort((a, b) => {
          if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
          if (a.startTime) return -1;
          if (b.startTime) return 1;
          return 0;
        }),
    [realEvents, dayStr],
  );

  const timedDayEvents: TimedCalendarEvent[] = useMemo(
    () => dayEvents.filter((e): e is TimedCalendarEvent => Boolean(e.startTime && e.endTime)),
    [dayEvents],
  );

  // "Right now" / "Next up" highlight only on the real calendar today — never on other days.
  const highlightedId = useMemo(() => {
    if (!isToday) return null;
    const current = timedDayEvents.find((e) => isWithin(e.startTime, e.endTime));
    if (current) return current.id;
    const next = timedDayEvents.find((e) => parseHHMM(e.startTime) > nowHour);
    return next?.id ?? null;
  }, [timedDayEvents, isToday, nowHour, parseHHMM, isWithin]);

  const isCurrentlyRunning = useCallback(
    (e: TimedCalendarEvent) => {
      if (!isToday) return false;
      return isWithin(e.startTime, e.endTime);
    },
    [isToday, isWithin],
  );

  const eventCardLabel = useCallback(
    (e: TimedCalendarEvent) => {
      if (e.id !== highlightedId) {
        return e.type.replace(/_/g, ' ').toUpperCase();
      }
      return isCurrentlyRunning(e) ? 'Right now' : 'Next up';
    },
    [highlightedId, isCurrentlyRunning],
  );

  const isPastAndUnconfirmed = useCallback(
    (e: TimedCalendarEvent): boolean => {
      if (!PHYSICAL_TYPES.has(e.type)) return false;
      const status = (e as { status?: string | null }).status ?? null;
      if (status === 'completed' || status === 'skipped' || status === 'deleted') return false;
      if ((e as { completed?: boolean }).completed === true) return false;
      if (isCurrentlyRunning(e)) return false;
      const endHour = parseHHMM(e.endTime);
      if (!isToday) {
        const sel = new Date(`${dayStr}T00:00:00`).getTime();
        const today0 = new Date(`${todayStr}T00:00:00`).getTime();
        return sel < today0;
      }
      return endHour <= nowHour;
    },
    [PHYSICAL_TYPES, isCurrentlyRunning, isToday, nowHour, parseHHMM, dayStr, todayStr],
  );

  const toDial = useCallback(
    (e: CalendarEvent & { startTime: string; endTime: string }): DialEvent => ({
      id: e.id,
      name: e.name,
      type: toDialEventType(e.type),
      startTime: e.startTime,
      endTime: e.endTime,
    }),
    [],
  );

  const dialEvents: DialEvent[] = useMemo(
    () =>
      dayEvents
        .filter((e): e is CalendarEvent & { startTime: string; endTime: string } =>
          Boolean(e.startTime && e.endTime),
        )
        .map(toDial),
    [dayEvents, toDial],
  );

  const openEventEdit = useCallback(
    (evId: string) => {
      const ev = dayEvents.find((e) => e.id === evId) as CalendarEvent | undefined;
      if (!ev) return;
      navigation.navigate('EventEdit' as any, {
        eventId: ev.id,
        name: ev.name,
        type: ev.type,
        date: ev.date,
        startTime: ev.startTime ?? '',
        endTime: ev.endTime ?? '',
        notes: (ev as { notes?: string }).notes,
        intensity: (ev as { intensity?: string }).intensity,
        linkedPrograms: (ev as { linkedPrograms?: Array<{ programId: string; name: string; category?: string }> })
          .linkedPrograms,
      });
    },
    [navigation, dayEvents],
  );

  const eventsScrollRef = useRef<ScrollView>(null);
  const cardOffsetsRef = useRef<Map<string, number>>(new Map());
  const didScrollToHighlightRef = useRef<string | null>(null);

  useEffect(() => {
    cardOffsetsRef.current = new Map();
    didScrollToHighlightRef.current = null;
  }, [dayStr]);

  const maybeScrollToHighlight = useCallback(() => {
    if (!highlightedId) return;
    if (didScrollToHighlightRef.current === highlightedId) return;
    const y = cardOffsetsRef.current.get(highlightedId);
    if (y == null) return;
    didScrollToHighlightRef.current = highlightedId;
    requestAnimationFrame(() => {
      eventsScrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    });
  }, [highlightedId]);

  const onCardLayout = useCallback(
    (id: string, yOffset: number) => {
      cardOffsetsRef.current.set(id, yOffset);
      if (id === highlightedId) maybeScrollToHighlight();
    },
    [highlightedId, maybeScrollToHighlight],
  );

  useFocusEffect(
    useCallback(() => {
      if (!shouldScrollOnFocus) return;
      didScrollToHighlightRef.current = null;
      maybeScrollToHighlight();
    }, [shouldScrollOnFocus, maybeScrollToHighlight]),
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.dialWrap, { marginBottom: 2 }]}>
        <DayDial
          events={dialEvents}
          nowHour={nowHour}
          score={readinessScore ?? 0}
          readinessLabel={readinessLabelStr}
          dateText={dialDateText}
          size={dialSize}
          showNowPointer={isToday}
          onEvent={(ev) => openEventEdit(ev.id)}
        />
        <Pressable
          onPress={onAddEvent}
          accessibilityRole="button"
          accessibilityLabel="Add timeline block"
          hitSlop={10}
          style={({ pressed }) => [
            styles.dialFab,
            {
              right: dialFabRight,
              bottom: dialFabBottom,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
        >
          <Image
            source={TIMELINE_FAB_PLUS}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </Pressable>
      </View>

      <View style={styles.checkinWrap}>
        <PlanRow onPlanDay={onPlanDay} onPlanWeek={onPlanWeek} />
      </View>

      <View style={[styles.eventsScrollWrap, { flex: 1 }]}>
        <ScrollView
          ref={eventsScrollRef}
          style={styles.eventsScroll}
          contentContainerStyle={styles.eventsScrollContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {blocksLoading ? (
            <View style={styles.blocksLoading} accessibilityLabel="Loading day schedule">
              <ActivityIndicator size="small" color={colors.tomoSage} />
            </View>
          ) : timedDayEvents.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyDot} />
            </View>
          ) : (
            timedDayEvents.map((ev) => {
              const highlighted = ev.id === highlightedId;
              const running = highlighted && isCurrentlyRunning(ev);
              const showActions = isPastAndUnconfirmed(ev);
              return (
                <View key={ev.id} onLayout={(e) => onCardLayout(ev.id, e.nativeEvent.layout.y)}>
                  <FocusCard
                    event={{
                      id: ev.id,
                      name: ev.name,
                      type: toDialEventType(ev.type),
                      startTime: ev.startTime,
                      endTime: ev.endTime,
                    }}
                    label={eventCardLabel(ev)}
                    accent={highlighted}
                    pulse={running}
                    unreadDot={unreadCommentEventIds.has(ev.id)}
                    onPress={() => openEventEdit(ev.id)}
                  />
                  {showActions && (
                    <View style={styles.completionActions}>
                      <Pressable
                        onPress={() => onSkipPress(ev)}
                        disabled={busySkipId === ev.id}
                        style={[
                          styles.completionSkip,
                          { borderColor: colors.cream10 },
                          busySkipId === ev.id && { opacity: 0.4 },
                        ]}
                      >
                        <Text style={[styles.completionSkipText, { color: colors.muted }]}>
                          {busySkipId === ev.id ? '…' : 'Skip'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onMarkDonePress(ev)}
                        style={[styles.completionDone, { backgroundColor: colors.tomoSage }]}
                      >
                        <Text style={[styles.completionDoneText, { color: colors.background }]}>
                          Mark done
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TrainingScreen({ navigation, route }: TrainingScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const routeDate = route?.params?.date;

  const { profile } = useAuth();
  const { needsCheckin, isStale, checkinAgeHours } = useCheckinStatus();
  const { bootData } = useBootData();
  const { rules } = useScheduleRules();

  const calendar = useCalendarData();
  const {
    events: rawEvents,
    checkins,
    isLoading,
    isRefreshing,
    backendError,
    setSelectedDate,
    refresh,
  } = calendar;

  // Display bridge for the legacy "Sleep" auto-block pattern. Older rows are
  // stored as evening-only (sleepStart → 23:59); the My Rules contract is
  // overnight (sleepStart → sleepEnd the next morning). Override the display
  // endTime with rules.sleep_end so the circle arc + FocusCard render
  // "10 PM – 6 AM" immediately, even before the backend auto-block re-sync
  // rewrites the row. EventEdit consumes these same values via openEventEdit,
  // so editing a Sleep block also shows the true overnight range.
  const sleepEndOverride = rules?.preferences?.sleep_end ?? '06:00';
  const hasLegacySleep = useMemo(
    () => rawEvents.some((e) => e.name === 'Sleep' && e.type === 'other' && e.endTime === '23:59'),
    [rawEvents],
  );
  const realEvents = useMemo(() => {
    return rawEvents.map((ev) => {
      if (ev.name === 'Sleep' && ev.type === 'other' && ev.endTime === '23:59') {
        return { ...ev, endTime: sleepEndOverride };
      }
      return ev;
    });
  }, [rawEvents, sleepEndOverride]);

  // One-shot background migration: when we see legacy 23:59 Sleep rows AND
  // the athlete has sleep rules configured, call /auto-block once. The
  // backend detects the old pattern and deletes-then-recreates as the
  // overnight shape. Refreshes the calendar after so the bridge can retire.
  const migrationFiredRef = useRef(false);
  useEffect(() => {
    if (migrationFiredRef.current) return;
    if (!hasLegacySleep) return;
    const prefs = rules?.preferences;
    if (!prefs?.sleep_start || !prefs?.sleep_end) return;
    migrationFiredRef.current = true;
    (async () => {
      try {
        await syncAutoBlocks({
          schoolDays: prefs.school_days as number[],
          schoolStart: prefs.school_start,
          schoolEnd: prefs.school_end,
          sleepStart: prefs.sleep_start,
          sleepEnd: prefs.sleep_end,
        });
        refresh();
      } catch (err) {
        console.warn('[Training] Sleep auto-block migration failed (non-fatal):', err);
      }
    })();
  }, [hasLegacySleep, rules, refresh]);

  // Mark loading as done after the first fetch settles.
  const hasLoadedOnce = useRef(false);
  useEffect(() => {
    if (!isLoading && !hasLoadedOnce.current) hasLoadedOnce.current = true;
  }, [isLoading]);

  // Day mode matches variant-arc's single-day view.
  useEffect(() => {
    calendar.setViewMode('day');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Selected day ────────────────────────────────────────────────
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  // Deep-link: focus the day view when nav passes a `date` param.
  useEffect(() => {
    if (!routeDate) return;
    const parsed = new Date(`${routeDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    setSelectedDay(parsed);
    setSelectedDate(parsed);
  }, [routeDate, setSelectedDate]);

  const handleDaySelect = useCallback(
    (date: Date) => {
      setSelectedDay(date);
      setSelectedDate(date);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [setSelectedDate],
  );

  // ─── Today / selectedDay strings ─────────────────────────────────
  const todayStr = toDateStr(new Date());
  const selectedDayStr = toDateStr(selectedDay);

  // ─── Unread-comment event IDs (for the red dot on FocusCard) ──────
  // Refetched on day change and whenever the screen regains focus (catches
  // return from EventEdit, where GET /comments auto-clears the unread row).
  const [unreadCommentEventIds, setUnreadCommentEventIds] = useState<Set<string>>(new Set());
  const loadUnreadComments = useCallback(async () => {
    try {
      const res = await fetchUnreadCommentEvents(selectedDayStr, selectedDayStr);
      setUnreadCommentEventIds(new Set(res.eventIds || []));
    } catch (e) {
      console.warn('[TrainingScreen] fetchUnreadCommentEvents failed:', e);
    }
  }, [selectedDayStr]);
  useEffect(() => { loadUnreadComments(); }, [loadUnreadComments]);
  useFocusEffect(
    useCallback(() => { loadUnreadComments(); }, [loadUnreadComments])
  );

  // ─── Week strip: pageable across weeks (8 past + current + 8 future) ──
  const NUM_WEEKS = 17;
  const CURRENT_WEEK_IDX = 8;

  // Anchor: week 0 of the visible range. Anchor = today's window minus
  // CURRENT_WEEK_IDX weeks. Stable for the screen lifetime.
  const anchorWeekStart = useMemo(() => {
    const cur = windowStart(new Date());
    return addDays(cur, -CURRENT_WEEK_IDX * 7);
  }, []);

  // Readiness lookup: date → level. Shared across all rendered weeks.
  const readinessByDate = useMemo(() => {
    const m = new Map<string, DotLevel>();
    for (const c of checkins) {
      const lvl = normalizeRag((c as { readinessLevel?: string | null }).readinessLevel ?? null);
      if (lvl) m.set(c.date, lvl);
    }
    return m;
  }, [checkins]);

  const allWeeks: WeekDay[][] = useMemo(() => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return Array.from({ length: NUM_WEEKS }, (_, weekIdx) => {
      const weekStart = addDays(anchorWeekStart, weekIdx * 7);
      return Array.from({ length: 7 }, (_, dayIdx) => {
        const d = addDays(weekStart, dayIdx);
        const dStr = toDateStr(d);
        return {
          d: d.getDate(),
          label: dayNames[d.getDay()],
          readiness: readinessByDate.get(dStr) ?? null,
          today: dStr === todayStr,
        };
      });
    });
  }, [anchorWeekStart, readinessByDate, todayStr]);

  // For each week, the active pill index — only set if selectedDay falls
  // inside that week. Off-week pages render with no active pill.
  // weekStart is at 00:00 local (from windowStart), so we normalize
  // selectedDay to midnight too — otherwise time-of-day rolls the diff
  // forward a full day (e.g. today @ 16:15 looked like tomorrow).
  const activeIdxFor = useCallback(
    (weekIdx: number) => {
      const weekStart = addDays(anchorWeekStart, weekIdx * 7);
      const selMidnight = new Date(selectedDay);
      selMidnight.setHours(0, 0, 0, 0);
      const diff = Math.round(
        (selMidnight.getTime() - weekStart.getTime()) / 86400000,
      );
      return diff >= 0 && diff <= 6 ? diff : -1;
    },
    [anchorWeekStart, selectedDay],
  );

  const onWeekDaySelect = useCallback(
    (weekIdx: number, dayIdx: number) => {
      const weekStart = addDays(anchorWeekStart, weekIdx * 7);
      handleDaySelect(addDays(weekStart, dayIdx));
    },
    [anchorWeekStart, handleDaySelect],
  );

  // Horizontal paging — initial offset puts current week on screen.
  const SCREEN_WIDTH = useMemo(() => Dimensions.get('window').width, []);
  const stripScrollRef = useRef<ScrollView>(null);
  const stripHasSyncedRef = useRef(false);
  useEffect(() => {
    const wk = weekScrollIndexForDate(selectedDay, anchorWeekStart, NUM_WEEKS);
    const animated = stripHasSyncedRef.current;
    stripHasSyncedRef.current = true;
    requestAnimationFrame(() => {
      stripScrollRef.current?.scrollTo({ x: wk * SCREEN_WIDTH, animated });
    });
  }, [selectedDayStr, selectedDay, anchorWeekStart, SCREEN_WIDTH, NUM_WEEKS]);

  // ─── Time helpers ────────────────────────────────────────────────
  const nowHour = useMemo(() => {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  }, []);

  const parseHHMM = useCallback((s: string) => {
    const [h, m] = s.split(':').map(Number);
    return h + (m || 0) / 60;
  }, []);

  // Overnight-aware "is this hour inside [start, end)?" check. When endTime
  // is earlier than startTime (e.g. Sleep 22:00 → 06:30), the window wraps
  // past midnight; on the starting calendar day we're "inside" when nowHour
  // is at or past start, on the ending calendar day when nowHour is before
  // end. The Plan tab only evaluates this on the currently selected day, so
  // the 22:00-side half is what matters while "today" is the start day.
  const isWithin = useCallback(
    (startTime: string, endTime: string) => {
      const s = parseHHMM(startTime);
      const eT = parseHHMM(endTime);
      if (eT <= s) return nowHour >= s || nowHour < eT;
      return nowHour >= s && nowHour < eT;
    },
    [nowHour, parseHHMM],
  );

  // ─── Session completion (PR 6B) ──────────────────────────────────
  // A past-dated event of a physical type (training/match/recovery) that
  // hasn't been confirmed yet gets the "Mark done" / "Skip" action row
  // beneath its FocusCard. Tapping "Mark done" opens the confirmation
  // sheet with RPE/duration capture; tapping "Skip" fires
  // POST /api/v1/calendar/events/:id/skip with no body.
  const [completionSheetEvent, setCompletionSheetEvent] = useState<TimedCalendarEvent | null>(null);
  const [busySkipId, setBusySkipId] = useState<string | null>(null);

  const PHYSICAL_TYPES = useMemo(
    () => new Set<string>(['training', 'match', 'recovery']),
    [],
  );

  const handleSkipPress = useCallback(
    async (e: TimedCalendarEvent) => {
      if (busySkipId) return;
      setBusySkipId(e.id);
      try {
        await skipCalendarEvent(e.id);
        emitRefresh('calendar');
      } catch (err: any) {
        Alert.alert('Could not save', err?.message ?? 'Please try again.');
      } finally {
        setBusySkipId(null);
      }
    },
    [busySkipId],
  );

  // ─── Readiness (from bootData snapshot + checkin status) ─────────
  const snapshot = (bootData?.snapshot ?? null) as
    | { readiness_score?: number | null; readiness_rag?: string | null }
    | null;
  const lastCheckinAt = (bootData?.snapshot as { last_checkin_at?: string | null } | null)?.last_checkin_at ?? null;
  const readinessStale =
    needsCheckin ||
    (lastCheckinAt ? Date.now() - new Date(lastCheckinAt).getTime() > 24 * 3600000 : false);
  const readinessScore =
    !readinessStale && typeof snapshot?.readiness_score === 'number' ? Math.round(snapshot.readiness_score) : null;
  const readinessRag = readinessStale ? null : snapshot?.readiness_rag ?? null;
  const readinessLabelStr = ragLabel(readinessRag);

  const onPlanDay = useCallback(() => {
    // Route to the AI chat with a prefilled intent — matches the design's
    // "Plan day" as a coach-led dialog, not a form.
    (navigation as any).navigate('Chat', { prefillMessage: 'Help me plan my day', autoSend: true });
  }, [navigation]);

  const onPlanWeek = useCallback(() => {
    (navigation as any).navigate('Chat', { prefillMessage: 'Help me plan my week', autoSend: true });
  }, [navigation]);

  // ─── Header avatar initial ───────────────────────────────────────
  const initial = (profile?.name ?? 'A').charAt(0).toUpperCase();

  // ─── Toolbar render — left: MyRules + BulkEdit, right: Checkin + Bell + Profile
  const renderToolbar = () => (
    <View style={styles.toolbar}>
      <View style={styles.toolbarLeft}>
        <IconBtn onPress={() => navigation.navigate('MyRules' as any)}>
          <SmartIcon name="options-outline" size={18} color={colors.tomoCream} />
        </IconBtn>
        <IconBtn onPress={() => navigation.navigate('BulkEditEvents' as any)}>
          <SmartIcon name="copy-outline" size={18} color={colors.tomoCream} />
        </IconBtn>
      </View>
      <View style={styles.toolbarRight}>
        <CheckinHeaderButton
          needsCheckin={needsCheckin}
          isStale={isStale}
          checkinAgeHours={checkinAgeHours}
          onPress={() => navigation.navigate('Checkin' as any)}
        />
        <NotificationBell />
        <HeaderProfileButton initial={initial} photoUrl={profile?.photoUrl ?? undefined} />
      </View>
    </View>
  );

  // ─── Entry animations ────────────────────────────────────────────
  const enterHeader = useEnter(0);
  const enterStrip = useEnter(140);
  const enterDial = useEnter(260);
  const enterCards = useEnter(380);

  // ─── Dial size: cap at ~286 (20% larger than the prior 0.7 factor). ──
  // All inner elements (R_OUTER/R_INNER/R_TRACK, ticks, hour labels via
  // polar(R_OUTER + offsetR), arcs, now-pointer) are derived from `size`
  // inside DayDial, so scaling `size` scales every element proportionally.
  const dialSize = useMemo(() => Math.min(Dimensions.get('window').width - 40, 340) * 0.84, []);
  // FAB is anchored to the screen's right edge, flush with Plan Week's right
  // edge (both use 20pt of horizontal padding from the screen). Sits just
  // above PlanRow's top, inside the dialWrap's bottom area.
  const dialFabRight = 20;
  const dialFabBottom = 10;

  // ─── Loading gate ────────────────────────────────────────────────
  if (isLoading && !hasLoadedOnce.current) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderToolbar()}
        <View style={styles.loadingContainer}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ─── PINNED TOP: toolbar + week strip + dial + checkin row ─── */}
      <Animated.View style={enterHeader}>{renderToolbar()}</Animated.View>

      {backendError && (
        <View style={styles.errorWrap}>
          <ErrorState message="Could not load data. Pull to retry." onRetry={refresh} compact />
        </View>
      )}

      <Animated.View style={[styles.stripWrap, enterStrip]}>
        <ScrollView
          ref={stripScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          contentOffset={{ x: CURRENT_WEEK_IDX * SCREEN_WIDTH, y: 0 }}
        >
          {allWeeks.map((days, weekIdx) => (
            <View key={weekIdx} style={{ width: SCREEN_WIDTH }}>
              <WeekStrip
                days={days}
                activeIdx={activeIdxFor(weekIdx)}
                onSelect={(dayIdx) => onWeekDaySelect(weekIdx, dayIdx)}
                softenActiveSelection={selectedDayStr !== todayStr}
              />
            </View>
          ))}
        </ScrollView>
        {isRefreshing ? (
          <View style={styles.refreshingHint}>
            <ActivityIndicator size="small" color={colors.tomoSage} />
            <Text style={styles.refreshingHintText}>Updating timeline…</Text>
          </View>
        ) : null}
      </Animated.View>

      <Animated.View style={[{ flex: 1 }, enterDial, enterCards]}>
        <TimelineDayPane
          pageDate={selectedDay}
          todayStr={todayStr}
          realEvents={realEvents}
          nowHour={nowHour}
          parseHHMM={parseHHMM}
          isWithin={isWithin}
          readinessScore={readinessScore}
          readinessLabelStr={readinessLabelStr}
          unreadCommentEventIds={unreadCommentEventIds}
          dialSize={dialSize}
          dialFabRight={dialFabRight}
          dialFabBottom={dialFabBottom}
          navigation={navigation}
          onAddEvent={() => navigation.navigate('AddEvent' as any, { date: selectedDayStr })}
          onPlanDay={onPlanDay}
          onPlanWeek={onPlanWeek}
          PHYSICAL_TYPES={PHYSICAL_TYPES}
          busySkipId={busySkipId}
          onSkipPress={handleSkipPress}
          onMarkDonePress={setCompletionSheetEvent}
          shouldScrollOnFocus
          blocksLoading={isLoading && !hasLoadedOnce.current}
          styles={styles}
          colors={colors}
        />
      </Animated.View>

      <SessionCompletionSheet
        visible={completionSheetEvent !== null}
        event={completionSheetEvent as CalendarEvent | null}
        onClose={() => setCompletionSheetEvent(null)}
        onConfirmed={() => {
          emitRefresh('calendar');
        }}
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
      backgroundColor: screenBg,
    },
    scroll: {
      paddingBottom: 120,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 6,
      paddingBottom: 4,
    },
    toolbarLeft: {
      flexDirection: 'row',
      gap: 8,
    },
    toolbarRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    stripWrap: {
      paddingTop: 0,
      paddingBottom: 4,
    },
    dialWrap: {
      alignItems: 'center',
      marginTop: 0,
      marginBottom: 2,
    },
    // Floating add-timeline-block — bitmap from ~/Desktop/tomo/files/plus icon/
    // (synced to assets/plus-icon/). @2x/@3x for sharp raster on device.
    dialFab: {
      position: 'absolute',
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 10,
    },
    checkinWrap: {
      paddingHorizontal: 20,
      paddingTop: 2,
      paddingBottom: 6,
    },
    eventsScrollWrap: {
      flex: 1,
      paddingTop: 4,
    },
    eventsScroll: {
      flex: 1,
    },
    eventsScrollContent: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 120,
      gap: 10,
    },
    blocksLoading: {
      minHeight: 140,
      paddingTop: 32,
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    emptyState: {
      paddingTop: 24,
      alignItems: 'center',
    },
    completionActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
      marginLeft: 54, // aligns under the card body (past the icon column)
    },
    completionSkip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: 'center',
    },
    completionSkipText: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      letterSpacing: 0.3,
    },
    completionDone: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 999,
      alignItems: 'center',
    },
    completionDoneText: {
      fontFamily: fontFamily.bold,
      fontSize: 12,
      letterSpacing: 0.3,
    },
    emptyDot: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: colors.cream10,
    },
    errorWrap: {
      paddingHorizontal: 20,
      paddingVertical: 4,
    },
    loadingContainer: {
      paddingHorizontal: 20,
      paddingTop: 8,
      gap: 12,
    },
    refreshingHint: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 6,
    },
    refreshingHintText: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.muted,
      letterSpacing: 0.2,
    },
  });
}
