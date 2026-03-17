/**
 * Coach Player Detail Screen
 *
 * 2-tab layout under player header:
 *   Timeline (UnifiedDayView) | Mastery (ProgressScreen)
 *
 * FAB on Timeline tab → RecommendEvent
 * Header button → Submit Test
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { UnifiedDayView } from '../../components/plan/UnifiedDayView';
import { ErrorState } from '../../components';
import { ProgressScreen } from '../ProgressScreen';
import { usePlayerCalendarData } from '../../hooks/usePlayerCalendarData';
import { useTriangleSnapshot } from '../../hooks/useTriangleSnapshot';
import { ragToColor, acwrRiskLabel } from '../../hooks/useAthleteSnapshot';
import { useTheme } from '../../hooks/useTheme';
import { getPlayerReadiness } from '../../services/api';
import { toDateStr } from '../../utils/calendarHelpers';
import { spacing, borderRadius, layout, fontFamily } from '../../theme';
import type { CoachStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<CoachStackParamList, 'CoachPlayerDetail'>;

type ActiveTab = 'timeline' | 'mastery';

// ── Helpers ──────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dotColorForLevel(
  level: string | undefined,
  themeColors: { success: string; warning: string; error: string; textMuted: string },
): string {
  switch (level?.toUpperCase()) {
    case 'GREEN':
      return themeColors.success;
    case 'YELLOW':
      return themeColors.warning;
    case 'RED':
      return themeColors.error;
    default:
      return themeColors.textMuted;
  }
}

interface ReadinessEntry {
  date: string;
  level?: string;
  [key: string]: unknown;
}

// ── Component ────────────────────────────────────────────────────────────

export function CoachPlayerDetailScreen({ route, navigation }: Props) {
  const { playerId, playerName } = route.params;
  const { colors } = useTheme();
  const { snapshot, isLive } = useTriangleSnapshot(playerId);

  const [activeTab, setActiveTab] = useState<ActiveTab>('timeline');
  const [readiness, setReadiness] = useState<ReadinessEntry[]>([]);

  // ── Calendar data for Timeline tab ──────────────────────────────────

  const calendar = usePlayerCalendarData(playerId, 'coach');
  const { events, isLoading, backendError, setSelectedDate, refresh, dayLocks } = calendar;

  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  // ── Readiness dots (always fetch) ───────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const res = await getPlayerReadiness(playerId);
        setReadiness((res.readiness as ReadinessEntry[]).slice(-14));
      } catch {
        // silent
      }
    })();
  }, [playerId]);

  // ── Day navigation ──────────────────────────────────────────────────

  const goToPrevDay = useCallback(() => {
    setSelectedDay((prev) => {
      const next = addDays(prev, -1);
      setSelectedDate(next);
      return next;
    });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [setSelectedDate]);

  const goToNextDay = useCallback(() => {
    setSelectedDay((prev) => {
      const next = addDays(prev, 1);
      setSelectedDate(next);
      return next;
    });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [setSelectedDate]);

  const goToToday = useCallback(() => {
    const today = new Date();
    setSelectedDay(today);
    setSelectedDate(today);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [setSelectedDate]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 1000);
  }, [refresh]);

  // ── Computed values ─────────────────────────────────────────────────

  const todayStr = toDateStr(new Date());
  const selectedDayStr = toDateStr(selectedDay);
  const isToday = selectedDayStr === todayStr;

  const dayEvents = useMemo(
    () =>
      events
        .filter((e) => e.date === selectedDayStr)
        .sort((a, b) => {
          if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
          if (a.startTime) return -1;
          if (b.startTime) return 1;
          return 0;
        }),
    [events, selectedDayStr],
  );

  const dayLabel = useMemo(() => {
    if (isToday) return 'Today';
    const yesterday = addDays(new Date(), -1);
    const tomorrow = addDays(new Date(), 1);
    if (toDateStr(yesterday) === selectedDayStr) return 'Yesterday';
    if (toDateStr(tomorrow) === selectedDayStr) return 'Tomorrow';
    return selectedDay.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }, [selectedDay, selectedDayStr, isToday]);

  // ── Tab switcher ────────────────────────────────────────────────────

  const handleTabPress = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ─── Player Header ─── */}
      <View style={[styles.headerCard, { backgroundColor: colors.surfaceElevated }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.playerName, { color: colors.textOnDark }]}>{playerName}</Text>
            <View style={styles.headerMeta}>
              <Ionicons name="football-outline" size={16} color={colors.accent1} />
              <Text style={[styles.headerMetaText, { color: colors.textMuted }]}>Player</Text>
            </View>
          </View>
          {/* Submit Test button */}
          <Pressable
            onPress={() => navigation.navigate('CoachTestInput', { playerId, playerName })}
            style={({ pressed }) => [
              styles.testButton,
              { backgroundColor: colors.accent1, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="flash-outline" size={16} color={colors.textOnDark} />
            <Text style={[styles.testButtonText, { color: colors.textOnDark }]}>Test</Text>
          </Pressable>
        </View>

        {/* Snapshot summary — live metrics from Data Fabric */}
        {snapshot && (
          <View style={styles.snapshotRow}>
            <View style={styles.snapshotChip}>
              <View style={[styles.ragDot, { backgroundColor: ragToColor(snapshot.readiness_rag) }]} />
              <Text style={[styles.snapshotLabel, { color: colors.textMuted }]}>Readiness</Text>
            </View>
            {snapshot.acwr != null && (
              <View style={styles.snapshotChip}>
                <Text style={[styles.snapshotValue, { color: colors.accent2 }]}>
                  {snapshot.acwr.toFixed(2)}
                </Text>
                <Text style={[styles.snapshotLabel, { color: colors.textMuted }]}>
                  ACWR · {acwrRiskLabel(snapshot.acwr)}
                </Text>
              </View>
            )}
            {snapshot.dual_load_index != null && (
              <View style={styles.snapshotChip}>
                <Text style={[styles.snapshotValue, { color: colors.accent1 }]}>
                  {snapshot.dual_load_index}
                </Text>
                <Text style={[styles.snapshotLabel, { color: colors.textMuted }]}>Load</Text>
              </View>
            )}
            {isLive && (
              <View style={[styles.liveBadge, { backgroundColor: colors.success + '33' }]}>
                <Text style={{ fontSize: 9, color: colors.success, fontFamily: fontFamily.semiBold }}>LIVE</Text>
              </View>
            )}
          </View>
        )}

        {/* Readiness dots */}
        {readiness.length > 0 && (
          <View style={styles.readinessRow}>
            {readiness.map((entry, idx) => {
              const date = new Date(entry.date);
              const dayLabelShort = date.toLocaleDateString('en-US', { weekday: 'narrow' });
              return (
                <View key={idx} style={styles.readinessDotCol}>
                  <View
                    style={[
                      styles.readinessDot,
                      { backgroundColor: dotColorForLevel(entry.level as string | undefined, colors) },
                    ]}
                  />
                  <Text style={[styles.readinessDayLabel, { color: colors.textInactive }]}>
                    {dayLabelShort}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ─── Tab Bar ─── */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => handleTabPress('timeline')}
          style={[
            styles.tab,
            activeTab === 'timeline' && { borderBottomColor: colors.accent1, borderBottomWidth: 2 },
          ]}
        >
          <Ionicons
            name="calendar-outline"
            size={18}
            color={activeTab === 'timeline' ? colors.accent1 : colors.textInactive}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'timeline' ? colors.accent1 : colors.textInactive },
            ]}
          >
            Timeline
          </Text>
        </Pressable>
        <Pressable
          onPress={() => handleTabPress('mastery')}
          style={[
            styles.tab,
            activeTab === 'mastery' && { borderBottomColor: colors.accent1, borderBottomWidth: 2 },
          ]}
        >
          <Ionicons
            name="trending-up-outline"
            size={18}
            color={activeTab === 'mastery' ? colors.accent1 : colors.textInactive}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'mastery' ? colors.accent1 : colors.textInactive },
            ]}
          >
            Mastery
          </Text>
        </Pressable>
      </View>

      {/* ─── Tab Content ─── */}
      <View style={styles.tabContent}>
        {activeTab === 'timeline' ? (
          <>
            {backendError && (
              <ErrorState
                message="Could not load data. Pull to retry."
                onRetry={refresh}
                compact
              />
            )}
            <UnifiedDayView
              role="coach"
              isOwner={false}
              targetUserName={playerName}
              events={dayEvents}
              selectedDay={selectedDay}
              dayLabel={dayLabel}
              isToday={isToday}
              isLoading={isLoading}
              isLocked={!!dayLocks[selectedDayStr]}
              refreshing={refreshing}
              onRefresh={onRefresh}
              onPrevDay={goToPrevDay}
              onNextDay={goToNextDay}
              onToday={goToToday}
            />
          </>
        ) : (
          <ProgressScreen
            navigation={navigation as any}
            targetPlayerId={playerId}
            targetPlayerName={playerName}
          />
        )}
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: layout.screenMargin,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerName: {
    fontSize: 22,
    fontFamily: fontFamily.bold,
    marginBottom: 2,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerMetaText: {
    fontSize: 14,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  testButtonText: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
  },
  snapshotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  snapshotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  snapshotValue: {
    fontSize: 14,
    fontFamily: fontFamily.bold,
  },
  snapshotLabel: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
  },
  ragDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  readinessRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: 2,
  },
  readinessDotCol: {
    alignItems: 'center',
    flex: 1,
  },
  readinessDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 2,
  },
  readinessDayLabel: {
    fontSize: 9,
    fontFamily: fontFamily.medium,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    marginHorizontal: layout.screenMargin,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
  },
  tabContent: {
    flex: 1,
  },
});
