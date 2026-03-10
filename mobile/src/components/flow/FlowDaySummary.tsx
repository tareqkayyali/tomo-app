/**
 * FlowDaySummary — Day load, progress, and time breakdown card
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GlassCard } from '../GlassCard';
import { spacing, fontFamily } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { CalendarEvent } from '../../types';
import type { ThemeColors } from '../../theme/colors';

interface Props {
  events: CalendarEvent[];
  completedEventIds: Set<string>;
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

export function FlowDaySummary({ events, completedEventIds }: Props) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const stats = useMemo(() => {
    let totalLoad = 0;
    let maxLoad = 0;
    let athleticMins = 0;
    let academicMins = 0;
    const completedCount = events.filter((e) => completedEventIds.has(e.id)).length;

    for (const evt of events) {
      const points = INTENSITY_POINTS[evt.intensity ?? 'MODERATE'] ?? 2;
      totalLoad += points;
      maxLoad += 3; // max possible per event
      const dur = parseDuration(evt.startTime, evt.endTime);
      if (evt.type === 'study_block' || evt.type === 'exam') {
        academicMins += dur;
      } else {
        athleticMins += dur;
      }
    }

    const loadPct = maxLoad > 0 ? Math.round((totalLoad / maxLoad) * 100) : 0;
    return { loadPct, completedCount, total: events.length, athleticMins, academicMins };
  }, [events, completedEventIds]);

  const formatTime = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <GlassCard style={styles.card}>
      <View style={styles.row}>
        {/* Load */}
        <View style={styles.stat}>
          <View style={styles.miniRingWrap}>
            <View
              style={[
                styles.miniRingBg,
                { borderColor: colors.glassBorder },
              ]}
            />
            <View
              style={[
                styles.miniRingProgress,
                {
                  borderColor: colors.accent1,
                  borderTopColor: stats.loadPct > 25 ? colors.accent1 : 'transparent',
                  borderRightColor: stats.loadPct > 50 ? colors.accent1 : 'transparent',
                  borderBottomColor: stats.loadPct > 75 ? colors.accent1 : 'transparent',
                  transform: [{ rotate: '-45deg' }],
                },
              ]}
            />
            <Text style={[styles.miniRingText, { color: colors.accent1 }]}>
              {stats.loadPct}%
            </Text>
          </View>
          <Text style={styles.statLabel}>Load</Text>
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.glassBorder }]} />

        {/* Progress */}
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.textOnDark }]}>
            {stats.completedCount}/{stats.total}
          </Text>
          <Text style={styles.statLabel}>Progress</Text>
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.glassBorder }]} />

        {/* Time */}
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.accent1 }]}>
            {formatTime(stats.athleticMins)}
          </Text>
          <Text style={styles.statLabel}>Athletic</Text>
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.glassBorder }]} />

        {/* Academic */}
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.accent2 }]}>
            {formatTime(stats.academicMins)}
          </Text>
          <Text style={styles.statLabel}>Academic</Text>
        </View>
      </View>
    </GlassCard>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      padding: spacing.compact,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    stat: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    statValue: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
    },
    statLabel: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      color: colors.textMuted,
    },
    divider: {
      width: 1,
      height: 28,
    },
    miniRingWrap: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    miniRingBg: {
      position: 'absolute',
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 3,
    },
    miniRingProgress: {
      position: 'absolute',
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 3,
    },
    miniRingText: {
      fontFamily: fontFamily.bold,
      fontSize: 8,
    },
  });
}
