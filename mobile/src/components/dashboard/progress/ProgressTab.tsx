/**
 * ProgressTab — Signal > Progress sub-tab content.
 *
 * Renders a window toggle (7d / 30d / 90d) and a 2-col grid of
 * `ProgressRingCard`s driven by CMS-configured metrics loaded from
 * GET /api/v1/progress/metrics. Swipe between sub-tabs is owned by the
 * parent SignalDashboardScreen; this component only owns its own window
 * state + refresh control.
 *
 * Design:
 *   • Cards are config-driven. Admins add/remove/rename metrics in the
 *     /admin/progress-metrics CMS; mobile reflects on next refresh.
 *   • Metrics with no data are filtered server-side (hasData:true only),
 *     so empty rings never render.
 *   • Empty state shows the athlete why ("Log a check-in to see your
 *     progress") instead of a blank grid.
 *   • Errors fall back to a pull-to-refresh message rather than crashing.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';
import {
  useProgressMetrics,
  type ProgressWindow,
  type ProgressMetric,
} from '../../../hooks/useProgressMetrics';
import { ProgressRingCard } from './ProgressRingCard';

const WINDOWS: ProgressWindow[] = [7, 30, 90];

export function ProgressTab() {
  const { colors } = useTheme();
  const [window, setWindow] = useState<ProgressWindow>(7);
  const { metrics, loading, error, refresh } = useProgressMetrics(window);
  const [refreshing, setRefreshing] = useState(false);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onPullRefresh}
          tintColor={colors.accent}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textOnDark }]}>Progress</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Latest vs {window}-day average
        </Text>
      </View>

      {/* Window toggle */}
      <View style={[styles.toggle, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        {WINDOWS.map((w) => {
          const active = w === window;
          return (
            <Pressable
              key={w}
              onPress={() => setWindow(w)}
              style={[
                styles.toggleBtn,
                active && { backgroundColor: colors.cream08 ?? 'rgba(245,243,237,0.08)' },
              ]}
            >
              <Text
                style={[
                  styles.toggleLabel,
                  { color: active ? colors.textOnDark : colors.textMuted },
                  active && { fontFamily: fontFamily.medium },
                ]}
              >
                {w}d
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Body */}
      {loading && metrics == null ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : error && (metrics?.length ?? 0) === 0 ? (
        <View style={styles.stateWrap}>
          <Text style={[styles.stateText, { color: colors.textMuted }]}>
            Couldn't load progress. Pull to refresh.
          </Text>
        </View>
      ) : !metrics || metrics.length === 0 ? (
        <View style={styles.stateWrap}>
          <Text style={[styles.stateText, { color: colors.textMuted }]}>
            Log a check-in to start tracking your progress.
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {pairUp(metrics).map((pair, idx) => (
            <View key={idx} style={styles.row}>
              {pair.map((m) => (
                <ProgressRingCard
                  key={m.key}
                  displayName={m.displayName}
                  displayUnit={m.displayUnit}
                  latest={m.latest}
                  avg={m.avg}
                  deltaPct={m.deltaPct}
                  direction={m.direction}
                  valueMin={m.valueMin}
                  valueMax={m.valueMax}
                />
              ))}
              {/* Pad odd rows so the last card doesn't stretch full-width */}
              {pair.length === 1 && <View style={{ flex: 1 }} />}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

/** Chunk a list into pairs for 2-column grid rendering. */
function pairUp<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) {
    out.push(arr.slice(i, i + 2));
  }
  return out;
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    marginTop: 2,
  },
  toggle: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  grid: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  stateText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    textAlign: 'center',
  },
});
