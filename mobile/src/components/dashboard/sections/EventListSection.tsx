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
import type { SectionProps } from './DashboardSectionRenderer';

const TYPE_COLORS: Record<string, string> = {
  training: '#7A9B76',
  match: '#C8A27A',
  gym: '#8A9BB0',
  recovery: '#7AA59B',
  study: '#8A9BB0',
  exam: '#B08A7A',
  club: '#8A9BB0',
  sleep: '#8A9BB0',
  personal: '#7A8A9A',
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
    <View style={[styles.container, { backgroundColor: colors.cream03, borderColor: colors.cream10 }]}>
      <Text style={[styles.title, { color: colors.tomoCream }]}>Today</Text>

      {displayed.map((ev, i) => {
        const typeColor = TYPE_COLORS[ev.type] ?? colors.muted;

        return (
          <View key={ev.id} style={[styles.eventRow, i < displayed.length - 1 && { borderBottomColor: colors.cream10, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
            <Text style={[styles.time, { color: colors.muted }]}>
              {formatTime(ev.startAt)}
            </Text>
            <Text style={[styles.eventTitle, { color: colors.tomoCream }]} numberOfLines={1}>
              {ev.title}
            </Text>
            {ev.endAt && (
              <Text style={[styles.endTime, { color: colors.muted }]}>
                {formatTime(ev.endAt)}
              </Text>
            )}
          </View>
        );
      })}

      {bootData.tomorrowFirstEvent && (
        <View style={[styles.tomorrowRow, { borderTopColor: colors.cream10 }]}>
          <Text style={[styles.tomorrowLabel, { color: 'rgba(245,243,237,0.35)' }]}>Tomorrow</Text>
          <Text style={[styles.eventTitle, { color: colors.tomoCream }]} numberOfLines={1}>
            {bootData.tomorrowFirstEvent.title}
          </Text>
          <Text style={[styles.time, { color: colors.muted }]}>
            {formatTime(bootData.tomorrowFirstEvent.startAt)}
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  typeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  time: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    minWidth: 42,
  },
  eventTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    flex: 1,
  },
  endTime: {
    fontFamily: fontFamily.regular,
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
    fontFamily: fontFamily.regular,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});
