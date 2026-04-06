/**
 * WeekBarChart — Horizontal dual-bar rows (Training + Academic) for 7 days
 *
 * Each day row: [Day letter] [Training bar ⚡] [Academic bar 📚] [Event tag]
 * Today's row is highlighted with orange tint.
 * Matches prototype Week View design.
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '../GlassCard';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { isSameDay, toDateStr } from '../../utils/calendarHelpers';
import type { CalendarEvent } from '../../types';
import type { WeekDay } from '../../utils/calendarHelpers';
import type { ThemeColors } from '../../theme/colors';

import { colors } from '../../theme/colors';

const ACADEMIC_PURPLE = colors.textSecondary;

interface Props {
  weekDays: WeekDay[];
  events: CalendarEvent[];
  selectedDate: Date;
  onDayPress: (date: Date) => void;
}

function parseDuration(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 30;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

export function WeekBarChart({ weekDays, events, selectedDate, onDayPress }: Props) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const today = useMemo(() => new Date(), []);

  const dayData = useMemo(() => {
    const eventsByDay = new Map<string, CalendarEvent[]>();
    for (const evt of events) {
      const list = eventsByDay.get(evt.date) ?? [];
      list.push(evt);
      eventsByDay.set(evt.date, list);
    }

    let maxTrain = 0;
    let maxAcad = 0;

    const data = weekDays.map((wd) => {
      const dayEvents = eventsByDay.get(wd.dateStr) ?? [];
      let trainMin = 0;
      let acadMin = 0;
      let hasExam = false;
      let hasMatch = false;
      let examSubject = '';

      for (const evt of dayEvents) {
        const dur = parseDuration(evt.startTime, evt.endTime);
        if (evt.type === 'study_block' || evt.type === 'exam') {
          acadMin += dur;
          if (evt.type === 'exam') {
            hasExam = true;
            examSubject = evt.name?.split(' ')[0] || 'Exam';
          }
        } else if (evt.type === 'training' || evt.type === 'match') {
          trainMin += dur;
          if (evt.type === 'match') hasMatch = true;
        }
      }

      if (trainMin > maxTrain) maxTrain = trainMin;
      if (acadMin > maxAcad) maxAcad = acadMin;

      return { ...wd, trainMin, acadMin, hasExam, hasMatch, examSubject };
    });

    return { rows: data, maxTrain, maxAcad };
  }, [weekDays, events]);

  const { rows, maxTrain, maxAcad } = dayData;

  return (
    <GlassCard style={styles.card}>
      {rows.map((day) => {
        const isToday = isSameDay(day.date, today);
        const isSelected = isSameDay(day.date, selectedDate);
        const trainPct = maxTrain > 0 ? (day.trainMin / maxTrain) * 100 : 0;
        const acadPct = maxAcad > 0 ? (day.acadMin / maxAcad) * 100 : 0;

        return (
          <Pressable
            key={day.dateStr}
            onPress={() => {
              onDayPress(day.date);
              if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
            }}
            style={[
              styles.dayRow,
              isToday && {
                backgroundColor: colors.accent1 + '10',
                borderWidth: 1,
                borderColor: colors.accent1 + '33',
              },
              isSelected && !isToday && {
                backgroundColor: colors.textOnDark + '08',
              },
            ]}
          >
            {/* Day letter */}
            <Text
              style={[
                styles.dayLabel,
                { color: isToday ? colors.accent1 : colors.textMuted },
              ]}
            >
              {day.dayLabel}
            </Text>

            {/* Dual bars */}
            <View style={styles.barsContainer}>
              {/* Training bar */}
              <View style={styles.barRow}>
                <Text style={styles.barEmoji}></Text>
                <View style={styles.barTrack}>
                  {trainPct > 0 && (
                    <View
                      style={[
                        styles.bar,
                        {
                          width: `${Math.max(trainPct, 4)}%`,
                          backgroundColor: colors.accent1,
                        },
                      ]}
                    />
                  )}
                </View>
              </View>
              {/* Academic bar */}
              <View style={styles.barRow}>
                <Text style={styles.barEmoji}></Text>
                <View style={styles.barTrack}>
                  {acadPct > 0 && (
                    <View
                      style={[
                        styles.bar,
                        {
                          width: `${Math.max(acadPct, 4)}%`,
                          backgroundColor: ACADEMIC_PURPLE,
                        },
                      ]}
                    />
                  )}
                </View>
              </View>
            </View>

            {/* Event tag */}
            <View style={styles.tagCol}>
              {day.hasExam ? (
                <View style={[styles.eventTag, { backgroundColor: colors.secondarySubtle }]}>
                  <Text style={[styles.eventTagText, { color: colors.error }]}>
                    {day.examSubject.slice(0, 4)}
                  </Text>
                </View>
              ) : day.hasMatch ? (
                <View style={[styles.eventTag, { backgroundColor: colors.accent2 + '22' }]}>
                  <Text style={[styles.eventTagText, { color: colors.accent2 }]}>
                    Match
                  </Text>
                </View>
              ) : isToday ? (
                <Text style={[styles.todayLabel, { color: colors.accent1 }]}>Today</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent1 }]} />
          <Text style={[styles.legendText, { color: colors.textMuted }]}>Training</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: ACADEMIC_PURPLE }]} />
          <Text style={[styles.legendText, { color: colors.textMuted }]}>Academic</Text>
        </View>
        <View style={styles.legendItem}>
          <Text style={[styles.legendText, { color: colors.textMuted }]}>Exam</Text>
        </View>
      </View>
    </GlassCard>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      padding: spacing.md,
      gap: 4,
    },
    dayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 0,
      borderColor: 'transparent',
    },
    dayLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      width: 26,
      textAlign: 'center',
    },
    barsContainer: {
      flex: 1,
      marginHorizontal: 10,
      gap: 3,
    },
    barRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    barEmoji: {
      fontSize: 10,
      width: 16,
      textAlign: 'center',
    },
    barTrack: {
      flex: 1,
      height: 6,
      backgroundColor: colors.glassBorder,
      borderRadius: 3,
      overflow: 'hidden',
    },
    bar: {
      height: '100%',
      borderRadius: 3,
    },
    tagCol: {
      width: 60,
      alignItems: 'flex-end',
    },
    eventTag: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    eventTagText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 9,
    },
    todayLabel: {
      fontFamily: fontFamily.semiBold,
      fontSize: 10,
    },
    legend: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.md,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.glassBorder,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
    },
  });
}
