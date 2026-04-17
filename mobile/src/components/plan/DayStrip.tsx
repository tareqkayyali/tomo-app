/**
 * DayStrip — horizontal scrollable day selector (calendar strip)
 * Shows ~14 days centered on today with swipe left/right navigation.
 * Selected day highlighted with accent circle, today has a dot indicator.
 */
import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Dimensions } from 'react-native';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../theme/colors';

const CELL_WIDTH = 48;
const DAYS_BEFORE = 14;
const DAYS_AFTER = 14;
const TOTAL_DAYS = DAYS_BEFORE + 1 + DAYS_AFTER; // 29 days

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface DayStripProps {
  selectedDate: Date;
  onSelect: (date: Date) => void;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

interface DayItem {
  date: Date;
  key: string;
  dayNum: number;
  weekday: string;
  month: string;
  isToday: boolean;
  isFirstOfMonth: boolean;
}

export function DayStrip({ selectedDate, onSelect }: DayStripProps) {
  const { colors } = useTheme();
  const listRef = useRef<FlatList>(null);
  // Keyed by date string so it refreshes past midnight
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = useMemo(() => new Date(), [todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const days: DayItem[] = useMemo(() => {
    const result: DayItem[] = [];
    for (let i = -DAYS_BEFORE; i <= DAYS_AFTER; i++) {
      const d = addDays(today, i);
      const prev = i > -DAYS_BEFORE ? addDays(today, i - 1) : null;
      result.push({
        date: d,
        key: d.toISOString().slice(0, 10),
        dayNum: d.getDate(),
        weekday: WEEKDAYS[d.getDay()],
        month: MONTHS[d.getMonth()],
        isToday: i === 0,
        isFirstOfMonth: !prev || prev.getMonth() !== d.getMonth(),
      });
    }
    return result;
  }, [today]);

  // Auto-scroll to selected day
  useEffect(() => {
    const idx = days.findIndex(d => isSameDay(d.date, selectedDate));
    if (idx >= 0 && listRef.current) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: Math.max(0, idx - 2), // offset so selected isn't at far left
          animated: true,
          viewPosition: 0,
        });
      }, 100);
    }
  }, [selectedDate, days]);

  const renderItem = useCallback(({ item }: { item: DayItem }) => {
    const isSelected = isSameDay(item.date, selectedDate);
    const isWeekend = item.date.getDay() === 0 || item.date.getDay() === 6;

    return (
      <View>
        {/* Month label on first of month */}
        {item.isFirstOfMonth && (
          <Text style={[styles.monthLabel, { color: colors.accent1 }]}>
            {item.month}
          </Text>
        )}
        {!item.isFirstOfMonth && <View style={styles.monthSpacer} />}

        <Pressable
          onPress={() => onSelect(item.date)}
          style={({ pressed }) => [
            styles.cell,
            pressed && { opacity: 0.6 },
          ]}
        >
          {/* Weekday */}
          <Text style={[
            styles.weekday,
            { color: isSelected ? colors.accent1 : isWeekend ? colors.textMuted : colors.textInactive },
            isSelected && { fontFamily: fontFamily.semiBold },
          ]}>
            {item.weekday}
          </Text>

          {/* Day number with circle */}
          <View style={[
            styles.dayCircle,
            isSelected && { backgroundColor: colors.accent1 },
          ]}>
            <Text style={[
              styles.dayNum,
              { color: isSelected ? colors.textPrimary : colors.textOnDark },
              isSelected && { fontFamily: fontFamily.bold },
            ]}>
              {item.dayNum}
            </Text>
          </View>

          {/* Today dot */}
          {item.isToday && !isSelected && (
            <View style={[styles.todayDot, { backgroundColor: colors.accent1 }]} />
          )}
          {!item.isToday && !isSelected && <View style={styles.dotSpacer} />}
          {isSelected && <View style={styles.dotSpacer} />}
        </Pressable>
      </View>
    );
  }, [selectedDate, colors, onSelect]);

  return (
    <View style={[styles.container, { borderBottomColor: colors.borderLight }]}>
      <FlatList
        ref={listRef}
        data={days}
        renderItem={renderItem}
        keyExtractor={item => item.key}
        horizontal
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={Math.max(0, DAYS_BEFORE - 2)}
        getItemLayout={(_, index) => ({
          length: CELL_WIDTH,
          offset: CELL_WIDTH * index,
          index,
        })}
        contentContainerStyle={styles.listContent}
        onScrollToIndexFailed={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    paddingBottom: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.sm,
  },
  monthLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    height: 14,
    lineHeight: 14,
  },
  monthSpacer: {
    height: 14,
  },
  cell: {
    width: CELL_WIDTH,
    alignItems: 'center',
    paddingVertical: 2,
  },
  weekday: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    marginBottom: 4,
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
  },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 3,
  },
  dotSpacer: {
    width: 5,
    height: 5,
    marginTop: 3,
  },
});
