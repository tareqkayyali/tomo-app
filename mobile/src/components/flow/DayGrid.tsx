/**
 * DayGrid — Full-day time-slot grid calendar (6 AM – 12 AM)
 *
 * Shows 36 half-hour slots with events positioned by time.
 * Supports: empty slot tap, long-press drag-and-drop, lock state.
 * Reuses FlowTimeline type colors/emojis for visual consistency.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  Platform,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { getIntensityConfig } from '../../utils/calendarHelpers';
import type { CalendarEvent } from '../../types';
import type { ThemeColors } from '../../theme/colors';

// ─── Constants ──────────────────────────────────────────────────────────────

const START_HOUR = 6;   // 6 AM
const END_HOUR = 24;    // 12 AM midnight
const SLOT_COUNT = (END_HOUR - START_HOUR) * 2; // 36 half-hour slots
const SLOT_HEIGHT = 60; // px per slot
const TIME_COL_WIDTH = 50;
const GRID_HEIGHT = SLOT_COUNT * SLOT_HEIGHT;

// ─── Type colors / emojis (match FlowTimeline) ─────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  training: '#FF6B35',
  match: '#FF6B35',
  study_block: '#6366F1',
  exam: '#E74C3C',
  recovery: '#00D9FF',
  other: '#666666',
};

const TYPE_EMOJIS: Record<string, string> = {
  training: '\u26A1',
  match: '\u26BD',
  study_block: '\uD83D\uDCDA',
  exam: '\uD83D\uDCDD',
  recovery: '\uD83E\uDDD8',
  other: '\uD83D\uDCCB',
};

function getTypeColor(type: string): string {
  return TYPE_COLORS[type] ?? '#666666';
}

function getTypeEmoji(type: string): string {
  return TYPE_EMOJIS[type] ?? '\uD83D\uDCCB';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert HH:MM to minutes since midnight */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Convert minutes since midnight to HH:MM */
function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Format HH:MM to 12h display */
function format12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Slot index from minutes since midnight */
function minutesToSlotIndex(mins: number): number {
  return Math.max(0, Math.min(SLOT_COUNT - 1, Math.floor((mins - START_HOUR * 60) / 30)));
}

/** Y position from minutes */
function minutesToY(mins: number): number {
  return ((mins - START_HOUR * 60) / 30) * SLOT_HEIGHT;
}

/** Compute overlap groups for events */
function computeOverlapGroups(events: CalendarEvent[]): Map<string, { col: number; totalCols: number }> {
  const timed = events.filter((e) => e.startTime && e.endTime);
  const result = new Map<string, { col: number; totalCols: number }>();

  // Sort by start time
  const sorted = [...timed].sort((a, b) =>
    timeToMinutes(a.startTime!) - timeToMinutes(b.startTime!),
  );

  // Simple greedy column assignment
  const columns: { endMin: number; eventId: string }[][] = [];

  for (const evt of sorted) {
    const startMin = timeToMinutes(evt.startTime!);
    const endMin = timeToMinutes(evt.endTime!);

    // Find first column where this event fits (no overlap)
    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      const lastInCol = columns[c][columns[c].length - 1];
      if (lastInCol.endMin <= startMin) {
        columns[c].push({ endMin, eventId: evt.id });
        result.set(evt.id, { col: c, totalCols: 0 }); // totalCols set later
        placed = true;
        break;
      }
    }

    if (!placed) {
      columns.push([{ endMin, eventId: evt.id }]);
      result.set(evt.id, { col: columns.length - 1, totalCols: 0 });
    }
  }

  // Set totalCols for all events (max columns needed)
  const totalCols = columns.length;
  for (const [id, info] of result) {
    result.set(id, { ...info, totalCols });
  }

  return result;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface DayGridProps {
  events: CalendarEvent[];
  selectedDay: Date;
  isToday: boolean;
  completedEventIds: Set<string>;
  onComplete: (eventId: string) => void;
  onSkip: (eventId: string) => void;
  onUndo: (eventId: string) => void;
  onEmptySlotPress: (time: string) => void;
  onEventDrop: (eventId: string, newStartTime: string, newEndTime: string) => void;
  readOnly: boolean;
  locked: boolean;
  scrollEnabled?: React.MutableRefObject<(enabled: boolean) => void>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DayGrid({
  events,
  selectedDay,
  isToday,
  completedEventIds,
  onComplete,
  onSkip,
  onUndo,
  onEmptySlotPress,
  onEventDrop,
  readOnly,
  locked,
  scrollEnabled,
}: DayGridProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Events with and without times ──
  const timedEvents = useMemo(
    () => events.filter((e) => e.startTime),
    [events],
  );

  const untimedEvents = useMemo(
    () => events.filter((e) => !e.startTime),
    [events],
  );

  // ── Overlap layout ──
  const overlapMap = useMemo(() => computeOverlapGroups(timedEvents), [timedEvents]);

  // ── Current time for "now" indicator ──
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useEffect(() => {
    if (!isToday) return;
    const interval = setInterval(() => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, [isToday]);

  // ── Current event detection ──
  const currentEventId = useMemo(() => {
    if (!isToday) return null;
    for (const evt of timedEvents) {
      if (completedEventIds.has(evt.id)) continue;
      if (evt.startTime && evt.endTime) {
        const start = timeToMinutes(evt.startTime);
        const end = timeToMinutes(evt.endTime);
        if (nowMinutes >= start && nowMinutes <= end) return evt.id;
      }
    }
    return null;
  }, [isToday, timedEvents, completedEventIds, nowMinutes]);

  // ── Drag state ──
  const [dragEventId, setDragEventId] = useState<string | null>(null);
  const dragTranslateY = useSharedValue(0);
  const dragOriginalY = useRef(0);
  const dragEventOriginalStart = useRef(0);
  const dragEventDuration = useRef(0);

  const handleDragStart = useCallback((eventId: string, event: CalendarEvent) => {
    if (readOnly || locked) return;
    setDragEventId(eventId);
    const startMin = timeToMinutes(event.startTime!);
    const endMin = event.endTime ? timeToMinutes(event.endTime) : startMin + 60;
    dragEventOriginalStart.current = startMin;
    dragEventDuration.current = endMin - startMin;
    dragOriginalY.current = minutesToY(startMin);
    dragTranslateY.value = 0;

    if (scrollEnabled?.current) {
      scrollEnabled.current(false);
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }, [readOnly, locked, dragTranslateY, scrollEnabled]);

  const handleDragEnd = useCallback(() => {
    if (!dragEventId) return;

    const deltaMinutes = Math.round(dragTranslateY.value / SLOT_HEIGHT) * 30;
    const newStartMin = dragEventOriginalStart.current + deltaMinutes;
    const newEndMin = newStartMin + dragEventDuration.current;

    // Bounds check
    if (newStartMin >= START_HOUR * 60 && newEndMin <= END_HOUR * 60) {
      const newStart = minutesToTime(newStartMin);
      const newEnd = minutesToTime(newEndMin);
      onEventDrop(dragEventId, newStart, newEnd);
    } else {
      // Spring back
      dragTranslateY.value = withSpring(0);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }

    setDragEventId(null);
    dragTranslateY.value = 0;

    if (scrollEnabled?.current) {
      scrollEnabled.current(true);
    }
  }, [dragEventId, dragTranslateY, onEventDrop, scrollEnabled]);

  // ── Occupied slot checker ──
  const occupiedSlots = useMemo(() => {
    const occupied = new Set<number>();
    for (const evt of timedEvents) {
      if (!evt.startTime) continue;
      const startMin = timeToMinutes(evt.startTime);
      const endMin = evt.endTime ? timeToMinutes(evt.endTime) : startMin + 30;
      for (let m = startMin; m < endMin; m += 30) {
        occupied.add(minutesToSlotIndex(m));
      }
    }
    return occupied;
  }, [timedEvents]);

  // ── Slot tap handler ──
  const handleSlotPress = useCallback(
    (slotIndex: number) => {
      if (readOnly || locked) return;
      if (occupiedSlots.has(slotIndex)) return;
      const minutes = START_HOUR * 60 + slotIndex * 30;
      onEmptySlotPress(minutesToTime(minutes));
    },
    [readOnly, locked, occupiedSlots, onEmptySlotPress],
  );

  // ── Time labels (full hours only) ──
  const timeLabels = useMemo(() => {
    const labels: { hour: number; label: string; y: number }[] = [];
    for (let h = START_HOUR; h < END_HOUR; h++) {
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      labels.push({
        hour: h,
        label: `${h12} ${period}`,
        y: (h - START_HOUR) * 2 * SLOT_HEIGHT,
      });
    }
    return labels;
  }, []);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* ── Untimed events section ── */}
      {untimedEvents.length > 0 && (
        <View style={styles.untimedSection}>
          <Text style={[styles.untimedHeader, { color: colors.textMuted }]}>NO TIME SET</Text>
          {untimedEvents.map((evt) => {
            const typeColor = getTypeColor(evt.type);
            const isCompleted = completedEventIds.has(evt.id);
            return (
              <View
                key={evt.id}
                style={[
                  styles.untimedCard,
                  {
                    backgroundColor: typeColor + '15',
                    borderLeftColor: typeColor,
                    opacity: isCompleted ? 0.45 : 1,
                  },
                ]}
              >
                <Text style={[styles.eventName, { color: colors.textOnDark }]}>
                  {getTypeEmoji(evt.type)} {evt.name}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Main grid ── */}
      <View style={[styles.grid, { height: GRID_HEIGHT }]}>
        {/* Time labels */}
        {timeLabels.map(({ hour, label, y }) => (
          <Text
            key={hour}
            style={[
              styles.timeLabel,
              { top: y, color: colors.textInactive },
            ]}
          >
            {label}
          </Text>
        ))}

        {/* Slot rows */}
        {Array.from({ length: SLOT_COUNT }, (_, i) => {
          const isOccupied = occupiedSlots.has(i);
          const isHourBoundary = i % 2 === 0;
          return (
            <Pressable
              key={i}
              onPress={() => handleSlotPress(i)}
              style={[
                styles.slotRow,
                {
                  top: i * SLOT_HEIGHT,
                  borderTopColor: isHourBoundary
                    ? colors.border
                    : colors.border + '40',
                  borderTopWidth: isHourBoundary ? 1 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              {/* Empty slot "+" indicator */}
              {!isOccupied && !readOnly && !locked && (
                <View style={styles.emptySlotHint}>
                  <Ionicons name="add" size={14} color={colors.textInactive + '60'} />
                </View>
              )}
            </Pressable>
          );
        })}

        {/* Event blocks */}
        {timedEvents.map((evt) => {
          const startMin = timeToMinutes(evt.startTime!);
          const endMin = evt.endTime ? timeToMinutes(evt.endTime!) : startMin + 60;
          const duration = endMin - startMin;
          const top = minutesToY(startMin);
          const height = Math.max((duration / 30) * SLOT_HEIGHT, SLOT_HEIGHT * 0.8);
          const typeColor = getTypeColor(evt.type);
          const isCompleted = completedEventIds.has(evt.id);
          const isCurrent = evt.id === currentEventId;
          const isDragging = evt.id === dragEventId;
          const overlap = overlapMap.get(evt.id);
          const totalCols = overlap?.totalCols || 1;
          const col = overlap?.col || 0;

          const eventWidth = (Dimensions.get('window').width - TIME_COL_WIDTH - spacing.md * 2 - 8) / totalCols;
          const eventLeft = TIME_COL_WIDTH + 4 + col * eventWidth;

          return (
            <DayGridEvent
              key={evt.id}
              event={evt}
              top={top}
              height={height}
              left={eventLeft}
              width={eventWidth - 2}
              typeColor={typeColor}
              isCompleted={isCompleted}
              isCurrent={isCurrent}
              isDragging={isDragging}
              readOnly={readOnly}
              locked={locked}
              onComplete={onComplete}
              onSkip={onSkip}
              onUndo={onUndo}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              dragTranslateY={dragTranslateY}
              colors={colors}
            />
          );
        })}

        {/* Now indicator */}
        {isToday && nowMinutes >= START_HOUR * 60 && nowMinutes < END_HOUR * 60 && (
          <View
            style={[
              styles.nowIndicator,
              { top: minutesToY(nowMinutes) },
            ]}
          >
            <View style={styles.nowDot} />
            <View style={styles.nowLine} />
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Event Block Sub-component ──────────────────────────────────────────────

interface DayGridEventProps {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  typeColor: string;
  isCompleted: boolean;
  isCurrent: boolean;
  isDragging: boolean;
  readOnly: boolean;
  locked: boolean;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
  onUndo: (id: string) => void;
  onDragStart: (id: string, event: CalendarEvent) => void;
  onDragEnd: () => void;
  dragTranslateY: SharedValue<number>;
  colors: ThemeColors;
}

function DayGridEvent({
  event,
  top,
  height,
  left,
  width,
  typeColor,
  isCompleted,
  isCurrent,
  isDragging,
  readOnly,
  locked,
  onComplete,
  onSkip,
  onUndo,
  onDragStart,
  onDragEnd,
  dragTranslateY,
  colors,
}: DayGridEventProps) {
  const panResponder = useMemo(() => {
    if (readOnly || locked) return null;

    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return isDragging && (Math.abs(gestureState.dy) > 5);
      },
      onPanResponderMove: (_, gestureState) => {
        if (isDragging) {
          // Snap to 30-min increments
          const snapped = Math.round(gestureState.dy / SLOT_HEIGHT) * SLOT_HEIGHT;
          dragTranslateY.value = snapped;
        }
      },
      onPanResponderRelease: () => {
        if (isDragging) {
          runOnJS(onDragEnd)();
        }
      },
    });
  }, [readOnly, locked, isDragging, dragTranslateY, onDragEnd]);

  const animatedStyle = useAnimatedStyle(() => {
    if (!isDragging) return {};
    return {
      transform: [{ translateY: dragTranslateY.value }],
      zIndex: 100,
      elevation: 10,
    };
  });

  const timeStr = event.startTime
    ? event.endTime
      ? `${format12h(event.startTime)} – ${format12h(event.endTime)}`
      : format12h(event.startTime)
    : '';

  const intensity = event.intensity ? getIntensityConfig(event.intensity) : null;
  const showActions = isCurrent && !readOnly && !locked && !isCompleted;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top,
          left,
          width,
          height: Math.max(height, 44),
          zIndex: isDragging ? 100 : isCurrent ? 10 : 1,
        },
        animatedStyle,
      ]}
      {...(panResponder?.panHandlers || {})}
    >
      <Pressable
        onLongPress={() => {
          if (!readOnly && !locked) onDragStart(event.id, event);
        }}
        delayLongPress={400}
        style={({ pressed }) => [
          {
            flex: 1,
            borderRadius: borderRadius.sm,
            borderLeftWidth: 3,
            borderLeftColor: typeColor,
            backgroundColor: typeColor + '18',
            paddingHorizontal: 8,
            paddingVertical: 4,
            opacity: isCompleted ? 0.45 : pressed ? 0.85 : 1,
            overflow: 'hidden',
          },
          isDragging && {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 10,
          },
          isCurrent && !isCompleted && {
            borderLeftWidth: 4,
            borderColor: typeColor + '40',
            borderWidth: 1,
          },
        ]}
      >
        {/* Event header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 12 }}>{getTypeEmoji(event.type)}</Text>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 12,
              fontFamily: fontFamily.semiBold,
              color: colors.textOnDark,
              textDecorationLine: isCompleted ? 'line-through' : 'none',
            }}
          >
            {event.name}
          </Text>
          {isCurrent && !isCompleted && (
            <View style={{
              backgroundColor: '#FF6B35',
              borderRadius: 4,
              paddingHorizontal: 4,
              paddingVertical: 1,
            }}>
              <Text style={{ color: '#FFF', fontSize: 8, fontWeight: '800' }}>NOW</Text>
            </View>
          )}
          {locked && !readOnly && (
            <Ionicons name="lock-closed" size={10} color={colors.textInactive} />
          )}
        </View>

        {/* Time + intensity */}
        {height > 44 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={{ fontSize: 10, color: colors.textSecondary }}>{timeStr}</Text>
            {intensity && (
              <View style={{
                backgroundColor: intensity.color + '22',
                borderRadius: 3,
                paddingHorizontal: 4,
                paddingVertical: 1,
              }}>
                <Text style={{ fontSize: 8, color: intensity.color, fontWeight: '700' }}>
                  {intensity.label}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Action buttons */}
        {showActions && height > 70 && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
            <Pressable
              onPress={() => {
                onComplete(event.id);
                if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }}
              style={{
                backgroundColor: '#2ED573',
                borderRadius: 4,
                paddingHorizontal: 8,
                paddingVertical: 3,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Ionicons name="checkmark" size={10} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '700' }}>DONE</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onSkip(event.id);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                backgroundColor: colors.textInactive + '30',
                borderRadius: 4,
                paddingHorizontal: 8,
                paddingVertical: 3,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 9, fontWeight: '700' }}>SKIP</Text>
            </Pressable>
          </View>
        )}

        {/* Undo for completed */}
        {isCompleted && !readOnly && !locked && height > 44 && (
          <Pressable
            onPress={() => onUndo(event.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}
          >
            <Ionicons name="arrow-undo" size={10} color={typeColor} />
            <Text style={{ fontSize: 9, color: typeColor, fontWeight: '600' }}>UNDO</Text>
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      // No padding — let parent handle
    },
    untimedSection: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: 6,
    },
    untimedHeader: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.2,
    },
    untimedCard: {
      borderLeftWidth: 3,
      borderRadius: borderRadius.sm,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    eventName: {
      fontSize: 13,
      fontFamily: fontFamily.semiBold,
    },
    grid: {
      position: 'relative',
      marginLeft: 0,
    },
    timeLabel: {
      position: 'absolute',
      left: 4,
      width: TIME_COL_WIDTH - 8,
      textAlign: 'right',
      fontSize: 10,
      fontFamily: fontFamily.medium,
      fontVariant: ['tabular-nums'],
    },
    slotRow: {
      position: 'absolute',
      left: TIME_COL_WIDTH,
      right: 0,
      height: SLOT_HEIGHT,
      justifyContent: 'center',
    },
    emptySlotHint: {
      position: 'absolute',
      right: 12,
      top: '50%',
      marginTop: -7,
    },
    nowIndicator: {
      position: 'absolute',
      left: TIME_COL_WIDTH - 4,
      right: 0,
      height: 2,
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 50,
    },
    nowDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#FF3B30',
      marginLeft: -4,
    },
    nowLine: {
      flex: 1,
      height: 2,
      backgroundColor: '#FF3B30',
    },
  });
}
