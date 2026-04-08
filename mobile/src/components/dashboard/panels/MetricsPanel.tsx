/**
 * MetricsPanel — Biometric overview slide-up panel.
 *
 * Shows: HRV sparkline, Sleep bars, ACWR zone indicator.
 * Data sourced from boot data recentVitals + snapshot.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Rect, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { SlideUpPanel } from './SlideUpPanel';
import { fontFamily } from '../../../theme/typography';

interface MetricsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: Record<string, any> | null;
  recentVitals: { date: string; sleep_hours: number | null; hrv_morning_ms: number | null; energy: number | null; soreness: number | null; mood: number | null }[];
  signalColor: string;
}

export function MetricsPanel({ isOpen, onClose, snapshot, recentVitals, signalColor }: MetricsPanelProps) {
  const hrvToday = snapshot?.hrv_today_ms ?? null;
  const hrvBaseline = snapshot?.hrv_baseline_ms ?? null;
  const acwr = snapshot?.acwr ?? null;

  // Compute HRV delta
  let hrvDelta = '';
  if (hrvToday && hrvBaseline && hrvBaseline > 0) {
    const pct = Math.round(((hrvToday / hrvBaseline) - 1) * 100);
    hrvDelta = `${pct >= 0 ? '+' : ''}${pct}% vs baseline`;
  }

  // Compute sleep avg
  const sleepValues = (recentVitals ?? []).map(v => v.sleep_hours).filter((v): v is number => v != null);
  const sleepAvg = sleepValues.length > 0 ? (sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length).toFixed(1) : '—';

  // ACWR zone
  let acwrZone = 'Unknown';
  let acwrZoneColor = '#4A5E50';
  if (acwr != null) {
    if (acwr < 0.8) { acwrZone = 'Detraining'; acwrZoneColor = '#5A8A9F'; }
    else if (acwr <= 1.3) { acwrZone = 'Sweet Spot'; acwrZoneColor = '#7a9b76'; }
    else if (acwr <= 1.5) { acwrZone = 'Caution'; acwrZoneColor = '#c49a3c'; }
    else { acwrZone = 'Danger'; acwrZoneColor = '#A05A4A'; }
  }

  return (
    <SlideUpPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Metrics"
      subtitle="7-day biometric overview"
    >
      {/* HRV Section */}
      <View style={styles.sectionCard}>
        <Text style={styles.cardLabel}>HRV</Text>
        <View style={styles.metricRow}>
          <Text style={styles.metricValue}>{hrvToday != null ? `${Math.round(hrvToday)}ms` : '—'}</Text>
          {hrvDelta ? <Text style={[styles.metricDelta, { color: signalColor }]}>{hrvDelta}</Text> : null}
        </View>
        {/* Mini sparkline placeholder — uses recentVitals HRV when available */}
        <View style={styles.sparklineContainer}>
          <HrvSparkline vitals={recentVitals} color={signalColor} />
        </View>
      </View>

      {/* Sleep Section */}
      <View style={styles.sectionCard}>
        <Text style={styles.cardLabel}>SLEEP</Text>
        <View style={styles.metricRow}>
          <Text style={styles.metricValue}>{sleepAvg}h avg</Text>
          <Text style={styles.metricDeltaMuted}>
            {sleepValues.filter(v => v >= 7).length}/{sleepValues.length} nights ≥7h
          </Text>
        </View>
        <SleepBars vitals={recentVitals} />
      </View>

      {/* ACWR Section */}
      <View style={styles.sectionCard}>
        <Text style={styles.cardLabel}>ACWR</Text>
        <View style={styles.metricRow}>
          <Text style={styles.metricValue}>{acwr != null ? acwr.toFixed(2) : '—'}</Text>
          <View style={[styles.zoneBadge, { backgroundColor: acwrZoneColor + '20' }]}>
            <Text style={[styles.zoneText, { color: acwrZoneColor }]}>{acwrZone}</Text>
          </View>
        </View>
        {acwr != null && <AcwrZoneBar acwr={acwr} />}
      </View>
    </SlideUpPanel>
  );
}

// ── HRV Sparkline ──
function HrvSparkline({ vitals, color }: { vitals: any[]; color: string }) {
  const values = (vitals ?? [])
    .map(v => v.hrv_morning_ms)
    .filter((v): v is number => v != null)
    .reverse(); // oldest first

  if (values.length < 2) {
    return <Text style={{ fontFamily: fontFamily.regular, fontSize: 10, color: '#4A5E50' }}>Not enough HRV data yet</Text>;
  }

  const width = 280;
  const height = 28;
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline points={points} stroke={color} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Sleep Bars ──
function SleepBars({ vitals }: { vitals: any[] }) {
  const values = (vitals ?? [])
    .map(v => v.sleep_hours)
    .filter((v): v is number => v != null)
    .reverse()
    .slice(-7);

  if (values.length === 0) {
    return <Text style={{ fontFamily: fontFamily.regular, fontSize: 10, color: '#4A5E50' }}>No sleep data yet</Text>;
  }

  const maxH = 10;
  const barWidth = 24;
  const barGap = 8;
  const chartHeight = 40;

  return (
    <Svg width={(barWidth + barGap) * values.length} height={chartHeight + 12}>
      {values.map((h, i) => {
        const barH = (Math.min(h, maxH) / maxH) * chartHeight;
        const color = h < 7 ? '#c49a3c' : '#7a9b76';
        return (
          <React.Fragment key={i}>
            <Rect
              x={i * (barWidth + barGap)}
              y={chartHeight - barH}
              width={barWidth}
              height={barH}
              rx={4}
              fill={color + '40'}
            />
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ── ACWR Zone Bar ──
function AcwrZoneBar({ acwr }: { acwr: number }) {
  const width = 280;
  const height = 8;
  // Zone ranges: 0-0.8 (detraining), 0.8-1.3 (sweet spot), 1.3-1.5 (caution), 1.5-2.0 (danger)
  const maxAcwr = 2.0;
  const markerX = Math.min(acwr / maxAcwr, 1) * width;

  return (
    <View style={{ marginTop: 8 }}>
      <Svg width={width} height={height + 12}>
        {/* Detraining zone */}
        <Rect x={0} y={2} width={(0.8 / maxAcwr) * width} height={height} rx={4} fill="#5A8A9F30" />
        {/* Sweet spot */}
        <Rect x={(0.8 / maxAcwr) * width} y={2} width={(0.5 / maxAcwr) * width} height={height} rx={0} fill="#7a9b7640" />
        {/* Caution */}
        <Rect x={(1.3 / maxAcwr) * width} y={2} width={(0.2 / maxAcwr) * width} height={height} rx={0} fill="#c49a3c40" />
        {/* Danger */}
        <Rect x={(1.5 / maxAcwr) * width} y={2} width={(0.5 / maxAcwr) * width} height={height} rx={4} fill="#A05A4A40" />
        {/* Marker */}
        <Line x1={markerX} y1={0} x2={markerX} y2={height + 4} stroke="#E5EBE8" strokeWidth={2} strokeLinecap="round" />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ fontFamily: fontFamily.regular, fontSize: 7, color: '#4A5E50' }}>0</Text>
        <Text style={{ fontFamily: fontFamily.regular, fontSize: 7, color: '#4A5E50' }}>0.8</Text>
        <Text style={{ fontFamily: fontFamily.regular, fontSize: 7, color: '#4A5E50' }}>1.3</Text>
        <Text style={{ fontFamily: fontFamily.regular, fontSize: 7, color: '#4A5E50' }}>2.0</Text>
      </View>
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
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 8,
  },
  metricValue: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: '#E5EBE8',
  },
  metricDelta: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
  },
  metricDeltaMuted: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: '#7A8D7E',
  },
  sparklineContainer: {
    marginTop: 4,
  },
  zoneBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  zoneText: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
  },
});
