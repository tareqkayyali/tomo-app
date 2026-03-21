/**
 * DayGrid — Full-day time-slot grid calendar (6 AM – 12 AM)
 *
 * Shows 36 half-hour slots with events positioned by time.
 * Supports: empty slot tap, long-press drag-and-drop, lock state.
 *
 * Drag architecture (web-first, Expo web deployed to Vercel):
 * 1. Pressable.onLongPress fires → sets isDragging flag + drag state
 * 2. document-level pointermove/pointerup listeners are attached
 *    These ALWAYS fire regardless of which DOM element has the pointer,
 *    bypassing PanResponder's unreliable gesture-capture on web.
 * 3. A visual-only overlay renders the dragged block.
 * 4. On pointerup, drop is finalized and listeners removed.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Dimensions,
  Alert,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/types';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { getIntensityConfig } from '../../utils/calendarHelpers';
import type { CalendarEvent } from '../../types';
import type { ThemeColors } from '../../theme/colors';
import {
  findAvailableSlots,
  validateEvent,
  autoPosition,
  computeGaps,
  DEFAULT_CONFIG,
  type SchedulingConfig,
  type ScheduleEvent,
} from '../../services/schedulingEngine';

// ─── Constants ──────────────────────────────────────────────────────────────

const START_HOUR = 6;   // 6 AM
const END_HOUR = 24;    // 12 AM midnight
const SLOT_COUNT = (END_HOUR - START_HOUR) * 2; // 36 half-hour slots
const SLOT_HEIGHT = 60; // px per slot
const TIME_COL_WIDTH = 50;
const GRID_HEIGHT = SLOT_COUNT * SLOT_HEIGHT;
const LONG_PRESS_MS = 400;

// ─── Type colors / emojis (match FlowTimeline) ─────────────────────────────

// TYPE_COLORS moved into getTypeColor() to use theme tokens

const TYPE_EMOJIS: Record<string, string> = {
  training: '\u26A1',
  match: '\u26BD',
  study_block: '\uD83D\uDCDA',
  exam: '\uD83D\uDCDD',
  recovery: '\uD83E\uDDD8',
  other: '\uD83D\uDCCB',
};

function getTypeColor(type: string, colors: ThemeColors): string {
  const map: Record<string, string> = {
    training: colors.accent,
    match: colors.accent,
    study_block: colors.warning,
    exam: colors.error,
    recovery: colors.info,
    other: colors.textDisabled,
  };
  return map[type] ?? colors.textDisabled;
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

  const sorted = [...timed].sort((a, b) =>
    timeToMinutes(a.startTime!) - timeToMinutes(b.startTime!),
  );

  const columns: { endMin: number; eventId: string }[][] = [];

  for (const evt of sorted) {
    const startMin = timeToMinutes(evt.startTime!);
    const endMin = timeToMinutes(evt.endTime!);

    let placed = false;
    for (let c = 0; c < columns.length; c++) {
      const lastInCol = columns[c][columns[c].length - 1];
      if (lastInCol.endMin <= startMin) {
        columns[c].push({ endMin, eventId: evt.id });
        result.set(evt.id, { col: c, totalCols: 0 });
        placed = true;
        break;
      }
    }

    if (!placed) {
      columns.push([{ endMin, eventId: evt.id }]);
      result.set(evt.id, { col: columns.length - 1, totalCols: 0 });
    }
  }

  const totalCols = columns.length;
  for (const [id, info] of result) {
    result.set(id, { ...info, totalCols });
  }

  return result;
}

// ─── Drag state type ─────────────────────────────────────────────────────────

interface DragState {
  eventId: string;
  event: CalendarEvent;
  originalStartMin: number;
  durationMin: number;
  originalY: number;
  typeColor: string;
  left: number;
  width: number;
  height: number;
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
  onDelete?: (eventId: string) => Promise<boolean> | void;
  onUpdate?: (eventId: string, patch: { date?: string; startTime?: string; endTime?: string }) => Promise<boolean>;
  onEmptySlotPress: (time: string) => void;
  onEventDrop: (eventId: string, newStartTime: string, newEndTime: string) => void;
  readOnly: boolean;
  locked: boolean;
  scrollEnabled?: React.MutableRefObject<(enabled: boolean) => void>;
  /** Smart Calendar scheduling config (gap minutes, etc.) */
  schedulingConfig?: SchedulingConfig;
  /** Callback when an event is auto-repositioned due to conflict */
  onAutoReposition?: (eventId: string, newStart: string, newEnd: string, reason: string) => void;
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
  onDelete,
  onUpdate,
  onEmptySlotPress,
  onEventDrop,
  readOnly,
  locked,
  scrollEnabled,
  schedulingConfig,
  onAutoReposition,
}: DayGridProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Inline edit state ──
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const handleEditToggle = useCallback((id: string) => {
    setEditingEventId((prev) => (prev === id ? null : id));
  }, []);

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

  // ── Smart Calendar: available slot scores ──
  const config = schedulingConfig ?? DEFAULT_CONFIG;
  const scheduleEvents: ScheduleEvent[] = useMemo(
    () =>
      timedEvents.map((e) => ({
        id: e.id,
        name: e.name,
        startTime: e.startTime,
        endTime: e.endTime,
        type: e.type,
        intensity: e.intensity,
      })),
    [timedEvents],
  );

  const availableSlotScores = useMemo(() => {
    if (readOnly || locked) return new Map<number, number>();
    const suggestions = findAvailableSlots(
      scheduleEvents,
      60,
      config,
      selectedDay.getDay(),
    );
    const scoreMap = new Map<number, number>();
    for (const s of suggestions) {
      // Map suggestion to slot indices
      for (let min = s.startMin; min < s.endMin; min += 30) {
        const idx = minutesToSlotIndex(min);
        if (!scoreMap.has(idx) || scoreMap.get(idx)! < s.score) {
          scoreMap.set(idx, s.score);
        }
      }
    }
    return scoreMap;
  }, [scheduleEvents, config, selectedDay, readOnly, locked]);

  // ── Smart Calendar: gap markers between events ──
  const gapMarkers = useMemo(
    () => computeGaps(scheduleEvents, config),
    [scheduleEvents, config],
  );

  // Keep refs for scheduling engine conflict handling in drag
  const configRef = useRef(config);
  configRef.current = config;
  const scheduleEventsRef = useRef(scheduleEvents);
  scheduleEventsRef.current = scheduleEvents;
  const onAutoRepositionRef = useRef(onAutoReposition);
  onAutoRepositionRef.current = onAutoReposition;

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

  // ── Drag state (React state for rendering) ──
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  // ── Refs for document-level drag listeners (avoid stale closures) ──
  const isDraggingRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);
  const dragOffsetRef = useRef(0);
  const onEventDropRef = useRef(onEventDrop);
  onEventDropRef.current = onEventDrop;
  const scrollEnabledRef = useRef(scrollEnabled);
  scrollEnabledRef.current = scrollEnabled;

  // Cleanup ref to store remove-listener function
  const cleanupRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, []);

  // ── handleDragStart — called from StaticEventBlock.onLongPress ──
  const handleDragStart = useCallback((ds: DragState, pageY: number) => {
    isDraggingRef.current = true;
    dragStateRef.current = ds;
    dragOffsetRef.current = 0;
    setDragState(ds);
    setDragOffsetY(0);

    // Disable parent scroll
    if (scrollEnabledRef.current?.current) {
      scrollEnabledRef.current.current(false);
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }

    // ── Web: attach document-level listeners ──
    // These ALWAYS fire regardless of which DOM element has pointer capture,
    // which is why PanResponder failed — Pressable held the gesture.
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const startY = pageY;

      const onPointerMove = (e: Event) => {
        if (!isDraggingRef.current) return;
        e.preventDefault(); // prevent scroll during drag

        let clientY: number;
        if ((e as TouchEvent).touches) {
          clientY = (e as TouchEvent).touches[0]?.clientY ?? 0;
        } else {
          clientY = (e as PointerEvent).clientY;
        }

        const dy = clientY - startY;
        const snapped = Math.round(dy / SLOT_HEIGHT) * SLOT_HEIGHT;
        dragOffsetRef.current = snapped;
        setDragOffsetY(snapped);
      };

      const onPointerUp = () => {
        // Finalize drop with Smart Calendar conflict handling
        const currentDs = dragStateRef.current;
        if (currentDs) {
          const deltaMinutes = Math.round(dragOffsetRef.current / SLOT_HEIGHT) * 30;
          let newStartMin = currentDs.originalStartMin + deltaMinutes;
          let newEndMin = newStartMin + currentDs.durationMin;

          if (deltaMinutes !== 0 && newStartMin >= START_HOUR * 60 && newEndMin <= END_HOUR * 60) {
            // Smart Calendar: validate drop position
            const cfg = configRef.current;
            const evts = scheduleEventsRef.current;
            const conflict = validateEvent(newStartMin, newEndMin, evts, cfg, currentDs.eventId);

            if (conflict.hasConflict) {
              // Auto-reposition to nearest free slot
              const repositioned = autoPosition(
                currentDs.durationMin,
                newStartMin,
                evts,
                cfg,
                currentDs.eventId,
              );

              if (repositioned) {
                newStartMin = repositioned.startMin;
                newEndMin = repositioned.endMin;
                // Notify parent about auto-reposition
                if (onAutoRepositionRef.current) {
                  const reason = conflict.conflictingEvents.length > 0
                    ? `Conflict with ${conflict.conflictingEvents[0].name}`
                    : `Gap too small (need ${cfg.gapMinutes}min)`;
                  onAutoRepositionRef.current(
                    currentDs.eventId,
                    minutesToTime(newStartMin),
                    minutesToTime(newEndMin),
                    reason,
                  );
                }
              } else {
                // No slot available — bounce back (don't drop)
                // Reset without calling onEventDrop
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', onPointerUp);
                document.removeEventListener('pointercancel', onPointerUp);
                document.removeEventListener('touchmove', onPointerMove);
                document.removeEventListener('touchend', onPointerUp);
                document.removeEventListener('touchcancel', onPointerUp);
                cleanupRef.current = null;
                isDraggingRef.current = false;
                dragStateRef.current = null;
                dragOffsetRef.current = 0;
                setDragState(null);
                setDragOffsetY(0);
                if (scrollEnabledRef.current?.current) {
                  scrollEnabledRef.current.current(true);
                }
                return;
              }
            }

            onEventDropRef.current(
              currentDs.eventId,
              minutesToTime(newStartMin),
              minutesToTime(newEndMin),
            );
          }
        }

        // Cleanup listeners
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('touchend', onPointerUp);
        document.removeEventListener('touchcancel', onPointerUp);
        cleanupRef.current = null;

        // Reset state
        isDraggingRef.current = false;
        dragStateRef.current = null;
        dragOffsetRef.current = 0;
        setDragState(null);
        setDragOffsetY(0);

        // Re-enable scroll
        if (scrollEnabledRef.current?.current) {
          scrollEnabledRef.current.current(true);
        }
      };

      // Attach to document — captures ALL pointer events globally
      document.addEventListener('pointermove', onPointerMove, { passive: false });
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
      // Touch events as fallback for older mobile browsers
      document.addEventListener('touchmove', onPointerMove, { passive: false });
      document.addEventListener('touchend', onPointerUp);
      document.addEventListener('touchcancel', onPointerUp);

      // Store cleanup for unmount safety
      cleanupRef.current = () => {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('touchend', onPointerUp);
        document.removeEventListener('touchcancel', onPointerUp);
      };
    }
  }, []);

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
            const typeColor = getTypeColor(evt.type, colors);
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

      {/* ── Main grid (no PanResponder — drag uses document listeners) ── */}
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

        {/* Slot rows with Smart Calendar glow */}
        {Array.from({ length: SLOT_COUNT }, (_, i) => {
          const isOccupied = occupiedSlots.has(i);
          const isHourBoundary = i % 2 === 0;
          const slotScore = !isOccupied ? availableSlotScores.get(i) : undefined;
          const hasGlow = slotScore !== undefined && slotScore > 0;

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
              {/* Smart Calendar: available slot glow */}
              {hasGlow && !readOnly && !locked && (
                <View
                  pointerEvents="none"
                  style={{
                    ...StyleSheet.absoluteFillObject,
                    left: TIME_COL_WIDTH - 4,
                    backgroundColor:
                      slotScore >= 70
                        ? colors.accent1 + '0A'    // warm glow for great slots
                        : slotScore >= 40
                        ? colors.accent2 + '06'    // subtle cool glow
                        : 'transparent',
                  }}
                />
              )}
            </Pressable>
          );
        })}

        {/* Smart Calendar: gap markers between events */}
        {gapMarkers.map((gap, i) => {
          const midY = (gap.yStart + gap.yEnd) / 2;
          const markerColor = gap.adequate ? colors.accent : colors.warning;
          return (
            <View
              key={`gap-${i}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: midY - 8,
                left: TIME_COL_WIDTH + 4,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                backgroundColor: markerColor + '14',
                borderRadius: 6,
                paddingHorizontal: 6,
                paddingVertical: 2,
                zIndex: 5,
              }}
            >
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: markerColor,
                }}
              />
              <Text
                style={{
                  fontSize: 9,
                  fontFamily: fontFamily.semiBold,
                  color: markerColor,
                }}
              >
                {gap.gapMinutes}m
              </Text>
            </View>
          );
        })}

        {/* Event blocks */}
        {timedEvents.map((evt) => {
          const startMin = timeToMinutes(evt.startTime!);
          const endMin = evt.endTime ? timeToMinutes(evt.endTime!) : startMin + 60;
          const duration = endMin - startMin;
          const top = minutesToY(startMin);
          const height = Math.max((duration / 30) * SLOT_HEIGHT, SLOT_HEIGHT * 0.8);
          const typeColor = getTypeColor(evt.type, colors);
          const isCompleted = completedEventIds.has(evt.id);
          const isCurrent = evt.id === currentEventId;
          const isDragging = dragState?.eventId === evt.id;
          const overlap = overlapMap.get(evt.id);
          const totalCols = overlap?.totalCols || 1;
          const col = overlap?.col || 0;

          const eventWidth = (Dimensions.get('window').width - TIME_COL_WIDTH - spacing.md * 2 - 8) / totalCols;
          const eventLeft = TIME_COL_WIDTH + 4 + col * eventWidth;

          return (
            <StaticEventBlock
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
              isEditing={editingEventId === evt.id}
              onEditToggle={handleEditToggle}
              onComplete={onComplete}
              onSkip={onSkip}
              onUndo={onUndo}
              onDelete={onDelete}
              onUpdate={onUpdate}
              onDragStart={handleDragStart}
              colors={colors}
            />
          );
        })}

        {/* ── Drag overlay — purely visual, no gesture handler ── */}
        {dragState && (
          <DragOverlayVisual
            dragState={dragState}
            dragOffsetY={dragOffsetY}
            colors={colors}
          />
        )}

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

// ─── Drag Overlay (visual only — no gesture handler) ─────────────────────────

interface DragOverlayVisualProps {
  dragState: DragState;
  dragOffsetY: number;
  colors: ThemeColors;
}

function DragOverlayVisual({ dragState, dragOffsetY, colors }: DragOverlayVisualProps) {
  const overlayTop = dragState.originalY + dragOffsetY;

  const newStartMin = dragState.originalStartMin + Math.round(dragOffsetY / SLOT_HEIGHT) * 30;
  const newEndMin = newStartMin + dragState.durationMin;
  const newTimeLabel =
    newStartMin >= START_HOUR * 60 && newEndMin <= END_HOUR * 60
      ? `${format12h(minutesToTime(newStartMin))} – ${format12h(minutesToTime(newEndMin))}`
      : 'Out of range';

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: overlayTop,
        left: dragState.left,
        width: dragState.width,
        height: dragState.height,
        zIndex: 200,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: borderRadius.sm,
          borderLeftWidth: 4,
          borderLeftColor: dragState.typeColor,
          backgroundColor: dragState.typeColor + '30',
          paddingHorizontal: 8,
          paddingVertical: 4,
          // Web box-shadow (shadows on native)
          ...(Platform.OS === 'web'
            ? ({ boxShadow: '0 6px 24px rgba(0,0,0,0.35)' } as any)
            : {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.35,
                shadowRadius: 12,
                elevation: 15,
              }),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 12 }}>{getTypeEmoji(dragState.event.type)}</Text>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 12,
              fontFamily: fontFamily.semiBold,
              color: colors.textOnDark,
            }}
          >
            {dragState.event.name}
          </Text>
          <Ionicons name="move-outline" size={14} color={colors.textSecondary} />
        </View>
        <Text style={{ fontSize: 10, color: colors.accent1, fontWeight: '600', marginTop: 2 }}>
          {newTimeLabel}
        </Text>
      </View>
    </View>
  );
}

// ─── Static Event Block ─────────────────────────────────────────────────────

interface StaticEventBlockProps {
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
  isEditing: boolean;
  onEditToggle: (id: string) => void;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
  onUndo: (id: string) => void;
  onDelete?: (id: string) => Promise<boolean> | void;
  onUpdate?: (id: string, patch: { date?: string; startTime?: string; endTime?: string }) => Promise<boolean>;
  onDragStart: (ds: DragState, pageY: number) => void;
  colors: ThemeColors;
}

const StaticEventBlock = React.memo(function StaticEventBlock({
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
  isEditing,
  onEditToggle,
  onComplete,
  onSkip,
  onUndo,
  onDelete,
  onUpdate,
  onDragStart,
  colors,
}: StaticEventBlockProps) {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const timeStr = event.startTime
    ? event.endTime
      ? `${format12h(event.startTime)} – ${format12h(event.endTime)}`
      : format12h(event.startTime)
    : '';

  const intensity = event.intensity ? getIntensityConfig(event.intensity) : null;
  const showActions = isCurrent && !readOnly && !locked && !isCompleted;

  // ── Inline edit state ──
  const [editStart, setEditStart] = useState(event.startTime || '08:00');
  const [editEnd, setEditEnd] = useState(event.endTime || '09:00');
  const [editDate, setEditDate] = useState(event.date || '');
  const [isSaving, setIsSaving] = useState(false);

  // Reset edit values when editing starts
  useEffect(() => {
    if (isEditing) {
      setEditStart(event.startTime || '08:00');
      setEditEnd(event.endTime || '09:00');
      setEditDate(event.date || '');
    }
  }, [isEditing, event.startTime, event.endTime, event.date]);

  /** Shift date by ±N days */
  const shiftDate = useCallback((dateStr: string, days: number): string => {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }, []);

  /** Format date for display: "Mon Mar 16" */
  const formatDateLabel = useCallback((dateStr: string): string => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }, []);

  /** Shift both start+end by deltaMin preserving duration, clamped to grid */
  const shiftTimeBlock = useCallback((deltaMin: number) => {
    const startMin = timeToMinutes(editStart);
    const endMin = timeToMinutes(editEnd);
    const duration = endMin - startMin;
    let newStart = startMin + deltaMin;
    let newEnd = newStart + duration;
    // Clamp
    if (newStart < START_HOUR * 60) {
      newStart = START_HOUR * 60;
      newEnd = newStart + duration;
    }
    if (newEnd > END_HOUR * 60) {
      newEnd = END_HOUR * 60;
      newStart = newEnd - duration;
    }
    if (newStart < START_HOUR * 60) return; // duration too long for grid
    setEditStart(minutesToTime(newStart));
    setEditEnd(minutesToTime(newEnd));
  }, [editStart, editEnd]);

  const handleSave = useCallback(async () => {
    if (!onUpdate || isSaving) return;
    // Validate end > start
    if (timeToMinutes(editEnd) <= timeToMinutes(editStart)) {
      Alert.alert('Invalid Time', 'End time must be after start time.');
      return;
    }
    setIsSaving(true);
    try {
      const patch: { date?: string; startTime?: string; endTime?: string } = {
        startTime: editStart,
        endTime: editEnd,
      };
      if (editDate && editDate !== event.date) {
        patch.date = editDate;
      }
      const ok = await onUpdate(event.id, patch);
      if (ok) {
        onEditToggle(event.id); // close edit mode
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        Alert.alert('Update Failed', 'Could not update event. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  }, [onUpdate, event.id, editStart, editEnd, editDate, event.date, isSaving, onEditToggle]);

  const handleDelete = useCallback(() => {
    if (!onDelete) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Alert.alert('Delete Event', `Remove "${event.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const result = await onDelete(event.id);
          if (result === false) {
            Alert.alert('Delete Failed', 'Could not delete event. Please try again.');
          }
          onEditToggle(event.id); // close edit mode
        },
      },
    ]);
  }, [onDelete, event.id, event.name, onEditToggle]);

  const handleLongPress = useCallback(
    (e: GestureResponderEvent) => {
      if (readOnly || locked || !event.startTime || isEditing) return;
      const startMin = timeToMinutes(event.startTime);
      const endMin = event.endTime ? timeToMinutes(event.endTime) : startMin + 60;

      // Extract pageY from the long-press event for document-level tracking
      const pageY = e.nativeEvent.pageY;

      onDragStart(
        {
          eventId: event.id,
          event,
          originalStartMin: startMin,
          durationMin: endMin - startMin,
          originalY: top,
          typeColor,
          left,
          width,
          height: Math.max(height, 44),
        },
        pageY,
      );
    },
    [event, top, left, width, height, typeColor, readOnly, locked, isEditing, onDragStart],
  );

  // Ghost placeholder while dragging
  if (isDragging) {
    return (
      <View
        style={{
          position: 'absolute',
          top,
          left,
          width,
          height: Math.max(height, 44),
          opacity: 0.2,
          zIndex: 0,
        }}
      >
        <View
          style={{
            flex: 1,
            borderRadius: borderRadius.sm,
            borderLeftWidth: 3,
            borderLeftColor: typeColor,
            backgroundColor: typeColor + '10',
            borderStyle: 'dashed',
            borderWidth: 1,
            borderColor: typeColor + '40',
          }}
        />
      </View>
    );
  }

  // ── Edit mode block height ──
  const editExtraHeight = isEditing ? 100 : 0;
  const blockHeight = Math.max(height, 44) + editExtraHeight;

  return (
    <View
      style={[
        {
          position: 'absolute',
          top,
          left,
          width,
          height: blockHeight,
          zIndex: isEditing ? 100 : isCurrent ? 10 : 1,
        },
        // Prevent text selection on web during long-press
        Platform.OS === 'web' ? ({ userSelect: 'none' } as any) : undefined,
      ]}
    >
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={LONG_PRESS_MS}
        style={({ pressed }) => [
          {
            flex: 1,
            borderRadius: borderRadius.sm,
            borderLeftWidth: 3,
            borderLeftColor: typeColor,
            backgroundColor: isEditing ? typeColor + '25' : typeColor + '18',
            paddingHorizontal: 8,
            paddingVertical: 4,
            opacity: isCompleted ? 0.45 : pressed ? 0.85 : 1,
            overflow: isEditing ? 'visible' : 'hidden',
          },
          isCurrent && !isCompleted && !isEditing && {
            borderLeftWidth: 4,
            borderColor: typeColor + '40',
            borderWidth: 1,
          },
          isEditing && {
            borderLeftWidth: 4,
            borderColor: typeColor + '60',
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
          {isCurrent && !isCompleted && !isEditing && (
            <View
              style={{
                backgroundColor: colors.accent,
                borderRadius: 4,
                paddingHorizontal: 4,
                paddingVertical: 1,
              }}
            >
              <Text style={{ color: '#FFF', fontSize: 8, fontWeight: '800' }}>NOW</Text>
            </View>
          )}
          {!readOnly && !locked && (
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                navigation.navigate('EventEdit', {
                  eventId: event.id,
                  name: event.name,
                  type: event.type,
                  date: event.date || '',
                  startTime: event.startTime || '08:00',
                  endTime: event.endTime || '09:00',
                  notes: event.notes || '',
                  intensity: event.intensity || 'medium',
                });
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 2 }}
            >
              <Ionicons
                name="pencil-outline"
                size={12}
                color={typeColor}
              />
            </Pressable>
          )}
          {!readOnly && !locked && event.startTime && !isEditing && (
            <Ionicons name="reorder-three-outline" size={14} color={colors.textInactive + '80'} />
          )}
        </View>

        {/* Linked program notes (auto-injected) */}
        {!isEditing && event.notes && event.notes.includes('📋') && (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 9,
              fontFamily: fontFamily.regular,
              color: colors.info,
              marginTop: 1,
              opacity: 0.85,
            }}
          >
            {event.notes.split('\n').find((l: string) => l.includes('📋'))?.replace('📋 ', '') ?? ''}
          </Text>
        )}

        {/* ── Inline edit panel (3 rows: date, time, actions) ── */}
        {isEditing && (
          <View style={{ gap: 4, marginTop: 4 }}>
            {/* Row 1 — Date shift */}
            {editDate ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Pressable
                  onPress={() => setEditDate((prev) => shiftDate(prev, -1))}
                  style={{
                    backgroundColor: typeColor + '30',
                    borderRadius: 4,
                    paddingHorizontal: 5,
                    paddingVertical: 2,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <Ionicons name="chevron-back" size={10} color={colors.textOnDark} />
                  <Text style={{ fontSize: 9, fontFamily: fontFamily.semiBold, color: colors.textOnDark }}>-1d</Text>
                </Pressable>
                <Text style={{ flex: 1, fontSize: 9, fontFamily: fontFamily.semiBold, color: colors.textOnDark, textAlign: 'center' }}>
                  {formatDateLabel(editDate)}
                </Text>
                <Pressable
                  onPress={() => setEditDate((prev) => shiftDate(prev, 1))}
                  style={{
                    backgroundColor: typeColor + '30',
                    borderRadius: 4,
                    paddingHorizontal: 5,
                    paddingVertical: 2,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <Text style={{ fontSize: 9, fontFamily: fontFamily.semiBold, color: colors.textOnDark }}>+1d</Text>
                  <Ionicons name="chevron-forward" size={10} color={colors.textOnDark} />
                </Pressable>
              </View>
            ) : null}
            {/* Row 2 — Time shift (preserves duration) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Pressable
                onPress={() => shiftTimeBlock(-30)}
                style={{
                  backgroundColor: typeColor + '30',
                  borderRadius: 4,
                  paddingHorizontal: 5,
                  paddingVertical: 2,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <Ionicons name="chevron-back" size={10} color={colors.textOnDark} />
                <Text style={{ fontSize: 9, fontFamily: fontFamily.semiBold, color: colors.textOnDark }}>Earlier</Text>
              </Pressable>
              <Text style={{ flex: 1, fontSize: 9, fontFamily: fontFamily.semiBold, color: colors.textOnDark, textAlign: 'center' }}>
                {format12h(editStart)} – {format12h(editEnd)}
              </Text>
              <Pressable
                onPress={() => shiftTimeBlock(30)}
                style={{
                  backgroundColor: typeColor + '30',
                  borderRadius: 4,
                  paddingHorizontal: 5,
                  paddingVertical: 2,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <Text style={{ fontSize: 9, fontFamily: fontFamily.semiBold, color: colors.textOnDark }}>Later</Text>
                <Ionicons name="chevron-forward" size={10} color={colors.textOnDark} />
              </Pressable>
            </View>
            {/* Row 3 — Save + Delete */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ flex: 1 }} />
              {onUpdate && (
                <Pressable
                  onPress={handleSave}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  style={{
                    backgroundColor: colors.accent,
                    borderRadius: 4,
                    padding: 4,
                    opacity: isSaving ? 0.5 : 1,
                  }}
                >
                  <Ionicons name="checkmark" size={12} color="#FFF" />
                </Pressable>
              )}
              {onDelete && (
                <Pressable
                  onPress={handleDelete}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  style={{
                    backgroundColor: '#E74C3C20',
                    borderRadius: 4,
                    padding: 4,
                  }}
                >
                  <Ionicons name="trash-outline" size={12} color={colors.error} />
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* Time + intensity (hidden when editing) */}
        {!isEditing && height > 44 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={{ fontSize: 10, color: colors.textSecondary }}>{timeStr}</Text>
            {intensity && (
              <View
                style={{
                  backgroundColor: intensity.color + '22',
                  borderRadius: 3,
                  paddingHorizontal: 4,
                  paddingVertical: 1,
                }}
              >
                <Text style={{ fontSize: 8, color: intensity.color, fontWeight: '700' }}>
                  {intensity.label}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Action buttons */}
        {showActions && !isEditing && height > 70 && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
            <Pressable
              onPress={() => {
                onComplete(event.id);
                if (Platform.OS !== 'web')
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }}
              style={{
                backgroundColor: colors.accent,
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
                if (Platform.OS !== 'web')
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
              <Text style={{ color: colors.textSecondary, fontSize: 9, fontWeight: '700' }}>
                SKIP
              </Text>
            </Pressable>
          </View>
        )}

        {/* Undo for completed */}
        {isCompleted && !readOnly && !locked && !isEditing && height > 44 && (
          <Pressable
            onPress={() => onUndo(event.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}
          >
            <Ionicons name="arrow-undo" size={10} color={typeColor} />
            <Text style={{ fontSize: 9, color: typeColor, fontWeight: '600' }}>UNDO</Text>
          </Pressable>
        )}
      </Pressable>
    </View>
  );
});

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
      backgroundColor: colors.error,
      marginLeft: -4,
    },
    nowLine: {
      flex: 1,
      height: 2,
      backgroundColor: colors.error,
    },
  });
}
