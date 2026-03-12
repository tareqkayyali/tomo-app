/**
 * Parent Calendar Screen
 * Month calendar view showing the child's schedule with colored event dots.
 * Tap a day to navigate to ParentDailyView.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { getParentChildren, getChildCalendar } from '../../services/api';
import { layout, spacing, borderRadius } from '../../theme';
import type { ParentTabParamList, ParentStackParamList } from '../../navigation/types';
import type { PlayerSummary } from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<ParentTabParamList, 'Calendar'>,
  NativeStackScreenProps<ParentStackParamList>
>;

// ── Event type colors ───────────────────────────────────────────────

const EVENT_COLORS: Record<string, string> = {
  training: '#FF6B35',
  study: '#4A9EFF',
  exam: '#FF4757',
  match: '#2ED573',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Helpers ─────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── Component ───────────────────────────────────────────────────────

export function ParentCalendarScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { profile } = useAuth();

  const [children, setChildren] = useState<PlayerSummary[]>([]);
  const [selectedChild, setSelectedChild] = useState<PlayerSummary | null>(null);
  const [events, setEvents] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Fetch children
  useEffect(() => {
    (async () => {
      try {
        const res = await getParentChildren();
        setChildren(res.children);
        if (res.children.length > 0) {
          setSelectedChild(res.children[0]);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fetch calendar when child changes
  useEffect(() => {
    if (!selectedChild) return;
    (async () => {
      try {
        const res = await getChildCalendar(selectedChild.id);
        const mapped: Record<string, string[]> = {};
        for (const evt of res.events) {
          const date = evt.date as string;
          const type = (evt.type as string) || 'training';
          if (!mapped[date]) mapped[date] = [];
          if (!mapped[date].includes(type)) mapped[date].push(type);
        }
        setEvents(mapped);
      } catch {
        setEvents({});
      }
    })();
  }, [selectedChild]);

  // Month navigation
  const goToPreviousMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }, [viewMonth, viewYear]);

  const goToNextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }, [viewMonth, viewYear]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  const handleDayPress = useCallback(
    (day: number) => {
      if (!selectedChild) return;
      const date = formatDate(viewYear, viewMonth, day);
      navigation.navigate('ParentDailyView', {
        childId: selectedChild.id,
        childName: selectedChild.name,
        date,
      });
    },
    [selectedChild, viewYear, viewMonth, navigation],
  );

  const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate());

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent1} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Child selector (if multiple) */}
        {children.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childSelector}>
            {children.map((child) => (
              <TouchableOpacity
                key={child.id}
                style={[
                  styles.childChip,
                  {
                    backgroundColor:
                      selectedChild?.id === child.id ? colors.accent1 : colors.surface,
                    borderColor: selectedChild?.id === child.id ? colors.accent1 : colors.border,
                  },
                ]}
                onPress={() => setSelectedChild(child)}
              >
                <Text
                  style={[
                    styles.childChipText,
                    {
                      color:
                        selectedChild?.id === child.id ? '#FFFFFF' : colors.textOnDark,
                    },
                  ]}
                >
                  {child.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Child info header */}
        {selectedChild && (
          <View style={[styles.childHeader, { backgroundColor: colors.surface }]}>
            <View style={styles.childHeaderLeft}>
              <Text style={[styles.childName, { color: colors.textOnDark }]}>
                {selectedChild.name}
              </Text>
              <Text style={[styles.childSport, { color: colors.textSecondary }]}>
                {selectedChild.sport} {selectedChild.age ? `- ${selectedChild.age}y` : ''}
              </Text>
            </View>
            {selectedChild.readiness && (
              <View
                style={[
                  styles.readinessBadge,
                  {
                    backgroundColor:
                      selectedChild.readiness === 'GREEN'
                        ? '#2ED57333'
                        : selectedChild.readiness === 'YELLOW'
                        ? '#FFA50233'
                        : '#FF475733',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.readinessText,
                    {
                      color:
                        selectedChild.readiness === 'GREEN'
                          ? '#2ED573'
                          : selectedChild.readiness === 'YELLOW'
                          ? '#FFA502'
                          : '#FF4757',
                    },
                  ]}
                >
                  {selectedChild.readiness}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Month header */}
        <View style={styles.monthHeader}>
          <TouchableOpacity onPress={goToPreviousMonth} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.textOnDark} />
          </TouchableOpacity>
          <Text style={[styles.monthTitle, { color: colors.textOnDark }]}>
            {MONTHS[viewMonth]} {viewYear}
          </Text>
          <TouchableOpacity onPress={goToNextMonth} hitSlop={12}>
            <Ionicons name="chevron-forward" size={24} color={colors.textOnDark} />
          </TouchableOpacity>
        </View>

        {/* Weekday labels */}
        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((wd) => (
            <View key={wd} style={styles.weekdayCell}>
              <Text style={[styles.weekdayLabel, { color: colors.textSecondary }]}>{wd}</Text>
            </View>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={styles.calendarGrid}>
          {calendarDays.map((day, idx) => {
            if (day === null) {
              return <View key={`empty-${idx}`} style={styles.dayCell} />;
            }
            const dateStr = formatDate(viewYear, viewMonth, day);
            const dayEvents = events[dateStr] || [];
            const isToday = dateStr === todayStr;

            return (
              <TouchableOpacity
                key={dateStr}
                style={[
                  styles.dayCell,
                  isToday && { backgroundColor: colors.accent1 + '22', borderRadius: 8 },
                ]}
                onPress={() => handleDayPress(day)}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    { color: isToday ? colors.accent1 : colors.textOnDark },
                    isToday && { fontWeight: '700' },
                  ]}
                >
                  {day}
                </Text>
                <View style={styles.dotRow}>
                  {dayEvents.slice(0, 3).map((type) => (
                    <View
                      key={type}
                      style={[styles.eventDot, { backgroundColor: EVENT_COLORS[type] || colors.accent1 }]}
                    />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Legend */}
        <View style={[styles.legendCard, { backgroundColor: colors.surface }]}>
          {Object.entries(EVENT_COLORS).map(([type, color]) => (
            <View key={type} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 40,
  },

  // Child selector
  childSelector: {
    marginBottom: spacing.md,
  },
  childChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  childChipText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Child header
  childHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  childHeaderLeft: {
    flex: 1,
  },
  childName: {
    fontSize: 18,
    fontWeight: '700',
  },
  childSport: {
    fontSize: 13,
    marginTop: 2,
  },
  readinessBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  readinessText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Month header
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
  },

  // Weekday row
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekdayLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Calendar grid
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '500',
  },
  dotRow: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 3,
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  // Legend
  legendCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
  },
});
