/**
 * WeekBarChart — Stacked bar chart (Athletic vs Academic) for 7 days
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '../GlassCard';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useBarFill } from '../../hooks/useAnimations';
import { isSameDay, toDateStr } from '../../utils/calendarHelpers';
import type { CalendarEvent } from '../../types';
import type { WeekDay } from '../../utils/calendarHelpers';
import type { ThemeColors } from '../../theme/colors';

interface Props {
  weekDays: WeekDay[];
  events: CalendarEvent[];
  selectedDate: Date;
  onDayPress: (date: Date) => void;
}

const MAX_BAR_HEIGHT = 100;

function parseDuration(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 30; // default 30 min for untimed events
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

function AnimatedBar({
  height,
  color,
  bottom,
}: {
  height: number;
  color: string;
  bottom: number;
}) {
  const barHeight = useBarFill(height, 200);

  const animatedStyle = {
    position: 'absolute' as const,
    bottom,
    left: 0,
    right: 0,
    height: barHeight.value > 0 ? barHeight.value : height, // fallback for static render
    backgroundColor: color,
  };

  return <Animated.View style={animatedStyle} />;
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

    let maxTotal = 0;
    const data = weekDays.map((wd) => {
      const dayEvents = eventsByDay.get(wd.dateStr) ?? [];
      let athletic = 0;
      let academic = 0;
      for (const evt of dayEvents) {
        const dur = parseDuration(evt.startTime, evt.endTime);
        if (evt.type === 'study_block' || evt.type === 'exam') {
          academic += dur;
        } else {
          athletic += dur;
        }
      }
      const total = athletic + academic;
      if (total > maxTotal) maxTotal = total;
      return { ...wd, athletic, academic, total };
    });

    // Normalize bar heights
    return data.map((d) => ({
      ...d,
      athleticHeight: maxTotal > 0 ? (d.athletic / maxTotal) * MAX_BAR_HEIGHT : 0,
      academicHeight: maxTotal > 0 ? (d.academic / maxTotal) * MAX_BAR_HEIGHT : 0,
    }));
  }, [weekDays, events]);

  return (
    <GlassCard style={styles.card}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent1 }]} />
          <Text style={[styles.legendText, { color: colors.textMuted }]}>Athletic</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent2 }]} />
          <Text style={[styles.legendText, { color: colors.textMuted }]}>Academic</Text>
        </View>
      </View>

      <View style={styles.chartRow}>
        {dayData.map((day) => {
          const isSelected = isSameDay(day.date, selectedDate);
          const isToday = isSameDay(day.date, today);
          return (
            <Pressable
              key={day.dateStr}
              style={styles.barCol}
              onPress={() => {
                onDayPress(day.date);
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
              }}
            >
              <View
                style={[
                  styles.barContainer,
                  isSelected && { borderColor: colors.accent1, borderWidth: 1 },
                ]}
              >
                {day.total > 0 ? (
                  <>
                    <View
                      style={[
                        styles.barSegment,
                        {
                          height: day.academicHeight,
                          backgroundColor: colors.accent2,
                          borderTopLeftRadius: day.athleticHeight === 0 ? 4 : 0,
                          borderTopRightRadius: day.athleticHeight === 0 ? 4 : 0,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.barSegment,
                        {
                          height: day.athleticHeight,
                          backgroundColor: colors.accent1,
                          borderTopLeftRadius: 4,
                          borderTopRightRadius: 4,
                        },
                      ]}
                    />
                  </>
                ) : (
                  <View style={[styles.emptyBar, { backgroundColor: colors.glassBorder }]} />
                )}
              </View>
              <Text
                style={[
                  styles.dayLabel,
                  { color: isToday ? colors.accent1 : colors.textMuted },
                  isSelected && { color: colors.textOnDark },
                ]}
              >
                {day.dayLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </GlassCard>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      padding: spacing.md,
    },
    legend: {
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.md,
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
    chartRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      height: MAX_BAR_HEIGHT + 24,
      gap: 4,
    },
    barCol: {
      flex: 1,
      alignItems: 'center',
    },
    barContainer: {
      width: '80%',
      height: MAX_BAR_HEIGHT,
      justifyContent: 'flex-end',
      borderRadius: 4,
      overflow: 'hidden',
    },
    barSegment: {
      width: '100%',
    },
    emptyBar: {
      height: 3,
      borderRadius: 1.5,
    },
    dayLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 10,
      marginTop: 6,
    },
  });
}
