/**
 * TestHistoryTimeline — Vertical timeline showing test history entries.
 *
 * Shows each logged value with date, trend arrows (direction-aware),
 * and a 2px left border timeline visual.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SmartIcon } from '../SmartIcon';
import { Loader } from '../Loader';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';
import type { MyTestResult } from '../../services/api';
import { colors } from '../../theme/colors';

interface TestHistoryTimelineProps {
  history: MyTestResult[];
  unit: string;
  /** Which direction is "improvement"? */
  direction?: 'higher' | 'lower';
  loading?: boolean;
  onClose?: () => void;
}

const MAX_VISIBLE = 10;

export function TestHistoryTimeline({
  history,
  unit,
  direction = 'higher',
  loading = false,
  onClose,
}: TestHistoryTimelineProps) {
  const { colors } = useTheme();
  const [showAll, setShowAll] = React.useState(false);

  if (loading) {
    return (
      <View style={styles.container}>
        <Loader style={{ paddingVertical: 20 }} />
      </View>
    );
  }

  if (history.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.emptyText, { color: colors.muted }]}>
          No history yet — log a test to start tracking.
        </Text>
      </View>
    );
  }

  const visible = showAll ? history : history.slice(0, MAX_VISIBLE);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerText, { color: colors.muted }]}>
          History ({history.length} entries)
        </Text>
        {onClose && (
          <Pressable onPress={onClose} hitSlop={8}>
            <SmartIcon name="close-circle" size={16} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {visible.map((entry, i) => {
        const nextEntry = i < visible.length - 1 ? visible[i + 1] : null;
        const trendInfo = nextEntry && entry.score != null && nextEntry.score != null
          ? getTrend(entry.score, nextEntry.score, direction)
          : null;

        return (
          <View key={entry.id || `${entry.testType}-${entry.date}-${i}`}>
            {/* Entry row */}
            <View style={styles.entryRow}>
              {/* Dot on timeline */}
              <View style={[styles.dot, { backgroundColor: i === 0 ? colors.tomoSage : colors.tomoSage }]} />

              {/* Value + date */}
              <View style={styles.entryContent}>
                <View style={styles.valueDateRow}>
                  <Text style={[styles.value, { color: i === 0 ? colors.tomoSage : colors.tomoCream }]}>
                    {entry.score != null ? entry.score : '—'}
                    <Text style={[styles.unit, { color: colors.muted }]}> {unit}</Text>
                  </Text>
                  {i === 0 && (
                    <View style={[styles.latestBadge, { backgroundColor: colors.tomoSage + '22' }]}>
                      <Text style={[styles.latestBadgeText, { color: colors.tomoSage }]}>Latest</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.date, { color: colors.muted }]}>
                  {formatRelativeDate(entry.date)}
                </Text>
              </View>
            </View>

            {/* Trend arrow between entries */}
            {trendInfo && (
              <View style={styles.trendRow}>
                <Text style={[styles.trendArrow, { color: trendInfo.color }]}>
                  {trendInfo.arrow}
                </Text>
                <Text style={[styles.trendLabel, { color: trendInfo.color }]}>
                  {trendInfo.label}
                </Text>
              </View>
            )}
          </View>
        );
      })}

      {/* Show all link */}
      {!showAll && history.length > MAX_VISIBLE && (
        <Pressable onPress={() => setShowAll(true)} style={styles.showAllBtn}>
          <Text style={[styles.showAllText, { color: colors.tomoSage }]}>
            Show all {history.length} entries →
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function getTrend(
  current: number,
  previous: number,
  direction: 'higher' | 'lower',
): { arrow: string; label: string; color: string } {
  const diff = current - previous;
  const threshold = Math.abs(previous) * 0.01; // 1% tolerance for "stable"

  if (Math.abs(diff) < threshold) {
    return { arrow: '→', label: 'Stable', color: colors.muted };
  }

  const improved =
    direction === 'higher' ? diff > 0 : diff < 0;

  if (improved) {
    return { arrow: direction === 'higher' ? '↑' : '↓', label: `+${Math.abs(diff).toFixed(1)}`, color: colors.accent };
  }
  return { arrow: direction === 'higher' ? '↓' : '↑', label: `-${Math.abs(diff).toFixed(1)}`, color: colors.error };
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;

  // Fallback: show actual date
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.cream03,
    borderWidth: 1,
    borderColor: colors.cream10,
    borderRadius: 14,
    padding: 16,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    paddingVertical: spacing.sm,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  entryContent: {
    flex: 1,
  },
  valueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  value: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
  unit: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  latestBadge: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  latestBadgeText: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  date: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginTop: 1,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 12,
    paddingVertical: 2,
  },
  trendArrow: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
  },
  trendLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
  },
  showAllBtn: {
    paddingVertical: spacing.sm,
  },
  showAllText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
  },
});
