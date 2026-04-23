/**
 * ProgressTab — Signal · Orbit.
 *
 * Horizontal swipeable 7d / 30d / 90d viewer built on PagerView, matching
 * the same nested-pager pattern as SignalDashboardScreen's sub-tabs:
 *   • Tap on the pill → pagerRef.setPage() animates the pager.
 *   • Swipe on the pager → onPageSelected settles → window state updates.
 *   • A Reanimated indicator inside the pill tracks the pager's live
 *     scroll position so the active segment slides with the finger.
 *
 * Each of the three pages owns its own `useProgressMetrics(window)` call,
 * so all windows pre-fetch in parallel at mount and swipes feel instant
 * once the data has landed. A refresh also fires every time a page is
 * activated so the athlete sees the loading overlay as visible feedback
 * on each switch — the hook's version counter dedupes in-flight fetches.
 * Pull-to-refresh lives inside each page so it only refreshes the
 * window the athlete is currently looking at.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import PagerView from 'react-native-pager-view';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';
import {
  useProgressMetrics,
  type ProgressWindow,
} from '../../../hooks/useProgressMetrics';
import { OrbitConstellation } from './OrbitConstellation';

const WINDOWS: ProgressWindow[] = [7, 30, 90];
const PILL_PAD = 3;

export function ProgressTab() {
  const [window, setWindow] = useState<ProgressWindow>(7);

  // ── Pager sync ────────────────────────────────────────────────────
  const pagerRef = useRef<PagerView>(null);
  const scrollPosition = useSharedValue(0);
  const pagerIndex = useSharedValue(0);
  const activeIndex = WINDOWS.indexOf(window);

  useEffect(() => {
    // Programmatic setPage when a tab is tapped. Guard against redundant
    // calls during a swipe (which already fires onPageSelected → setWindow
    // → this effect) so we don't double-animate the same transition.
    if (activeIndex >= 0 && pagerIndex.value !== activeIndex) {
      pagerRef.current?.setPage(activeIndex);
    }
  }, [activeIndex, pagerIndex]);

  const onPageSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      const idx = e.nativeEvent.position;
      const w = WINDOWS[idx];
      if (w) setWindow(w);
    },
    [],
  );

  const onPageScroll = useCallback(
    (e: { nativeEvent: { position: number; offset: number } }) => {
      // 0..N-1 continuous value that follows the finger 1:1 — the pill
      // indicator reads from this to slide without waiting for settle.
      scrollPosition.value = e.nativeEvent.position + e.nativeEvent.offset;
      pagerIndex.value = e.nativeEvent.position;
    },
    [pagerIndex, scrollPosition],
  );

  return (
    <View style={styles.root}>
      {/* Fixed header — the period toggle with sliding indicator. Screen
          chrome (title / eyebrow / subtitle) is dropped; the parent tab
          switcher already says "Progress". */}
      <View style={styles.fixedHeader}>
        <WindowPill
          activeIndex={activeIndex}
          scrollPosition={scrollPosition}
          onTap={(idx) => setWindow(WINDOWS[idx])}
        />
      </View>

      {/* Pager body — 3 parallel ProgressPage instances, one per window.
          `offscreenPageLimit={1}` keeps both neighbours warm so any swipe
          lands on already-rendered content. */}
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={activeIndex >= 0 ? activeIndex : 0}
        onPageSelected={onPageSelected}
        onPageScroll={onPageScroll}
        offscreenPageLimit={1}
      >
        {WINDOWS.map((w, idx) => (
          <View key={w} style={styles.page} collapsable={false}>
            <ProgressPage windowDays={w} active={idx === activeIndex} />
          </View>
        ))}
      </PagerView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// WindowPill — 3-segment toggle with a Reanimated sliding indicator
// that tracks the parent PagerView's live scroll position.
// ─────────────────────────────────────────────────────────────────────

interface WindowPillProps {
  activeIndex: number;
  scrollPosition: SharedValue<number>;
  onTap: (idx: number) => void;
}

function WindowPill({ activeIndex, scrollPosition, onTap }: WindowPillProps) {
  const { colors } = useTheme();
  const barWidth = useSharedValue(0);

  const indicatorStyle = useAnimatedStyle(() => {
    const innerWidth = barWidth.value - PILL_PAD * 2;
    const segmentWidth = innerWidth / WINDOWS.length;
    return {
      width: barWidth.value > 0 ? segmentWidth : 0,
      transform: [{ translateX: scrollPosition.value * segmentWidth }],
    };
  });

  const onLayout = (e: LayoutChangeEvent) => {
    barWidth.value = e.nativeEvent.layout.width;
  };

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.toggle,
        { backgroundColor: colors.glass, borderColor: colors.glassBorder },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          {
            backgroundColor: colors.sage15,
            borderColor: colors.sage30,
          },
          indicatorStyle,
        ]}
      />
      {WINDOWS.map((w, idx) => {
        const active = idx === activeIndex;
        return (
          <Pressable
            key={w}
            onPress={() => onTap(idx)}
            style={({ pressed }) => [
              styles.toggleBtn,
              pressed && !active && { opacity: 0.7 },
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
  );
}

// ─────────────────────────────────────────────────────────────────────
// ProgressPage — one page of the pager. Owns its own data hook so every
// window fetches independently and stays cached once loaded.
// ─────────────────────────────────────────────────────────────────────

interface ProgressPageProps {
  windowDays: ProgressWindow;
  /** True when this page is the currently-selected window in the pager. */
  active: boolean;
}

function ProgressPage({ windowDays, active }: ProgressPageProps) {
  const { colors } = useTheme();
  const { metrics, loading, error, refresh } = useProgressMetrics(windowDays);
  const [refreshing, setRefreshing] = useState(false);

  // Fire a refresh on every activation so the athlete sees visible
  // loading feedback when switching windows. The hook's version
  // counter dedupes in-flight fetches, and the existing loading overlay
  // dims the cached constellation until fresh data arrives.
  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);

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
      ) : !metrics || !metrics.some((m) => m.latest != null) ? (
        // Backend returns every enabled metric (so the set is stable
        // across 7d/30d/90d) — so the meaningful empty state is "no
        // metric has any data for this window yet".
        <View style={styles.stateWrap}>
          <Text style={[styles.stateText, { color: colors.textMuted }]}>
            Log a check-in to start tracking your progress.
          </Text>
        </View>
      ) : (
        <>
          {/* Canvas + loading overlay. While a refetch is in flight we
              keep the cached constellation visible but dimmed, and
              overlay a small spinner so the user knows new data is on
              the way. First-load (metrics==null) uses the centered
              ActivityIndicator branch above. */}
          <View style={styles.canvasWrap}>
            <View style={{ opacity: loading ? 0.35 : 1 }}>
              <OrbitConstellation metrics={metrics} windowDays={windowDays} />
            </View>
            {loading ? (
              <View pointerEvents="none" style={styles.loadingOverlay}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                  Loading {windowDays}-day
                </Text>
              </View>
            ) : null}
          </View>

          {/* Legend pill — teaches the chip colour + size language. */}
          <View
            style={[
              styles.legend,
              { backgroundColor: colors.glass, borderColor: colors.glassBorder },
            ]}
          >
            <View style={styles.legendItem}>
              <View style={styles.legendDot} />
              <Text style={[styles.legendText, { color: colors.textMuted }]}>
                Closer = better · Bigger = bigger shift
              </Text>
            </View>
            <View style={styles.legendDivider} />
            <View style={styles.legendItem}>
              <Text style={[styles.legendArrow, { color: '#9AB896' }]}>▲ up</Text>
              <Text style={[styles.legendArrow, { color: '#D9604A' }]}>▼ down</Text>
              <Text style={[styles.legendText, { color: colors.textMuted }]}>
                vs {windowDays}d
              </Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
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
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    // flexGrow:1 lets the content span the full ScrollView viewport so
    // the legend's `marginTop:'auto'` has somewhere to push against.
    flexGrow: 1,
    paddingTop: 6,
    paddingBottom: 32,
    alignItems: 'center',
  },
  toggle: {
    position: 'relative',
    flexDirection: 'row',
    padding: PILL_PAD,
    borderRadius: 12,
    borderWidth: 1,
  },
  indicator: {
    position: 'absolute',
    top: PILL_PAD,
    left: PILL_PAD,
    bottom: PILL_PAD,
    borderRadius: 9,
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
  canvasWrap: {
    position: 'relative',
    alignSelf: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    // Push the legend to the bottom of the scroll viewport so it sits
    // just above the tab bar — the canvas stays at the top and any
    // remaining vertical space collapses between the two.
    marginTop: 'auto',
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
