/**
 * WeekDayDetail — Day detail card shown below the bar chart in Week view
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { spacing, fontFamily } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { isSameDay } from '../../utils/calendarHelpers';
import type { CalendarEvent, Checkin } from '../../types';
import type { ThemeColors } from '../../theme/colors';

interface Props {
  date: Date;
  events: CalendarEvent[];
  weekEvents: CalendarEvent[];
  checkins: Checkin[];
}

const INTENSITY_POINTS: Record<string, number> = {
  REST: 0,
  LIGHT: 1,
  MODERATE: 2,
  HARD: 3,
};

function parseDuration(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

export function WeekDayDetail({ date, events, weekEvents, checkins }: Props) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const isToday = isSameDay(date, new Date());

  const dayLabel = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const dayStats = useMemo(() => {
    let totalMins = 0;
    for (const evt of events) {
      totalMins += parseDuration(evt.startTime, evt.endTime);
    }
    const hours = Math.round((totalMins / 60) * 10) / 10;
    return { eventCount: events.length, hours };
  }, [events]);

  const weekStats = useMemo(() => {
    // Week load: sum of intensity points for all week events
    let weekLoad = 0;
    for (const evt of weekEvents) {
      weekLoad += INTENSITY_POINTS[evt.intensity ?? 'MODERATE'] ?? 2;
    }

    // Average sleep from checkins
    const sleepValues = checkins
      .filter((c) => c.sleepHours > 0)
      .map((c) => c.sleepHours);
    const avgSleep =
      sleepValues.length > 0
        ? Math.round((sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length) * 10) / 10
        : 0;

    return { weekLoad, avgSleep };
  }, [weekEvents, checkins]);

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.dayName, { color: colors.textOnDark }]}>
            {isToday ? 'Today' : dayLabel}
          </Text>
          <Text style={[styles.dayMeta, { color: colors.textMuted }]}>
            {dayStats.eventCount} event{dayStats.eventCount !== 1 ? 's' : ''}
            {dayStats.hours > 0 ? ` · ${dayStats.hours}h` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Ionicons name="flame-outline" size={16} color={colors.accent1} />
          <Text style={[styles.statValue, { color: colors.textOnDark }]}>
            {weekStats.weekLoad}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Week Load</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.glassBorder }]} />
        <View style={styles.statItem}>
          <Ionicons name="moon-outline" size={16} color={colors.accent2} />
          <Text style={[styles.statValue, { color: colors.textOnDark }]}>
            {weekStats.avgSleep > 0 ? `${weekStats.avgSleep}h` : '—'}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Avg Sleep</Text>
        </View>
      </View>
    </GlassCard>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      padding: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.compact,
    },
    dayName: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
    },
    dayMeta: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      marginTop: 2,
    },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    statValue: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
    },
    statLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
    },
    divider: {
      width: 1,
      height: 36,
    },
  });
}
