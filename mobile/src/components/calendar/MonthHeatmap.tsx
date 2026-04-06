/**
 * MonthHeatmap — Timepage-inspired month grid with intensity-colored cells
 * Each cell shows day number, readiness dot, and background tint.
 * Tap a day to navigate to Day view.
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, spacing, borderRadius, fontFamily } from '../../theme';
import {
  getMonthDays,
  isSameDay,
  getReadinessColor,
  getSportDotColor,
  toDateStr,
} from '../../utils/calendarHelpers';
import type { CalendarEvent, Checkin, EventSport } from '../../types';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Intensity → background tint for heatmap
const INTENSITY_BG: Record<string, string> = {
  REST: colors.secondarySubtle,
  LIGHT: colors.accentMuted,
  MODERATE: colors.accentMuted,
  HARD: colors.secondarySubtle,
};

interface Props {
  selectedDate: Date;
  events: CalendarEvent[];
  checkins: Checkin[];
  onSelectDate: (date: Date) => void;
}

export function MonthHeatmap({ selectedDate, events, checkins, onSelectDate }: Props) {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const monthDays = useMemo(() => getMonthDays(year, month), [year, month]);
  const today = useMemo(() => new Date(), []);

  // Build checkin map
  const checkinMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const c of checkins) {
      map[c.date] = c.readinessLevel ?? null;
    }
    return map;
  }, [checkins]);

  // Build event intensity map (highest intensity per day)
  const intensityMap = useMemo(() => {
    const map: Record<string, string> = {};
    const priority: Record<string, number> = { REST: 1, LIGHT: 2, MODERATE: 3, HARD: 4 };
    for (const evt of events) {
      const existing = map[evt.date];
      const existingPriority = existing ? (priority[existing] ?? 0) : 0;
      const newPriority = evt.intensity ? (priority[evt.intensity] ?? 0) : 0;
      if (newPriority > existingPriority && evt.intensity) {
        map[evt.date] = evt.intensity;
      }
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

  // Split into rows of 7
  const rows = useMemo(() => {
    const result: typeof monthDays[] = [];
    for (let i = 0; i < monthDays.length; i += 7) {
      result.push(monthDays.slice(i, i + 7));
    }
    return result;
  }, [monthDays]);

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.container}>
      {/* Day of week header */}
      <View style={styles.headerRow}>
        {DAY_LABELS.map((label) => (
          <View key={label} style={styles.headerCell}>
            <Text style={styles.headerText}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Month grid */}
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((day) => {
            const isToday = day.isToday;
            const isSelected = isSameDay(day.date, selectedDate);
            const readinessColor = getReadinessColor(checkinMap[day.dateStr]);
            const intensity = intensityMap[day.dateStr];
            const daySports = sportMap[day.dateStr];
            const bgTint = intensity ? INTENSITY_BG[intensity] : undefined;

            return (
              <Pressable
                key={day.dateStr}
                style={[
                  styles.cell,
                  !day.isCurrentMonth && styles.cellOutside,
                  bgTint ? { backgroundColor: bgTint } : undefined,
                  isSelected && styles.cellSelected,
                ]}
                onPress={() => onSelectDate(day.date)}
              >
                <View
                  style={[
                    styles.dayNumberWrap,
                    isToday && styles.dayNumberToday,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      !day.isCurrentMonth && styles.dayNumberOutside,
                      isToday && styles.dayNumberTodayText,
                    ]}
                  >
                    {day.dayNumber}
                  </Text>
                </View>

                {/* Readiness dot */}
                {readinessColor && (
                  <View style={[styles.readinessDot, { backgroundColor: readinessColor }]} />
                )}

                {/* Sport-colored event dots */}
                {daySports && daySports.size > 0 && (
                  <View style={styles.eventDots}>
                    {Array.from(daySports).map((sport) => (
                      <View
                        key={sport}
                        style={[styles.eventDot, { backgroundColor: getSportDotColor(sport) }]}
                      />
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
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
  headerText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textInactive,
  },
  row: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 2,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: colors.cardMuted,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cellOutside: {
    opacity: 0.35,
  },
  cellSelected: {
    borderColor: colors.accent1,
  },
  dayNumberWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberToday: {
    backgroundColor: colors.accent1,
  },
  dayNumber: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textOnDark,
  },
  dayNumberOutside: {
    color: colors.textMuted,
  },
  dayNumberTodayText: {
    color: colors.textPrimary,
  },
  readinessDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 2,
  },
  eventDots: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
