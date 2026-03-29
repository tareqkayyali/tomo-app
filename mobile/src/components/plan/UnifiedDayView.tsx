/**
 * UnifiedDayView — Shared day-view component for player, coach, and parent.
 *
 * Player: full interactive view (readiness, balance, check-in, day grid, lock, FAB)
 * Coach/Parent: read-only view (day grid + lock badge, recommend FAB)
 */

import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { PinchGestureHandler, State as GestureState } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  ExamStudyPlanner,
} from '../../components';
import type { UpcomingExam } from '../../components';
import { SpineTimeline } from '../../components/calendar/SpineTimeline';
import { DayLockButton } from '../../components/calendar/DayLockButton';
import { ScrollFadeOverlay } from '../../components/ScrollFadeOverlay';
import { SuggestionsBanner } from '../../components/SuggestionsBanner';
import { DayStrip } from './DayStrip';
import { spacing, layout, shadows, fontFamily, borderRadius } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../theme/colors';
import type { CalendarEvent, Suggestion } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnifiedDayViewProps {
  // Role context
  role: 'player' | 'coach' | 'parent';
  isOwner: boolean;
  targetUserName?: string;

  // Calendar data
  events: CalendarEvent[];
  selectedDay: Date;
  dayLabel: string;
  isToday: boolean;
  isLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;

  // Day navigation
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onDaySelect?: (date: Date) => void;

  // Day lock
  isLocked?: boolean;
  isLockLoading?: boolean;
  onToggleLock?: () => Promise<void>;

  // Day grid interactions
  onEmptySlotPress?: (time: string) => void;
  onEventDrop?: (eventId: string, newStartTime: string, newEndTime: string) => void;

  // Player-only props (undefined for coach/parent)
  hasCheckedInToday?: boolean;
  suggestions?: Suggestion[];
  onSuggestionResolved?: (id: string, status: string) => void;
  upcomingExams?: UpcomingExam[];
  completedEvents?: Set<string>;
  onComplete?: (id: string) => void;
  onSkip?: (id: string) => void;
  onUndo?: (id: string) => void;
  onDelete?: (id: string) => Promise<boolean> | void;
  onUpdate?: (id: string, patch: { startTime?: string; endTime?: string }) => Promise<boolean>;
  onCheckinPress?: () => void;
  onJournalPress?: (event: CalendarEvent) => void;

}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UnifiedDayView({
  role,
  isOwner,
  targetUserName,
  events,
  selectedDay,
  dayLabel,
  isToday,
  isLoading,
  refreshing,
  onRefresh,
  onPrevDay,
  onNextDay,
  onToday,
  onDaySelect,
  isLocked = false,
  isLockLoading = false,
  onToggleLock,
  onEmptySlotPress,
  onEventDrop,
  hasCheckedInToday,
  suggestions,
  onSuggestionResolved,
  upcomingExams,
  completedEvents,
  onComplete,
  onSkip,
  onUndo,
  onDelete,
  onUpdate,
  onCheckinPress,
  onJournalPress,
}: UnifiedDayViewProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const emptyCompleted = useMemo(() => new Set<string>(), []);
  const noop = () => {};

  // Zoom controls for timeline (buttons + pinch)
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const zoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(1.5, Math.round((prev + 0.1) * 10) / 10));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(0.7, Math.round((prev - 0.1) * 10) / 10));
  }, []);

  // Pinch-to-zoom: update zoom level on pinch end
  const pinchRef = React.useRef<any>(null);
  const nativeScrollRef = React.useRef<any>(null);
  const pinchBaseRef = React.useRef(1.0);

  // Sync pinchBase when zoom buttons change the level
  React.useEffect(() => {
    pinchBaseRef.current = zoomLevel;
  }, [zoomLevel]);

  const onPinchGestureEvent = useCallback((event: any) => {
    // Live preview not needed — we update on state change only
  }, []);

  const onPinchStateChange = useCallback((event: any) => {
    if (event.nativeEvent.oldState === GestureState.ACTIVE) {
      const raw = pinchBaseRef.current * event.nativeEvent.scale;
      const clamped = Math.min(1.5, Math.max(0.7, raw));
      pinchBaseRef.current = clamped;
      setZoomLevel(Math.round(clamped * 10) / 10);
    }
  }, []);

  const navigation = useNavigation<any>();

  // ScrollView ref for drag-scroll coordination
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollEnabledRef = useRef((enabled: boolean) => {
    scrollViewRef.current?.setNativeProps?.({ scrollEnabled: enabled });
  });

  // Auto-scroll to current time on today's view
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (isToday && !hasScrolledRef.current && scrollViewRef.current) {
      hasScrolledRef.current = true;
      // Calculate Y offset: each 30-min slot = 60px, grid starts at 6 AM
      // Scroll to ~1 hour before current time for context
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const gridStartMinutes = 6 * 60; // 6 AM
      const minutesIntoGrid = Math.max(0, currentMinutes - gridStartMinutes - 60); // 1h before
      const scrollY = (minutesIntoGrid / 30) * 60; // px
      // Small delay to ensure layout is ready
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: Math.max(0, scrollY), animated: false });
      }, 100);
    }
    // Reset when navigating away from today
    if (!isToday) {
      hasScrolledRef.current = false;
    }
  }, [isToday]);

  // Unified day display — same format for all days
  const dayDisplayText = useMemo(() => {
    const day = selectedDay.toLocaleDateString('en-US', { weekday: 'short' });
    const date = selectedDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (isToday) return `Today, ${date}`;
    return `${day}, ${date}`;
  }, [isToday, selectedDay]);

  return (
    <View style={{ flex: 1 }}>
      {/* ─── Day Strip Navigation ─── */}
      {onDaySelect ? (
        <DayStrip selectedDate={selectedDay} onSelect={onDaySelect} />
      ) : (
        /* Fallback: arrow nav for coach/parent views without onDaySelect */
        <View style={styles.dayNav}>
          <Pressable onPress={onPrevDay} hitSlop={12} style={styles.dayNavArrow}>
            <Ionicons name="chevron-back" size={22} color={colors.textOnDark} />
          </Pressable>
          <Pressable onPress={onToday} style={styles.dayNavCenter}>
            <Text style={[styles.dayNavLabel, isToday && { color: colors.accent1 }]}>
              {dayDisplayText}
            </Text>
          </Pressable>
          <Pressable onPress={onNextDay} hitSlop={12} style={styles.dayNavArrow}>
            <Ionicons name="chevron-forward" size={22} color={colors.textOnDark} />
          </Pressable>
        </View>
      )}

      <ScrollFadeOverlay />
      <ScrollView
        ref={scrollViewRef}
        style={styles.eventsScroll}
        contentContainerStyle={styles.flowContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent1} />
        }
      >
        {/* ─── Player-only: Suggestions Banner ─── */}
        {isOwner && suggestions && suggestions.length > 0 && onSuggestionResolved && (
          <SuggestionsBanner
            suggestions={suggestions}
            onResolved={onSuggestionResolved}
          />
        )}


        {/* ─── Zoom Controls ─── */}
        {events.length > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 4, gap: 8 }}>
            <TouchableOpacity
              onPress={zoomOut}
              style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.backgroundElevated, alignItems: 'center', justifyContent: 'center', opacity: zoomLevel <= 0.7 ? 0.3 : 1 }}
              disabled={zoomLevel <= 0.7}
            >
              <Ionicons name="remove" size={16} color={colors.textMuted} />
            </TouchableOpacity>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: 'Poppins_500Medium', minWidth: 32, textAlign: 'center' }}>
              {Math.round(zoomLevel * 100)}%
            </Text>
            <TouchableOpacity
              onPress={zoomIn}
              style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.backgroundElevated, alignItems: 'center', justifyContent: 'center', opacity: zoomLevel >= 1.5 ? 0.3 : 1 }}
              disabled={zoomLevel >= 1.5}
            >
              <Ionicons name="add" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Connected Spine Timeline (pinch-to-zoom on native, buttons everywhere) ─── */}
        {Platform.OS !== 'web' ? (
          <PinchGestureHandler
            ref={pinchRef}
            simultaneousHandlers={scrollViewRef}
            onGestureEvent={onPinchGestureEvent}
            onHandlerStateChange={onPinchStateChange}
          >
            <View style={styles.timelineSection}>
              <SpineTimeline
                events={events}
                onEventEdit={(event) => {
                  navigation.navigate('EventEdit', {
                    eventId: event.id,
                    name: event.name,
                    type: event.type,
                    date: event.date,
                    startTime: event.startTime || '',
                    endTime: event.endTime || '',
                    notes: event.notes || '',
                    intensity: event.intensity || '',
                    linkedPrograms: (event as any).linkedPrograms || [],
                  });
                }}
                onJournalPress={onJournalPress}
                onEventComplete={onComplete}
                onEventSkip={onSkip}
                completedIds={completedEvents ?? emptyCompleted}
                skippedIds={new Set()}
                zoomLevel={zoomLevel}
              />
            </View>
          </PinchGestureHandler>
        ) : (
          <View style={styles.timelineSection}>
            <SpineTimeline
              events={events}
              onEventEdit={(event) => {
                navigation.navigate('EventEdit', {
                  eventId: event.id,
                  name: event.name,
                  type: event.type,
                  date: event.date,
                  startTime: event.startTime || '',
                  endTime: event.endTime || '',
                  notes: event.notes || '',
                  intensity: event.intensity || '',
                  linkedPrograms: (event as any).linkedPrograms || [],
                });
              }}
              onJournalPress={onJournalPress}
              onEventComplete={onComplete}
              onEventSkip={onSkip}
              completedIds={completedEvents ?? emptyCompleted}
              skippedIds={new Set()}
              zoomLevel={zoomLevel}
            />
          </View>
        )}

        {/* ─── Player-only: Exam Study Planner ─── */}
        {isOwner && upcomingExams && upcomingExams.length > 0 && (
          <ExamStudyPlanner exams={upcomingExams} />
        )}
      </ScrollView>

    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ─── Day Navigation Bar ───
    dayNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenMargin,
      paddingVertical: spacing.xs,
      marginBottom: spacing.xs,
    },
    dayNavArrow: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayNavCenter: {
      alignItems: 'center',
    },
    dayNavLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textOnDark,
    },
    dayNavDate: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 1,
    },
    lockBadge: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: `${colors.success}22`,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ─── Flow Content ───
    eventsScroll: {
      flex: 1,
    },
    flowContent: {
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.sm,
      paddingBottom: layout.navHeight + spacing.xl + 70,
      gap: spacing.md,
    },
    timelineSection: {
      marginTop: spacing.xs,
    },

    // ─── Readiness + Balance ───
    readinessBalanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    balanceWrap: {
      flex: 1,
    },

    // ─── AI Balance Card ───
    aiCard: {
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: '#A855F733',
    },
    aiCardGradient: {
      padding: spacing.md,
    },
    aiHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    aiEmoji: {
      fontSize: 14,
    },
    aiLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
      letterSpacing: 1,
      color: colors.info,
    },
    aiText: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textOnDark,
      lineHeight: 20,
    },

    // ─── Section header row ───
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionHeaderLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.textMuted,
      letterSpacing: 1.5,
    },
    pillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },

    // ─── Check-in pill ───
    checkinPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: borderRadius.full,
      borderWidth: 1,
    },
    checkinPillText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 11,
      letterSpacing: 0.3,
    },

    // ─── FAB ───
    fabWrap: {
      position: 'absolute',
      right: layout.screenMargin,
      bottom: spacing.lg,
    },
    fab: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.glowOrange,
    },
  });
}
