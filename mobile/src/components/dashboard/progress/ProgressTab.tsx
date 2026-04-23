/**
 * ProgressTab — Signal · Orbit.
 *
 * Swaps the old 2-col ring grid for an orbital constellation visualisation.
 * Layout:
 *   • Fixed header (does not scroll): "SIGNAL · ORBIT" eyebrow, "Progress"
 *     title, "Latest vs N-day average" subtitle, 7d/30d/90d segment toggle.
 *   • Scrollable body: the 390×520 <OrbitConstellation/> canvas, followed
 *     by a single-line legend that teaches the chip colour language.
 *
 * Data contract is unchanged — backend still returns resolved metrics via
 * `useProgressMetrics`. The constellation ranks by |delta| and renders the
 * top six; empty/error states sit above the canvas as before.
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
} from '../../../hooks/useProgressMetrics';
import { OrbitConstellation } from './OrbitConstellation';

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
    <View style={styles.root}>
      {/* Fixed header — eyebrow + title + subtitle + period toggle. */}
      <View style={styles.fixedHeader}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
          SIGNAL · ORBIT
        </Text>
        <Text style={[styles.title, { color: colors.textOnDark }]}>
          Progress
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Latest vs {window}-day average
        </Text>

        <View style={[styles.toggle, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          {WINDOWS.map((w) => {
            const active = w === window;
            return (
              <Pressable
                key={w}
                onPress={() => setWindow(w)}
                style={[
                  styles.toggleBtn,
                  active && {
                    backgroundColor: colors.sage15,
                    borderColor: colors.sage30,
                    borderWidth: 1,
                  },
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
      </View>

      {/* Scrollable body — constellation canvas + legend. */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor={colors.accent}
          />
        }
      >
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
          <>
            <OrbitConstellation metrics={metrics} windowDays={window} />

            {/* Legend pill — teaches the chip colour language. */}
            <View
              style={[
                styles.legend,
                { backgroundColor: colors.glass, borderColor: colors.glassBorder },
              ]}
            >
              <View style={styles.legendItem}>
                <View style={styles.legendDot} />
                <Text style={[styles.legendText, { color: colors.textMuted }]}>
                  Dot size = % of best
                </Text>
              </View>
              <View style={styles.legendDivider} />
              <View style={styles.legendItem}>
                <Text style={[styles.legendArrow, { color: '#9AB896' }]}>▲ up</Text>
                <Text style={[styles.legendArrow, { color: '#D9604A' }]}>▼ down</Text>
                <Text style={[styles.legendText, { color: colors.textMuted }]}>
                  vs {window}d
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fixedHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingTop: 6,
    paddingBottom: 120,
    alignItems: 'center',
  },
  eyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    letterSpacing: -0.7,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    marginTop: 2,
    marginBottom: 14,
  },
  toggle: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    gap: 14,
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
    backgroundColor: '#F5F3ED',
  },
  legendDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(245,243,237,0.15)',
  },
  legendText: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  legendArrow: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.2,
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
