/**
 * Training Screen (Timeline tab) — 1:1 port of variant-arc.jsx.
 *
 * Composition (top → bottom):
 *   Toolbar     — left: MyRules + BulkEdit, right: Checkin + Bell + Profile
 *   WeekStrip   — rolling 7-day window (today-5..today+1), grouped pill
 *   DayDial     — 24h radial clock, event arcs, now-pointer, readiness center
 *   FocusCard   — "Right now" (sage accent)
 *   FocusCard   — "Next up"
 *   CheckinRow  — Check in / Plan day
 *
 * Business-logic hooks preserved: useCalendarData, useCheckinStatus,
 * useBootData, useAuth. UnifiedDayView is gone — event CRUD lives behind
 * FocusCard press / dial-arc tap → EventEdit.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { ErrorState, SkeletonCard } from '../components';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { SmartIcon } from '../components/SmartIcon';
import {
  CheckinRow,
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
import { syncAutoBlocks } from '../services/api';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
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
  const isToday = selectedDayStr === todayStr;

  // ─── Events for the selected day ─────────────────────────────────
  const dayEvents = useMemo(
    () =>
      realEvents
        .filter((e) => e.date === selectedDayStr)
        .sort((a, b) => {
          if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
          if (a.startTime) return -1;
          if (b.startTime) return 1;
          return 0;
        }),
    [realEvents, selectedDayStr],
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
  useEffect(() => {
    // Some platforms ignore contentOffset on first layout; force after mount.
    requestAnimationFrame(() => {
      stripScrollRef.current?.scrollTo({ x: CURRENT_WEEK_IDX * SCREEN_WIDTH, animated: false });
    });
  }, [SCREEN_WIDTH]);

  // ─── Time helpers ────────────────────────────────────────────────
  const nowHour = useMemo(() => {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  }, []);

  const parseHHMM = useCallback((s: string) => {
    const [h, m] = s.split(':').map(Number);
    return h + (m || 0) / 60;
  }, []);

  // Timed events for the selected day (untimed all-day items skipped from
  // the scrollable list — they don't fit the time-card layout).
  type TimedEvent = CalendarEvent & { startTime: string; endTime: string };
  const timedDayEvents: TimedEvent[] = useMemo(
    () => dayEvents.filter((e): e is TimedEvent => Boolean(e.startTime && e.endTime)),
    [dayEvents],
  );

  // Highlight: currently-running event if today; else next upcoming; else first.
  const highlightedId = useMemo(() => {
    if (!isToday) return timedDayEvents[0]?.id ?? null;
    const current = timedDayEvents.find((e) => {
      const s = parseHHMM(e.startTime);
      const eT = parseHHMM(e.endTime);
      return nowHour >= s && nowHour < eT;
    });
    if (current) return current.id;
    const next = timedDayEvents.find((e) => parseHHMM(e.startTime) > nowHour);
    return next?.id ?? null;
  }, [timedDayEvents, isToday, nowHour, parseHHMM]);

  const isCurrentlyRunning = useCallback(
    (e: TimedEvent) => {
      if (!isToday) return false;
      const s = parseHHMM(e.startTime);
      const eT = parseHHMM(e.endTime);
      return nowHour >= s && nowHour < eT;
    },
    [isToday, nowHour, parseHHMM],
  );

  const eventCardLabel = useCallback(
    (e: TimedEvent) => {
      if (e.id !== highlightedId) {
        return e.type.replace(/_/g, ' ').toUpperCase();
      }
      return isCurrentlyRunning(e) ? 'Right now' : 'Next up';
    },
    [highlightedId, isCurrentlyRunning],
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

  // ─── Navigation handlers ─────────────────────────────────────────
  // EventEdit expects the full event shape (eventId alone → "Invalid Date").
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

  const onCheckin = useCallback(() => {
    navigation.navigate('Checkin' as any);
  }, [navigation]);

  const onPlanDay = useCallback(() => {
    // Route to the AI chat with a prefilled intent — matches the design's
    // "Plan day" as a coach-led dialog, not a form.
    (navigation as any).navigate('Chat', { prefillMessage: 'Help me plan my day', autoSend: true });
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

  // ─── Today label for the dial (e.g. "Saturday, Apr 19") ──────────
  const dialDateText = useMemo(
    () =>
      selectedDay.toLocaleDateString('en', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
    [selectedDay],
  );

  // ─── Entry animations ────────────────────────────────────────────
  const enterHeader = useEnter(0);
  const enterStrip = useEnter(140);
  const enterDial = useEnter(260);
  const enterCards = useEnter(380);

  // ─── Dial size: cap at ~238 (30% smaller than the prior 340 max) ──
  // Frees vertical space for the scrollable events list below.
  const dialSize = useMemo(() => Math.min(Dimensions.get('window').width - 40, 340) * 0.7, []);

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
              />
            </View>
          ))}
        </ScrollView>
      </Animated.View>

      <Animated.View style={[styles.dialWrap, enterDial]}>
        <DayDial
          events={dialEvents}
          nowHour={nowHour}
          score={readinessScore ?? 0}
          readinessLabel={readinessLabelStr}
          dateText={dialDateText}
          size={dialSize}
          onEvent={(ev) => openEventEdit(ev.id)}
        />
      </Animated.View>

      <Animated.View style={[styles.checkinWrap, enterCards]}>
        <CheckinRow
          onCheckin={onCheckin}
          onPlanDay={onPlanDay}
          checkinLabel={needsCheckin ? 'Check in' : 'Update check-in'}
          planLabel="Plan day"
        />
      </Animated.View>

      {/* ─── SCROLLABLE EVENTS LIST ─── */}
      <Animated.View style={[styles.eventsScrollWrap, enterCards]}>
        <ScrollView
          style={styles.eventsScroll}
          contentContainerStyle={styles.eventsScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {timedDayEvents.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyDot} />
            </View>
          ) : (
            timedDayEvents.map((ev) => {
              const highlighted = ev.id === highlightedId;
              const running = highlighted && isCurrentlyRunning(ev);
              return (
                <FocusCard
                  key={ev.id}
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
                  onPress={() => openEventEdit(ev.id)}
                />
              );
            })
          )}
        </ScrollView>
      </Animated.View>
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
    emptyState: {
      paddingTop: 24,
      alignItems: 'center',
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
  });
}
