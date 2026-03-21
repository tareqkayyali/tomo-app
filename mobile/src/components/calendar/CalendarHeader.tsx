/**
 * CalendarHeader — Date display with navigation arrows and Today button
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../theme/colors';
import {
  formatDateHeader,
  formatWeekRange,
  formatMonthYear,
  isSameDay,
} from '../../utils/calendarHelpers';
import type { ViewMode } from '../../hooks/useCalendarData';

interface Props {
  selectedDate: Date;
  viewMode: ViewMode;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

function formatFocusTitle(date: Date): string {
  const today = new Date();
  if (isSameDay(date, today)) {
    const month = date.toLocaleString('en-US', { month: 'short' });
    return `Today, ${month} ${date.getDate()}`;
  }
  return formatDateHeader(date);
}

export function CalendarHeader({ selectedDate, viewMode, onPrev, onNext, onToday }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isToday = isSameDay(selectedDate, new Date());

  let title: string;
  if (viewMode === 'focus') {
    title = formatFocusTitle(selectedDate);
  } else if (viewMode === 'day') {
    title = formatDateHeader(selectedDate);
  } else if (viewMode === 'week') {
    title = formatWeekRange(selectedDate);
  } else {
    title = formatMonthYear(selectedDate);
  }

  // In focus mode, hide nav arrows (always shows today)
  const showArrows = viewMode !== 'focus';

  return (
    <View style={styles.container}>
      <View style={styles.navRow}>
        {showArrows ? (
          <Pressable onPress={onPrev} style={styles.arrowBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous">
            <Ionicons name="chevron-back" size={22} color={colors.textOnDark} />
          </Pressable>
        ) : (
          <View style={styles.arrowPlaceholder} />
        )}

        <Animated.View
          key={title}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={styles.titleWrap}
        >
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </Animated.View>

        {showArrows ? (
          <Pressable onPress={onNext} style={styles.arrowBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Next">
            <Ionicons name="chevron-forward" size={22} color={colors.textOnDark} />
          </Pressable>
        ) : (
          <View style={styles.arrowPlaceholder} />
        )}
      </View>

      {!isToday && viewMode !== 'focus' && (
        <Pressable onPress={onToday} style={styles.todayBtn} hitSlop={{ top: 8, bottom: 8 }} accessibilityRole="button" accessibilityLabel="Go to today">
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      marginBottom: spacing.xs,
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    arrowBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.cardMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrowPlaceholder: {
      width: 36,
      height: 36,
    },
    titleWrap: {
      flex: 1,
      alignItems: 'center',
    },
    title: {
      fontFamily: fontFamily.semiBold,
      fontSize: 17,
      color: colors.textOnDark,
    },
    todayBtn: {
      backgroundColor: colors.accent1,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
      marginLeft: spacing.sm,
    },
    todayText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
  });
}
