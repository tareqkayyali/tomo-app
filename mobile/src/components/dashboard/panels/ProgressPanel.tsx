/**
 * ProgressPanel — Performance identity & milestones slide-up panel.
 *
 * Shows: Performance identity ring, this month stats, milestones.
 * Data sourced from boot data snapshot.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SlideUpPanel } from './SlideUpPanel';
import { fontFamily } from '../../../theme/typography';

interface ProgressPanelProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: Record<string, any> | null;
  signalColor: string;
}

export function ProgressPanel({ isOpen, onClose, snapshot, signalColor }: ProgressPanelProps) {
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
