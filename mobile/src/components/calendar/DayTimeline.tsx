/**
 * DayTimeline — Vertical time-based layout for day view
 * Shows hours 6AM-10PM with event blocks positioned by time.
 * Includes current time indicator with pulsing animation.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, spacing, fontFamily } from '../../theme';
import {
  timeToMinutes,
  minutesToY,
  isSameDay,
  getEventTypeColor,
  getSportDotColor,
  getSportLabel,
} from '../../utils/calendarHelpers';
import { EventCard } from './EventCard';
import type { CalendarEvent } from '../../types';
import type { TrainingCategoryRule } from '../../hooks/useScheduleRules';

const HOUR_HEIGHT = 72;
const START_HOUR = 6;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const TIMELINE_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;
const TIME_GUTTER = 52;

interface Props {
  events: CalendarEvent[];
  selectedDate: Date;
  onDeleteEvent?: (eventId: string) => Promise<boolean> | void;
  trainingCategories?: TrainingCategoryRule[];
}

/**
 * Find linked programs for a training event by matching event name
 * against training category labels.
 */
function getLinkedProgramsForEvent(
  event: CalendarEvent,
  categories: TrainingCategoryRule[],
): { programId: string; name: string; category: string }[] {
  if (event.type !== 'training') return [];
  // Match by event name containing category label, or category label containing event name
  const eventNameLower = event.name.toLowerCase();
  for (const cat of categories) {
    const catLabelLower = cat.label.toLowerCase();
    if (
      eventNameLower.includes(catLabelLower) ||
      catLabelLower.includes(eventNameLower)
    ) {
      return cat.linkedPrograms ?? [];
    }
  }
  return [];
}

// ─── Current Time Indicator ─────────────────────────────────────────────────

function CurrentTimeLine({ date }: { date: Date }) {
  const now = new Date();
  if (!isSameDay(date, now)) return null;

  const minutes = now.getHours() * 60 + now.getMinutes();
  const y = minutesToY(minutes, HOUR_HEIGHT, START_HOUR);

  // Skip if outside visible range
  if (y < 0 || y > TIMELINE_HEIGHT) return null;

  const pulseOpacity = useSharedValue(1);
  React.useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(0.4, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  return (
    <View style={[styles.currentTimeLine, { top: y }]}>
      <Animated.View style={[styles.currentTimeDot, dotStyle]} />
      <View style={styles.currentTimeBar} />
    </View>
  );
}

// ─── Hour Labels ────────────────────────────────────────────────────────────

function HourLabels() {
  const hours: string[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
    hours.push(label);
  }

  return (
    <View style={styles.hourColumn}>
      {hours.map((label, i) => (
        <View key={i} style={[styles.hourRow, { height: i < hours.length - 1 ? HOUR_HEIGHT : 0 }]}>
          <Text style={styles.hourLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Hour Grid Lines ────────────────────────────────────────────────────────

function HourGridLines() {
  const lines = [];
  for (let i = 0; i <= TOTAL_HOURS; i++) {
    lines.push(
      <View key={i} style={[styles.gridLine, { top: i * HOUR_HEIGHT }]} />,
    );
  }
  return <>{lines}</>;
}

// ─── Event Blocks (positioned by time) ──────────────────────────────────────

function TimelineEventBlock({
  event,
  onDelete,
  trainingCategories = [],
}: {
  event: CalendarEvent;
  onDelete?: (id: string) => Promise<boolean> | void;
  trainingCategories?: TrainingCategoryRule[];
}) {
  const typeColor = getEventTypeColor(event.type);

  if (!event.startTime) return null;

  const startMin = timeToMinutes(event.startTime);
  const endMin = event.endTime ? timeToMinutes(event.endTime) : startMin + 60;
  const top = minutesToY(startMin, HOUR_HEIGHT, START_HOUR);
  const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 30);

  const sportColor = event.sport && event.sport !== 'general'
    ? getSportDotColor(event.sport)
    : null;

  return (
    <View style={[styles.eventBlock, { top, height, borderLeftColor: typeColor }]}>
      <View style={styles.eventBlockHeader}>
        <Text style={styles.eventBlockName} numberOfLines={2}>
          {event.name}
        </Text>
        {sportColor && (
          <View style={[styles.eventSportBadge, { backgroundColor: sportColor + '20' }]}>
            <View style={[styles.eventSportDot, { backgroundColor: sportColor }]} />
            <Text style={[styles.eventSportLabel, { color: sportColor }]}>
              {getSportLabel(event.sport)}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.eventBlockTime}>
        {event.startTime}{event.endTime ? ` – ${event.endTime}` : ''}
      </Text>
      {(() => {
        const linked = getLinkedProgramsForEvent(event, trainingCategories);
        if (linked.length === 0) return null;
        return (
          <Text style={styles.eventBlockLinked} numberOfLines={1}>
            {linked.map((lp) => lp.name).join(', ')}
          </Text>
        );
      })()}
    </View>
  );
}

// ─── Untimed Events Section ─────────────────────────────────────────────────

function UntimedEvents({
  events,
  onDelete,
}: {
  events: CalendarEvent[];
  onDelete?: (id: string) => Promise<boolean> | void;
}) {
  if (events.length === 0) return null;

  return (
    <View style={styles.untimedSection}>
      <Text style={styles.untimedLabel}>All Day / No Time</Text>
      {events.map((event) => (
        <EventCard key={event.id} event={event} onDelete={onDelete} />
      ))}
    </View>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function DayTimeline({ events, selectedDate, onDeleteEvent, trainingCategories = [] }: Props) {
  const { timedEvents, untimedEvents } = useMemo(() => {
    const timed: CalendarEvent[] = [];
    const untimed: CalendarEvent[] = [];
    // Use local date (not UTC) to match event.date which is in the user's timezone
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(selectedDate.getDate()).padStart(2, '0');
    const dayStr = `${y}-${m}-${dd}`;

    for (const evt of events) {
      if (evt.date !== dayStr) continue;
      if (evt.startTime) {
        timed.push(evt);
      } else {
        untimed.push(evt);
      }
    }
    // Sort timed by start time
    timed.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
    return { timedEvents: timed, untimedEvents: untimed };
  }, [events, selectedDate]);

  const hasNoEvents = timedEvents.length === 0 && untimedEvents.length === 0;

  return (
    <View>
      {/* Untimed events at top */}
      <UntimedEvents events={untimedEvents} onDelete={onDeleteEvent} />

      {hasNoEvents && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No events for this day</Text>
        </View>
      )}

      {/* Timeline grid */}
      {timedEvents.length > 0 && (
        <View style={styles.timelineContainer}>
          <HourLabels />
          <View style={styles.timelineContent}>
            <HourGridLines />
            <CurrentTimeLine date={selectedDate} />
            {timedEvents.map((event) => (
              <TimelineEventBlock
                key={event.id}
                event={event}
                onDelete={onDeleteEvent}
                trainingCategories={trainingCategories}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const screenWidth = Dimensions.get('window').width;

const styles = StyleSheet.create({
  timelineContainer: {
    flexDirection: 'row',
    minHeight: TIMELINE_HEIGHT,
    marginTop: spacing.sm,
  },
  hourColumn: {
    width: TIME_GUTTER,
    paddingRight: spacing.sm,
  },
  hourRow: {
    justifyContent: 'flex-start',
  },
  hourLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: -7,
  },
  timelineContent: {
    flex: 1,
    position: 'relative',
    height: TIMELINE_HEIGHT,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.divider,
  },

  // ── Current time ────────────────────────────────────────────────
  currentTimeLine: {
    position: 'absolute',
    left: -6,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  currentTimeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent1,
  },
  currentTimeBar: {
    flex: 1,
    height: 2,
    backgroundColor: colors.accent1,
  },

  // ── Event blocks ────────────────────────────────────────────────
  eventBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.cardLight,
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    zIndex: 5,
    overflow: 'hidden',
  },
  eventBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventBlockName: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textOnDark,
    flex: 1,
  },
  eventSportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 6,
  },
  eventSportDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  eventSportLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
  },
  eventBlockTime: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textInactive,
    marginTop: 2,
  },
  eventBlockLinked: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: colors.info,
    marginTop: 2,
  },

  // ── Untimed events ──────────────────────────────────────────────
  untimedSection: {
    marginBottom: spacing.md,
  },
  untimedLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Empty state ─────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textInactive,
  },
});
