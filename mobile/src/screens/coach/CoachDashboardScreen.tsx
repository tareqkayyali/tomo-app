/**
 * Coach Dashboard — P4.1 (2026-04-18)
 *
 * Pillar-first landing for the Coach portal. Three tabs:
 *   Training Programs | Metrics | Progress
 * Each is a roster-wide aggregate view. Row tap drills into the
 * existing CoachPlayerDetail screen so the athlete-first workflow
 * still works for 1:1 coaching.
 *
 * Performance target: <500ms for a 50-player roster. Uses the
 * /api/v1/coach/dashboard endpoint which runs ONE query across
 * relationships + users + snapshots per pillar (O(1) round trips in
 * roster size).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius, fontFamily } from '../../theme';
import {
  getCoachDashboard,
  type CoachDashboardPillar,
  type CoachDashboardMetricsRow,
  type CoachDashboardTrainingRow,
  type CoachDashboardProgressRow,
} from '../../services/api';
import type { CoachStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<CoachStackParamList>;

const PILLARS: Array<{ key: CoachDashboardPillar; label: string }> = [
  { key: 'training', label: 'Programs' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'progress', label: 'Progress' },
];

export function CoachDashboardScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const [pillar, setPillar] = useState<CoachDashboardPillar>('metrics');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<
    CoachDashboardMetricsRow[] | CoachDashboardTrainingRow[] | CoachDashboardProgressRow[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: CoachDashboardPillar, isRefresh: boolean) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const res = await getCoachDashboard(p);
      setRows(res.rows as typeof rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(pillar, false);
  }, [pillar, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(pillar, true);
  }, [pillar, load]);

  const drill = useCallback(
    (playerId: string, playerName: string) => {
      navigation.navigate('CoachPlayerDetail', { playerId, playerName });
    },
    [navigation]
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.headerArea}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Dashboard</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Roster-wide signals. Tap a row to open the player.
        </Text>
      </View>

      {/* Underline-style tab switcher */}
      <View style={styles.tabs}>
        {PILLARS.map((p) => {
          const active = p.key === pillar;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPillar(p.key)}
              style={styles.tabButton}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: active ? colors.accent1 : colors.textInactive },
                ]}
              >
                {p.label}
              </Text>
              <View
                style={[
                  styles.tabUnderline,
                  { backgroundColor: active ? colors.accent1 : 'transparent' },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading && !refreshing && (
          <ActivityIndicator size="large" color={colors.accent1} style={{ marginTop: 32 }} />
        )}

        {error && !loading && (
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary }}>{error}</Text>
          </View>
        )}

        {!loading && !error && rows.length === 0 && (
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary }}>
              No linked athletes yet. Invite one from the Players tab.
            </Text>
          </View>
        )}

        {!loading && !error && rows.length > 0 && pillar === 'metrics' && (
          (rows as CoachDashboardMetricsRow[]).map((r) => (
            <Pressable
              key={r.playerId}
              onPress={() => drill(r.playerId, r.name)}
              style={[styles.row, { backgroundColor: colors.cardLight, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${r.name}`}
            >
              <View style={styles.rowMain}>
                <Text style={[styles.rowName, { color: colors.textPrimary }]}>{r.name}</Text>
                <Text style={[styles.rowSport, { color: colors.textSecondary }]}>
                  {r.sport} · {r.ageTier}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <ReadinessBadge rag={r.readinessRag} />
                {r.acwr != null && (
                  <Text style={[styles.rowMetric, { color: colors.textSecondary }]}>
                    ACWR {r.acwr.toFixed(2)}
                  </Text>
                )}
              </View>
            </Pressable>
          ))
        )}

        {!loading && !error && rows.length > 0 && pillar === 'training' && (
          (rows as CoachDashboardTrainingRow[]).map((r) => (
            <Pressable
              key={r.playerId}
              onPress={() => drill(r.playerId, r.name)}
              style={[styles.row, { backgroundColor: colors.cardLight, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${r.name}`}
            >
              <View style={styles.rowMain}>
                <Text style={[styles.rowName, { color: colors.textPrimary }]}>{r.name}</Text>
                <Text style={[styles.rowSport, { color: colors.textSecondary }]}>
                  {r.sport} · {r.ageTier}
                </Text>
              </View>
              <View style={styles.rowRight}>
                {r.pendingApproval > 0 && (
                  <Text style={[styles.rowMetricAlert, { color: '#F4501E' }]}>
                    {r.pendingApproval} pending
                  </Text>
                )}
                <Text style={[styles.rowMetric, { color: colors.textSecondary }]}>
                  {r.published} live · {r.drafts} drafts
                </Text>
              </View>
            </Pressable>
          ))
        )}

        {!loading && !error && rows.length > 0 && pillar === 'progress' && (
          (rows as CoachDashboardProgressRow[]).map((r) => (
            <Pressable
              key={r.playerId}
              onPress={() => drill(r.playerId, r.name)}
              style={[styles.row, { backgroundColor: colors.cardLight, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${r.name}`}
            >
              <View style={styles.rowMain}>
                <Text style={[styles.rowName, { color: colors.textPrimary }]}>{r.name}</Text>
                <Text style={[styles.rowSport, { color: colors.textSecondary }]}>
                  {r.sport} · {r.ageTier}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <MasteryDelta delta={r.masteryDelta30d} />
                <Text style={[styles.rowMetric, { color: colors.textSecondary }]}>
                  Streak {r.currentStreak}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function ReadinessBadge({ rag }: { rag: string | null }) {
  const { colors } = useTheme();
  if (!rag) {
    return (
      <Text style={{ color: colors.textInactive, fontSize: 11 }}>— no check-in</Text>
    );
  }
  const color =
    rag === 'RED' ? '#E74C3C' :
    rag === 'AMBER' ? '#F5A623' :
    rag === 'GREEN' ? '#2ECC71' : colors.textSecondary;
  return (
    <View style={[styles.badge, { backgroundColor: color + '25' }]}>
      <Text style={[styles.badgeText, { color }]}>{rag}</Text>
    </View>
  );
}

function MasteryDelta({ delta }: { delta: number | null }) {
  const { colors } = useTheme();
  if (delta == null) {
    return <Text style={{ color: colors.textInactive, fontSize: 11 }}>— no baseline</Text>;
  }
  const color = delta >= 0 ? '#2ECC71' : '#E74C3C';
  const sign = delta > 0 ? '+' : '';
  return (
    <Text style={[styles.rowMetricStrong, { color }]}>
      {sign}{delta.toFixed(2)} 30d
    </Text>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerArea: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontFamily: fontFamily?.semiBold,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: fontFamily?.medium,
    fontWeight: '600',
  },
  tabUnderline: {
    marginTop: 6,
    width: 36,
    height: 2,
    borderRadius: 1,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.compact,
    borderRadius: borderRadius.md,
    borderWidth: 0.5,
  },
  rowMain: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontFamily: fontFamily?.medium,
    fontWeight: '600',
  },
  rowSport: {
    fontSize: 12,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  rowMetric: {
    fontSize: 11,
  },
  rowMetricAlert: {
    fontSize: 12,
    fontWeight: '700',
  },
  rowMetricStrong: {
    fontSize: 13,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  empty: {
    marginTop: 32,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 0.5,
    alignItems: 'center',
  },
});
