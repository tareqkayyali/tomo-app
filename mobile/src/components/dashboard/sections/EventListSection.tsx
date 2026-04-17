/**
 * EventListSection — Upcoming events / schedule preview.
 *
 * Config:
 *   max_items: number — max events (default: 5)
 *   days_ahead: number — lookahead window (default: 7)
 *   show_type_icon: boolean
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { fontFamily } from '../../../theme/typography';
import { borderRadius, spacing } from '../../../theme/spacing';
import type { SectionProps } from './DashboardSectionRenderer';

const TYPE_COLORS: Record<string, string> = {
  training: '#7a9b76',
  match: '#A05A4A',
  gym: '#5A8A9F',
  recovery: '#6A5A8A',
  study: '#c49a3c',
  exam: '#8A4A4A',
  club: '#4A7A8A',
  sleep: '#5A6A8A',
  personal: '#8A6A30',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export const EventListSection = memo(function EventListSection({
  config,
  bootData,
}: SectionProps) {
  const { colors } = useTheme();
  const maxItems = (config.max_items as number) ?? 5;

  const events = bootData.todayEvents ?? [];
  const displayed = events.slice(0, maxItems);

  if (displayed.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.chalk }]}>Today</Text>

      {displayed.map((ev, i) => {
        const typeColor = TYPE_COLORS[ev.type] ?? colors.chalkDim;

        return (
          <View key={ev.id} style={[styles.eventRow, i < displayed.length - 1 && styles.eventBorder]}>
            <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
            <Text style={[styles.time, { color: colors.chalkDim }]}>
              {formatTime(ev.startAt)}
            </Text>
            <Text style={[styles.eventTitle, { color: colors.chalk }]} numberOfLines={1}>
              {ev.title}
            </Text>
            {ev.endAt && (
              <Text style={[styles.endTime, { color: colors.chalkDim }]}>
                {formatTime(ev.endAt)}
              </Text>
            )}
          </View>
        );
      })}

      {bootData.tomorrowFirstEvent && (
        <View style={[styles.tomorrowRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.tomorrowLabel, { color: colors.chalkDim }]}>Tomorrow</Text>
          <Text style={[styles.eventTitle, { color: colors.chalk }]} numberOfLines={1}>
            {bootData.tomorrowFirstEvent.title}
          </Text>
          <Text style={[styles.time, { color: colors.chalkDim }]}>
            {formatTime(bootData.tomorrowFirstEvent.startAt)}
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: 16,
  },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    marginBottom: 12,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  eventBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(245,243,237,0.06)',
  },
  typeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  time: {
    fontFamily: fontFamily.note,
    fontSize: 12,
    minWidth: 42,
  },
  eventTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    flex: 1,
  },
  endTime: {
    fontFamily: fontFamily.note,
    fontSize: 11,
  },
  tomorrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    marginTop: 4,
    borderTopWidth: 1,
  },
  tomorrowLabel: {
    fontFamily: fontFamily.note,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});
