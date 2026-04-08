/**
 * ProgressPanel — Performance identity & milestones slide-up panel.
 *
 * Shows: Performance identity ring, this month stats, milestones.
 * Data sourced from boot data snapshot.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { SlideUpPanel } from './SlideUpPanel';
import { fontFamily } from '../../../theme/typography';

interface ProgressPanelProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: Record<string, any> | null;
  dailyLoad?: { date: string; trainingLoadAu: number; sessionCount: number }[];
  benchmarkSummary?: { overallPercentile: number; topStrength: string | null; topGap: string | null } | null;
  signalColor: string;
}

export function ProgressPanel({ isOpen, onClose, snapshot, dailyLoad, benchmarkSummary, signalColor }: ProgressPanelProps) {
  const cvCompleteness = snapshot?.cv_completeness ?? 0;
  const streak = snapshot?.streak_days ?? 0;

  return (
    <SlideUpPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Progress"
      subtitle="Performance identity & milestones"
    >
      {/* Performance Identity Ring */}
      <View style={styles.sectionCard}>
        <Text style={styles.cardLabel}>PERFORMANCE IDENTITY</Text>
        <View style={styles.ringRow}>
          <ProgressRing percent={cvCompleteness} color={signalColor} />
          <View style={styles.ringStats}>
            <Text style={styles.ringPercent}>{cvCompleteness}%</Text>
            <Text style={styles.ringLabel}>Athletic CV</Text>
          </View>
        </View>
      </View>

      {/* This Month Stats */}
      <View style={styles.sectionCard}>
        <Text style={styles.cardLabel}>THIS MONTH</Text>
        <View style={styles.statsGrid}>
          <StatBlock label="Streak" value={`${streak}d`} color={signalColor} />
          <StatBlock label="Readiness Avg" value={snapshot?.wellness_7day_avg != null ? `${(Number(snapshot.wellness_7day_avg) * 20).toFixed(0)}` : '—'} color={signalColor} />
          <StatBlock label="ACWR" value={snapshot?.acwr != null ? Number(snapshot.acwr).toFixed(2) : '—'} color={signalColor} />
        </View>
      </View>

      {/* Training Load Trend (28-day) */}
      <TrainingLoadTrend dailyLoad={dailyLoad} signalColor={signalColor} />

      {/* Consistency Heatmap */}
      <ConsistencyHeatmap dailyLoad={dailyLoad} signalColor={signalColor} />

      {/* Benchmark Progress */}
      <BenchmarkProgress benchmarkSummary={benchmarkSummary} signalColor={signalColor} />

      {/* Milestones placeholder */}
      <View style={styles.sectionCard}>
        <Text style={styles.cardLabel}>MILESTONES</Text>
        <Text style={styles.placeholder}>
          Milestone tracking will appear here as you complete training goals and hit benchmarks.
        </Text>
      </View>
    </SlideUpPanel>
  );
}

function ProgressRing({ percent, color }: { percent: number; color: string }) {
  const size = 64;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(percent, 0), 100);
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <Svg width={size} height={size}>
      {/* Background track */}
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Progress arc */}
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

function StatBlock({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Training Load Trend (28-day bar chart) ──
function TrainingLoadTrend({ dailyLoad, signalColor }: { dailyLoad?: { date: string; trainingLoadAu: number; sessionCount: number }[]; signalColor: string }) {
  const data = (dailyLoad ?? []).slice(-28);
  if (data.length === 0) return null;

  const maxLoad = Math.max(...data.map(d => d.trainingLoadAu), 1);
  const chartWidth = 280;
  const chartHeight = 50;
  const barWidth = Math.max(2, (chartWidth / data.length) - 1);

  return (
    <View style={progressStyles.sectionCard}>
      <Text style={progressStyles.cardLabel}>TRAINING LOAD (28D)</Text>
      <Svg width={chartWidth} height={chartHeight}>
        {data.map((d, i) => {
          const barH = (d.trainingLoadAu / maxLoad) * chartHeight;
          const x = i * (chartWidth / data.length);
          return (
            <Rect
              key={i}
              x={x}
              y={chartHeight - barH}
              width={barWidth}
              height={barH}
              rx={1}
              fill={signalColor + '60'}
            />
          );
        })}
      </Svg>
    </View>
  );
}

// ── Consistency Heatmap (28-day dot grid) ──
function ConsistencyHeatmap({ dailyLoad, signalColor }: { dailyLoad?: { date: string; trainingLoadAu: number; sessionCount: number }[]; signalColor: string }) {
  // Build 28-day grid: training days = green, rest = muted
  const now = new Date();
  const days: { date: string; trained: boolean }[] = [];
  const loadMap = new Map((dailyLoad ?? []).map(d => [d.date, d]));

  for (let i = 27; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const load = loadMap.get(dateStr);
    days.push({ date: dateStr, trained: (load?.sessionCount ?? 0) > 0 });
  }

  const dotSize = 8;
  const gap = 2;
  const cols = 7;

  return (
    <View style={progressStyles.sectionCard}>
      <Text style={progressStyles.cardLabel}>CONSISTENCY (28D)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {days.map((day, i) => (
          <View
            key={i}
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: day.trained ? signalColor : 'rgba(255,255,255,0.06)',
              margin: 1,
            }}
          />
        ))}
      </View>
      <Text style={{ fontFamily: fontFamily.regular, fontSize: 9, color: '#7A8D7E', marginTop: 6 }}>
        {days.filter(d => d.trained).length}/28 days active
      </Text>
    </View>
  );
}

// ── Benchmark Progress ──
function BenchmarkProgress({ benchmarkSummary, signalColor }: { benchmarkSummary?: { overallPercentile: number; topStrength: string | null; topGap: string | null } | null; signalColor: string }) {
  if (!benchmarkSummary) return null;

  const pct = benchmarkSummary.overallPercentile;

  return (
    <View style={progressStyles.sectionCard}>
      <Text style={progressStyles.cardLabel}>BENCHMARK PROGRESS</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <Text style={{ fontFamily: fontFamily.bold, fontSize: 20, color: '#E5EBE8' }}>{pct}th</Text>
        <Text style={{ fontFamily: fontFamily.regular, fontSize: 10, color: '#7A8D7E' }}>percentile overall</Text>
      </View>
      {/* Percentile bar */}
      <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
        <View style={{ height: 4, width: `${Math.min(pct, 100)}%`, backgroundColor: signalColor, borderRadius: 2 }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {benchmarkSummary.topStrength && (
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fontFamily.medium, fontSize: 8, color: '#7a9b76', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>Top Strength</Text>
            <Text style={{ fontFamily: fontFamily.regular, fontSize: 11, color: '#E5EBE8' }}>{benchmarkSummary.topStrength}</Text>
          </View>
        )}
        {benchmarkSummary.topGap && (
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: fontFamily.medium, fontSize: 8, color: '#c49a3c', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>Top Gap</Text>
            <Text style={{ fontFamily: fontFamily.regular, fontSize: 11, color: '#E5EBE8' }}>{benchmarkSummary.topGap}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  sectionCard: {
    backgroundColor: '#1B1F2E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 10,
  },
  cardLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.18)',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
});

const styles = StyleSheet.create({
  sectionCard: {
    backgroundColor: '#1B1F2E',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 10,
  },
  cardLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.18)',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
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
    color: '#E5EBE8',
  },
  ringLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: '#7A8D7E',
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
    color: '#7A8D7E',
    marginTop: 2,
  },
  placeholder: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: '#4A5E50',
    lineHeight: 18,
  },
});
