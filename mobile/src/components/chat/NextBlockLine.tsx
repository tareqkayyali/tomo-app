/**
 * NextBlockLine — one-liner showing the athlete's next scheduled block.
 *
 * Always shows the NEXT upcoming activity, never the current active one —
 * if the athlete is mid-session, they need to know what comes after.
 *
 * Picks (in order):
 *   1. First future event in todayEvents (strictly after now)
 *   2. tomorrowFirstEvent
 *   3. falls back to a muted "No upcoming block" line
 *
 * Format: "Upcoming — {title} — {HH:mm}" (or "Tomorrow HH:mm")
 * Single line, no card chrome.
 *
 * See docs/CHAT_PILLS_RFC.md §4.2.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SmartIcon } from '../SmartIcon';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily } from '../../theme';
import type { BootData } from '../../services/api';

interface Props {
  bootData: BootData | null;
}

type BlockEvent = {
  title: string;
  type: string;
  startAt: string;
  isTomorrow: boolean;
};

function pickNextBlock(bootData: BootData | null): BlockEvent | null {
  if (!bootData) return null;
  const now = Date.now();

  const sortedToday = [...(bootData.todayEvents ?? [])].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
  const nextToday = sortedToday.find((e) => new Date(e.startAt).getTime() > now);
  if (nextToday) {
    return {
      title: nextToday.title,
      type: nextToday.type,
      startAt: nextToday.startAt,
      isTomorrow: false,
    };
  }

  const tmr = bootData.tomorrowFirstEvent;
  if (tmr) {
    return {
      title: tmr.title,
      type: tmr.type,
      startAt: tmr.startAt,
      isTomorrow: true,
    };
  }

  return null;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

function iconForType(type: string): React.ComponentProps<typeof SmartIcon>['name'] {
  switch (type) {
    case 'training':
      return 'barbell-outline';
    case 'match':
    case 'competition':
      return 'trophy-outline';
    case 'recovery':
      return 'leaf-outline';
    case 'study':
      return 'book-outline';
    case 'exam':
    case 'school':
    case 'school_hours':
      return 'school-outline';
    case 'gym':
      return 'fitness-outline';
    default:
      return 'calendar-outline';
  }
}

export const NextBlockLine = React.memo(function NextBlockLine({ bootData }: Props) {
  const { colors } = useTheme();
  const block = useMemo(() => pickNextBlock(bootData), [bootData]);

  if (!block) {
    return (
      <View style={styles.row}>
        <SmartIcon name="calendar-outline" size={16} color={colors.textInactive} />
        <Text style={[styles.text, { color: colors.textInactive }]}>No upcoming block</Text>
      </View>
    );
  }

  const timeLabel = block.isTomorrow
    ? `Tomorrow ${formatTime(block.startAt)}`
    : formatTime(block.startAt);

  return (
    <View style={styles.row}>
      <SmartIcon name={iconForType(block.type)} size={16} color={colors.textMuted} />
      <Text
        style={[styles.text, { color: colors.textOnDark }]}
        numberOfLines={1}
      >
        <Text style={[styles.prefix, { color: colors.textMuted }]}>Upcoming — </Text>
        {block.title}
        <Text style={[styles.time, { color: colors.textMuted }]}> — {timeLabel}</Text>
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    marginTop: 6,
    marginBottom: 10,
  },
  text: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
    flexShrink: 1,
  },
  prefix: {
    fontFamily: fontFamily.medium,
  },
  time: {
    fontFamily: fontFamily.regular,
  },
});
