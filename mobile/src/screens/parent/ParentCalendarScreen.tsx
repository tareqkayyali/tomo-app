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
} from 'react-native';
import { SmartIcon } from '../../components/SmartIcon';
import { PlayerScreen } from '../../components/tomo-ui/playerDesign';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { useTheme } from '../../hooks/useTheme';
import { ragToColor } from '../../hooks/useAthleteSnapshot';
import { getParentChildren, getChildCalendar } from '../../services/api';
import { layout, spacing, borderRadius, fontFamily } from '../../theme';
import type { ParentTabParamList, ParentStackParamList } from '../../navigation/types';
import type { PlayerSummary } from '../../types';

// Legacy screen — now accessed as ParentDailyView stack screen
type Props = {
  navigation: any;
  route: any;
};

// ── Event type colors (runtime, uses theme tokens) ──────────────────

function getEventColors(colors: any): Record<string, string> {
  return {
    training: colors.eventTraining,
    study: colors.eventStudyBlock,
    exam: colors.eventExam,
    match: colors.eventMatch,
  };
}

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
  const eventColors = useMemo(() => getEventColors(colors), [colors]);

  const [children, setChildren] = useState<PlayerSummary[]>([]);
  const [selectedChild, setSelectedChild] = useState<PlayerSummary | null>(null);
  const [events, setEvents] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Fetch children
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await getParentChildren();
        if (!isMounted) return;
        setChildren(res.children);
        if (res.children.length > 0) {
          setSelectedChild(res.children[0]);
        }
      } catch (e) {
        console.warn('[ParentCalendarScreen] fetch children error:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // Fetch calendar when child or viewed month changes
  useEffect(() => {
    if (!selectedChild) return;
    let isMounted = true;
    (async () => {
      try {
        // Fetch the full month range (with some padding for grid display)
        const firstDay = new Date(viewYear, viewMonth, 1);
        const lastDay = new Date(viewYear, viewMonth + 1, 0);
        const startDate = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
        const endDate = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
        const res = await getChildCalendar(selectedChild.id, startDate, endDate);
        if (!isMounted) return;
        const mapped: Record<string, string[]> = {};
        for (const evt of res.events) {
          const date = evt.date as string;
          const type = (evt.type as string) || 'training';
          if (!mapped[date]) mapped[date] = [];
          if (!mapped[date].includes(type)) mapped[date].push(type);
        }
        setEvents(mapped);
      } catch (e) {
        console.warn('[ParentCalendarScreen] fetch calendar error:', e);
        if (isMounted) setEvents({});
      }
    })();
    return () => { isMounted = false; };
  }, [selectedChild, viewYear, viewMonth]);

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
  const hasConfirmedChildren = children.length > 0;

  if (loading) {
    return (
      <PlayerScreen label="CALENDAR" title="Daily view" onBack={() => navigation.goBack()} scroll={false}>
        <ActivityIndicator size="large" color={colors.accent1} style={{ marginTop: 60 }} />
      </PlayerScreen>
    );
  }

  // ── Pending state: no confirmed children yet ──────────────────────
  if (!hasConfirmedChildren) {
    return (
      <PlayerScreen label="CALENDAR" title="Daily view" onBack={() => navigation.goBack()}>
        <View style={styles.scroll}>
          {/* Greyed-out month header */}
          <View style={styles.monthHeader}>
            <View style={{ width: 24 }} />
            <Text style={[styles.monthTitle, { color: colors.textInactive }]}>
              {MONTHS[viewMonth]} {viewYear}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Greyed-out weekday labels */}
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((wd) => (
              <View key={wd} style={styles.weekdayCell}>
                <Text style={[styles.weekdayLabel, { color: colors.textInactive, opacity: 0.4 }]}>{wd}</Text>
              </View>
            ))}
          </View>

          {/* Greyed-out calendar grid */}
          <View style={[styles.calendarGrid, { opacity: 0.25 }]}>
            {calendarDays.map((day, idx) => {
              if (day === null) {
                return <View key={`empty-${idx}`} style={styles.dayCell} />;
              }
              return (
                <View key={`day-${day}`} style={styles.dayCell}>
                  <Text style={[styles.dayNumber, { color: colors.textInactive }]}>{day}</Text>
                </View>
              );
            })}
          </View>

          {/* Pending overlay card */}
          <View style={[styles.pendingCard, { backgroundColor: colors.surface }]}>
            <SmartIcon name="lock-closed-outline" size={40} color={colors.textInactive} />
            <Text style={[styles.pendingTitle, { color: colors.textOnDark }]}>
              Waiting for confirmation
            </Text>
            <Text style={[styles.pendingSubtitle, { color: colors.textSecondary }]}>
              Your child hasn't confirmed the link yet. Once they accept, their schedule will appear here.
            </Text>
          </View>
        </View>
      </PlayerScreen>
    );
  }

  return (
    <PlayerScreen label="CALENDAR" title="Daily view" onBack={() => navigation.goBack()}>
      <View style={styles.scroll}>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ragToColor(child.readinessRag) }} />
                  <Text
                    style={[
                      styles.childChipText,
                      {
                        color:
                          selectedChild?.id === child.id ? colors.textOnDark : colors.textOnDark,
                      },
                    ]}
                  >
                    {child.name}
                  </Text>
                </View>
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
            {selectedChild.readinessRag && (
              <View
                style={[
                  styles.readinessBadge,
                  { backgroundColor: ragToColor(selectedChild.readinessRag) + '33' },
                ]}
              >
                <Text
                  style={[
                    styles.readinessText,
                    { color: ragToColor(selectedChild.readinessRag) },
                  ]}
                >
                  {selectedChild.readinessRag}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Month header */}
        <View style={styles.monthHeader}>
          <TouchableOpacity onPress={goToPreviousMonth} hitSlop={12}>
            <SmartIcon name="chevron-back" size={24} color={colors.textOnDark} />
          </TouchableOpacity>
          <Text style={[styles.monthTitle, { color: colors.textOnDark }]}>
            {MONTHS[viewMonth]} {viewYear}
          </Text>
          <TouchableOpacity onPress={goToNextMonth} hitSlop={12}>
            <SmartIcon name="chevron-forward" size={24} color={colors.textOnDark} />
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
                    isToday && { fontFamily: fontFamily.bold },
                  ]}
                >
                  {day}
                </Text>
                <View style={styles.dotRow}>
                  {dayEvents.slice(0, 3).map((type) => (
                    <View
                      key={type}
                      style={[styles.eventDot, { backgroundColor: eventColors[type] || colors.accent1 }]}
                    />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Legend */}
        <View style={[styles.legendCard, { backgroundColor: colors.surface }]}>
          {Object.entries(eventColors).map(([type, color]) => (
            <View key={type} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </PlayerScreen>
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
    fontFamily: fontFamily.semiBold,
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
    fontFamily: fontFamily.bold,
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
    fontFamily: fontFamily.bold,
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
    fontFamily: fontFamily.bold,
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
    fontFamily: fontFamily.semiBold,
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
    fontFamily: fontFamily.medium,
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

  // Pending state
  pendingCard: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    marginTop: spacing.xxl,
    gap: spacing.md,
  },
  pendingTitle: {
    fontSize: 18,
    fontFamily: fontFamily.bold,
    textAlign: 'center',
  },
  pendingSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
