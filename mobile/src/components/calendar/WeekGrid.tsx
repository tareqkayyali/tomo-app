/**
 * WeekGrid — 7-column week view with readiness dots and mini event bars
 * Tap a day to navigate to Day view for that date.
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, spacing, borderRadius, fontFamily } from '../../theme';
import {
  getWeekDays,
  isSameDay,
  getReadinessColor,
  getEventTypeColor,
  getSportDotColor,
  toDateStr,
} from '../../utils/calendarHelpers';
import type { CalendarEvent, Checkin, EventSport } from '../../types';

interface Props {
  selectedDate: Date;
  events: CalendarEvent[];
  checkins: Checkin[];
  onSelectDate: (date: Date) => void;
}

export function WeekGrid({ selectedDate, events, checkins, onSelectDate }: Props) {
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);
  const today = useMemo(() => new Date(), []);

  // Build checkin map
  const checkinMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const c of checkins) {
      map[c.date] = c.readinessLevel ?? null;
    }
    return map;
  }, [checkins]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const evt of events) {
      if (!map[evt.date]) map[evt.date] = [];
      map[evt.date].push(evt);
    }
    return map;
  }, [events]);

  // Sport set per day — which sports have events each day
  const sportMap = useMemo(() => {
    const map: Record<string, Set<EventSport>> = {};
    for (const evt of events) {
      if (!map[evt.date]) map[evt.date] = new Set();
      map[evt.date].add(evt.sport ?? 'general');
    }
    return map;
  }, [events]);

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.container}>
      {/* Header row */}
      <View style={styles.headerRow}>
        {weekDays.map((day) => (
          <View key={day.dateStr} style={styles.headerCell}>
            <Text style={styles.headerLabel}>{day.dayLabel}</Text>
          </View>
        ))}
      </View>

      {/* Day cells */}
      <View style={styles.cellRow}>
        {weekDays.map((day) => {
          const isToday = isSameDay(day.date, today);
          const isSelected = isSameDay(day.date, selectedDate);
          const readinessColor = getReadinessColor(checkinMap[day.dateStr]);
          const dayEvents = eventsByDate[day.dateStr] || [];
          const daySports = sportMap[day.dateStr];

          return (
            <Pressable
              key={day.dateStr}
              style={[
                styles.dayCell,
                isSelected && styles.dayCellSelected,
              ]}
              onPress={() => onSelectDate(day.date)}
            >
              {/* Day number */}
              <View style={[styles.dayNumber, isToday && styles.dayNumberToday]}>
                <Text
                  style={[
                    styles.dayNumberText,
                    isToday && styles.dayNumberTextToday,
                  ]}
                >
                  {day.date.getDate()}
                </Text>
              </View>

              {/* Readiness dot */}
              <View
                style={[
                  styles.readinessDot,
                  readinessColor
                    ? { backgroundColor: readinessColor }
                    : styles.readinessDotEmpty,
                ]}
              />

              {/* Mini event bars (max 3) */}
              <View style={styles.eventsContainer}>
                {dayEvents.slice(0, 3).map((evt) => (
                  <View
                    key={evt.id}
                    style={[
                      styles.miniEventBar,
                      { backgroundColor: getEventTypeColor(evt.type) },
                    ]}
                  />
                ))}
                {dayEvents.length > 3 && (
                  <Text style={styles.moreText}>+{dayEvents.length - 3}</Text>
                )}
              </View>

              {/* Sport-colored dots */}
              {daySports && daySports.size > 0 && (
                <View style={styles.sportDots}>
                  {Array.from(daySports).map((sport) => (
                    <View
                      key={sport}
                      style={[styles.sportDot, { backgroundColor: getSportDotColor(sport) }]}
                    />
                  ))}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  headerCell: {
    flex: 1,
    alignItems: 'center',
  },
  headerLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textInactive,
  },
  cellRow: {
    flexDirection: 'row',
    gap: 4,
  },
  dayCell: {
    flex: 1,
    backgroundColor: colors.cardMuted,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    alignItems: 'center',
    minHeight: 120,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dayCellSelected: {
    borderColor: colors.accent1,
    backgroundColor: colors.cardLight,
  },
  dayNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  dayNumberToday: {
    backgroundColor: colors.accent1,
  },
  dayNumberText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textOnDark,
  },
  dayNumberTextToday: {
    color: '#FFFFFF',
  },
  readinessDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 6,
  },
  readinessDotEmpty: {
    backgroundColor: colors.textInactive,
    opacity: 0.3,
  },
  eventsContainer: {
    flex: 1,
    width: '100%',
    gap: 3,
  },
  miniEventBar: {
    height: 6,
    borderRadius: 3,
    width: '100%',
  },
  moreText: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: colors.textInactive,
    textAlign: 'center',
  },
  sportDots: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 4,
    justifyContent: 'center',
  },
  sportDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
