/**
 * ProgressPanel — Performance identity & milestones slide-up panel.
 *
 * Shows: Performance identity ring, this month stats, training load trend,
 * consistency heatmap, benchmark progress.
 * Data sourced from boot data snapshot.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SlideUpPanel } from './SlideUpPanel';
import { DashboardCard } from './DashboardCard';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';
import { BarChart, DotHeatmap } from '../../charts';
import type { DashboardLayoutSection } from '../../../services/api';

interface ProgressPanelProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: Record<string, any> | null;
  dailyLoad?: { date: string; trainingLoadAu: number; sessionCount: number }[];
  benchmarkSummary?: { overallPercentile: number; topStrength: string | null; topGap: string | null } | null;
  signalColor: string;
  freshness?: { label: string; onRefresh: () => void } | null;
  /**
   * CMS-managed sub-section ordering from `bootData.panelLayouts.progress`.
   * When undefined/empty we fall back to the default hardcoded order below.
   * Sections with a component_type we don't know how to render are skipped
   * (admin can add new rows without crashing the client).
   */
  panelLayout?: DashboardLayoutSection[];
}

/** Default rendering order, used when CMS returns nothing. */
const DEFAULT_PROGRESS_ORDER = [
  'progress_cv_ring',
  'progress_this_month',
  'progress_training_load_28d',
  'progress_consistency',
  'progress_benchmark',
];

export function ProgressPanel({ isOpen, onClose, snapshot, dailyLoad, benchmarkSummary, signalColor, freshness, panelLayout }: ProgressPanelProps) {
  const { colors } = useTheme();
  const cvCompleteness = snapshot?.cv_completeness ?? 0;
  const streak = snapshot?.streak_days ?? 0;
  // Wellness check-in values (energy / mood / soreness) are captured on a
  // 1-10 scale. `wellness_7day_avg` is the mean of those values, so it's
  // also 0-10. Multiply by 10 to render as a 0-100 percentage.
  const wellness = Number(snapshot?.wellness_7day_avg);
  const wellnessPct =
    Number.isFinite(wellness) && wellness >= 0 && wellness <= 10
      ? (wellness * 10).toFixed(0)
      : null;

  const renderers: Record<string, () => React.ReactNode> = {
    progress_cv_ring: () => (
      <DashboardCard label="PERFORMANCE IDENTITY">
        {cvCompleteness > 0 ? (
          <View style={styles.ringRow}>
            <ProgressRing percent={cvCompleteness} color={signalColor} trackColor={colors.panelBorderSoft} />
            <View style={styles.ringStats}>
              <Text style={[styles.ringPercent, { color: colors.panelTextPrimary }]}>{cvCompleteness}%</Text>
              <Text style={[styles.ringLabel, { color: colors.panelTextSecondary }]}>Athletic CV</Text>
            </View>
          </View>
        ) : (
          <View>
            <Text style={[styles.emptyStateTitle, { color: colors.panelTextPrimary }]}>
              Your Athletic CV starts at zero.
            </Text>
            <Text style={[styles.emptyStateBody, { color: colors.panelTextSecondary }]}>
              Complete a benchmark test or log a few check-ins to unlock your Performance Identity. Every session builds it up.
            </Text>
          </View>
        )}
      </DashboardCard>
    ),
    progress_this_month: () => (
      <DashboardCard label="THIS MONTH">
        <View style={styles.statsGrid}>
          <StatBlock label="Streak" value={`${streak}d`} color={signalColor} secondaryColor={colors.panelTextSecondary} />
          <StatBlock label="Wellness Avg" value={wellnessPct ?? '—'} color={signalColor} secondaryColor={colors.panelTextSecondary} />
          <StatBlock
            label="ACWR"
            value={snapshot?.acwr != null ? Number(snapshot.acwr).toFixed(2) : '—'}
            color={signalColor}
            secondaryColor={colors.panelTextSecondary}
          />
        </View>
      </DashboardCard>
    ),
    progress_training_load_28d: () => <TrainingLoadTrend dailyLoad={dailyLoad} signalColor={signalColor} />,
    progress_consistency: () => <ConsistencyHeatmap dailyLoad={dailyLoad} signalColor={signalColor} />,
    progress_benchmark: () => <BenchmarkProgress benchmarkSummary={benchmarkSummary} signalColor={signalColor} />,
  };

  const order = panelLayout && panelLayout.length > 0
    ? panelLayout.map((s) => s.component_type)
    : DEFAULT_PROGRESS_ORDER;

  return (
    <SlideUpPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Progress"
      subtitle="Performance identity & milestones"
      freshness={freshness}
    >
      {order.map((type) => {
        const render = renderers[type];
        if (!render) return null;
        return <React.Fragment key={type}>{render()}</React.Fragment>;
      })}
    </SlideUpPanel>
  );
}

function ProgressRing({ percent, color, trackColor }: { percent: number; color: string; trackColor: string }) {
  const size = 64;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(percent, 0), 100);
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

function StatBlock({
  label,
  value,
  color,
  secondaryColor,
}: {
  label: string;
  value: string;
  color: string;
  secondaryColor: string;
}) {
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: secondaryColor }]}>{label}</Text>
    </View>
  );
}

// ── Training Load Trend (28-day bar chart) ──
function TrainingLoadTrend({
  dailyLoad,
  signalColor,
}: {
  dailyLoad?: { date: string; trainingLoadAu: number; sessionCount: number }[];
  signalColor: string;
}) {
  const data = (dailyLoad ?? []).slice(-28);
  if (data.length === 0) return null;

  const values = data.map((d) => d.trainingLoadAu);

  return (
    <DashboardCard label="TRAINING LOAD (28D)">
      <BarChart
        values={values}
        color={`${signalColor}60`}
        width={280}
        height={50}
      />
    </DashboardCard>
  );
}

// ── Consistency Heatmap (28-day dot grid) ──
function ConsistencyHeatmap({
  dailyLoad,
  signalColor,
}: {
  dailyLoad?: { date: string; trainingLoadAu: number; sessionCount: number }[];
  signalColor: string;
}) {
  const { colors } = useTheme();
  const now = new Date();
  const loadMap = new Map((dailyLoad ?? []).map((d) => [d.date, d]));
  const cells: { active: boolean }[] = [];

  for (let i = 27; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const load = loadMap.get(dateStr);
    cells.push({ active: (load?.sessionCount ?? 0) > 0 });
  }

  const activeDays = cells.filter((c) => c.active).length;

  return (
    <DashboardCard label="CONSISTENCY (28D)">
      <DotHeatmap
        cells={cells}
        activeColor={signalColor}
        inactiveColor={colors.panelBorderSoft}
      />
      <Text style={{ fontFamily: fontFamily.regular, fontSize: 9, color: colors.panelTextSecondary, marginTop: 6 }}>
        {activeDays}/28 days active
      </Text>
    </DashboardCard>
  );
}

// ── Benchmark Progress ──
function BenchmarkProgress({
  benchmarkSummary,
  signalColor,
}: {
  benchmarkSummary?: { overallPercentile: number; topStrength: string | null; topGap: string | null } | null;
  signalColor: string;
}) {
  const { colors } = useTheme();
  if (!benchmarkSummary) {
    return (
      <DashboardCard label="BENCHMARK PROGRESS">
        <Text style={[styles.emptyStateTitle, { color: colors.panelTextPrimary }]}>
          No benchmarks logged yet.
        </Text>
        <Text style={[styles.emptyStateBody, { color: colors.panelTextSecondary }]}>
          Log a test from Output → My Metrics (sprint, jump, agility, etc.) to see where you stack up against your position.
        </Text>
      </DashboardCard>
    );
  }

  const pct = benchmarkSummary.overallPercentile;

  return (
    <DashboardCard label="BENCHMARK PROGRESS">
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <Text style={{ fontFamily: fontFamily.bold, fontSize: 20, color: colors.panelTextPrimary }}>{pct}th</Text>
        <Text style={{ fontFamily: fontFamily.regular, fontSize: 10, color: colors.panelTextSecondary }}>
          percentile overall
        </Text>
      </View>
      <View
        style={{
          height: 4,
          backgroundColor: colors.panelBorderSoft,
          borderRadius: 2,
          overflow: 'hidden',
          marginBottom: 10,
        }}
      >
        <View
          style={{
            height: 4,
            width: `${Math.min(pct, 100)}%`,
            backgroundColor: signalColor,
            borderRadius: 2,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {benchmarkSummary.topStrength && (
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: fontFamily.medium,
                fontSize: 8,
                color: colors.readinessGreen,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 2,
              }}
            >
              Top Strength
            </Text>
            <Text style={{ fontFamily: fontFamily.regular, fontSize: 11, color: colors.panelTextPrimary }}>
              {benchmarkSummary.topStrength}
            </Text>
          </View>
        )}
        {benchmarkSummary.topGap && (
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text
              style={{
                fontFamily: fontFamily.medium,
                fontSize: 8,
                color: colors.warning,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 2,
              }}
            >
              Top Gap
            </Text>
            <Text style={{ fontFamily: fontFamily.regular, fontSize: 11, color: colors.panelTextPrimary }}>
              {benchmarkSummary.topGap}
            </Text>
          </View>
        )}
      </View>
    </DashboardCard>
  );
}

const styles = StyleSheet.create({
  ringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  ringStats: {
    flex: 1,
  },
  ringPercent: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
  },
  ringLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBlock: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
  },
  statLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
    marginTop: 2,
  },
  emptyStateTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    marginBottom: 4,
  },
  emptyStateBody: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
  },
});
