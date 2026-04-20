/**
 * History Screen
 * Scrollable list of past check-ins with mini calendar
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SmartIcon } from '../components/SmartIcon';
import { Card, ReadinessBadge, SkeletonCard, ErrorState, EmptyState } from '../components';
import { colors, spacing, typography, borderRadius, fontFamily } from '../theme';
import { getCheckins } from '../services/api';
import type { Checkin } from '../types';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';

export function HistoryScreen() {
  const navigation = useNavigation();
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(false);
    try {
      const response = await getCheckins(30);
      setCheckins(response.checkins || []);
    } catch (err) {
      setError(true);
      setCheckins([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Group by week
  const grouped = groupByWeek(checkins);

  // Mini calendar: last 30 days
  const last30Days = getLast30Days(checkins);

  return (
    <PlayerScreen
      label="HISTORY"
      title="History"
      onBack={() => navigation.goBack()}
      contentStyle={styles.scrollContent}
      scrollProps={{
        refreshControl: <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />,
      }}
    >
        {/* Mini Calendar */}
        {!isLoading && !error && checkins.length > 0 && (
          <Card style={styles.calendarCard}>
            <Text style={styles.calendarTitle}>Last 30 Days</Text>
            <View style={styles.calendarRow}>
              {last30Days.map((day, i) => (
                <View
                  key={i}
                  style={[
                    styles.calendarDot,
                    day.level === 'GREEN' && styles.dotGreen,
                    day.level === 'YELLOW' && styles.dotYellow,
                    day.level === 'RED' && styles.dotRed,
                    !day.level && styles.dotEmpty,
                  ]}
                />
              ))}
            </View>
          </Card>
        )}

        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <ErrorState
            message="Could not load check-in history."
            onRetry={loadData}
          />
        ) : checkins.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No check-ins yet"
            subtitle="Start your first check-in today. It only takes 15 seconds."
          />
        ) : (
          Object.entries(grouped).map(([weekLabel, weekCheckins]) => (
            <View key={weekLabel}>
              <Text style={styles.weekLabel}>{weekLabel}</Text>
              {weekCheckins.map((checkin) => {
                const isExpanded = expandedId === checkin.id;
                return (
                  <Card
                    key={checkin.id}
                    style={styles.checkinCard}
                    onPress={() => setExpandedId(isExpanded ? null : checkin.id)}
                  >
                    <View style={styles.checkinRow}>
                      <View style={styles.checkinDate}>
                        <Text style={styles.checkinDay}>
                          {formatDayShort(checkin.date || checkin.createdAt)}
                        </Text>
                        <Text style={styles.checkinDayName}>
                          {formatDayName(checkin.date || checkin.createdAt)}
                        </Text>
                      </View>
                      {checkin.readinessLevel && (
                        <ReadinessBadge level={checkin.readinessLevel} size="small" />
                      )}
                      <View style={styles.checkinSummary}>
                        <View style={styles.checkinMini}>
                          <SmartIcon name="sunny-outline" size={14} color={colors.textMuted} />
                          <Text style={styles.checkinMiniText}>{checkin.energy}</Text>
                        </View>
                        <View style={styles.checkinMini}>
                          <SmartIcon name="moon-outline" size={14} color={colors.textMuted} />
                          <Text style={styles.checkinMiniText}>{checkin.sleepHours}h</Text>
                        </View>
                      </View>
                      <SmartIcon
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={colors.textMuted}
                      />
                    </View>

                    {isExpanded && (
                      <View style={styles.expandedContent}>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Energy</Text>
                          <Text style={styles.detailValue}>{checkin.energy}/10</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Soreness</Text>
                          <Text style={styles.detailValue}>{checkin.soreness}/10</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Sleep</Text>
                          <Text style={styles.detailValue}>{checkin.sleepHours} hours</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Pain</Text>
                          <Text style={[styles.detailValue, checkin.painFlag && styles.detailPain]}>
                            {checkin.painFlag ? `Yes${checkin.painLocation ? ` - ${checkin.painLocation}` : ''}` : 'No'}
                          </Text>
                        </View>
                        {checkin.mood != null && (
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Mood</Text>
                            <Text style={styles.detailValue}>{checkin.mood}/10</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </Card>
                );
              })}
            </View>
          ))
        )}
    </PlayerScreen>
  );
}

function groupByWeek(checkins: Checkin[]): Record<string, Checkin[]> {
  const groups: Record<string, Checkin[]> = {};
  for (const c of checkins) {
    const date = new Date(c.date || c.createdAt);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const label = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    if (!groups[label]) groups[label] = [];
    groups[label].push(c);
  }
  return groups;
}

function getLast30Days(checkins: Checkin[]): Array<{ date: string; level: string | null }> {
  const days: Array<{ date: string; level: string | null }> = [];
  const checkinMap = new Map<string, string>();
  for (const c of checkins) {
    const d = (c.date || c.createdAt).substring(0, 10);
    if (c.readinessLevel) checkinMap.set(d, c.readinessLevel);
  }
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().substring(0, 10);
    days.push({ date: key, level: checkinMap.get(key) || null });
  }
  return days;
}

function formatDayShort(dateStr: string): string {
  return new Date(dateStr).getDate().toString();
}

function formatDayName(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  calendarCard: {
    marginBottom: spacing.md,
  },
  calendarTitle: {
    ...typography.label,
    color: colors.textInactive,
    marginBottom: spacing.sm,
  },
  calendarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  calendarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotGreen: {
    backgroundColor: colors.readinessGreen,
  },
  dotYellow: {
    backgroundColor: colors.readinessYellow,
  },
  dotRed: {
    backgroundColor: colors.readinessRed,
  },
  dotEmpty: {
    backgroundColor: colors.border,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  weekLabel: {
    ...typography.label,
    color: colors.textInactive,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  checkinCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  checkinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkinDate: {
    alignItems: 'center',
    width: 36,
  },
  checkinDay: {
    ...typography.bodyMedium,
    color: colors.textOnLight,
  },
  checkinDayName: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  checkinSummary: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'flex-end',
  },
  checkinMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  checkinMiniText: {
    ...typography.caption,
    color: colors.textInactive,
  },
  expandedContent: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  detailLabel: {
    ...typography.bodySmall,
    color: colors.textInactive,
  },
  detailValue: {
    ...typography.bodySmall,
    color: colors.textOnLight,
    fontFamily: fontFamily.medium,
  },
  detailPain: {
    color: colors.readinessRed,
  },
});
