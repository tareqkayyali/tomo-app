/**
 * MetricsPanel — Biometric overview slide-up panel.
 *
 * Shows: HRV sparkline, Sleep bars, ACWR zone indicator.
 * Data sourced from boot data recentVitals + snapshot.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Rect, Line, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { SlideUpPanel } from './SlideUpPanel';
import { fontFamily } from '../../../theme/typography';

interface MetricsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: Record<string, any> | null;
  recentVitals: { date: string; sleep_hours: number | null; hrv_morning_ms: number | null; energy: number | null; soreness: number | null; mood: number | null; readiness_score?: number | null }[];
  dailyLoad?: { date: string; trainingLoadAu: number; sessionCount: number }[];
  signalColor: string;
}

export function MetricsPanel({ isOpen, onClose, snapshot, recentVitals, dailyLoad, signalColor }: MetricsPanelProps) {
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
          <HrvSparkline vitals={recentVitals} color={signalColor} baseline={hrvBaseline} />
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

      {/* Readiness Trend */}
      <ReadinessTrend vitals={recentVitals} signalColor={signalColor} />

      {/* Energy / Mood / Soreness Mini Trends */}
      <VitalsMiniTrends vitals={recentVitals} />

      {/* Training Load */}
      <TrainingLoadSection dailyLoad={dailyLoad} signalColor={signalColor} />
    </SlideUpPanel>
  );
}

// ── HRV Sparkline with Baseline Overlay ──
function HrvSparkline({ vitals, color, baseline }: { vitals: any[]; color: string; baseline?: number | null }) {
  const values = (vitals ?? [])
    .map(v => v.hrv_morning_ms)
    .filter((v): v is number => v != null)
    .reverse(); // oldest first

  if (values.length < 2) {
    return <Text style={{ fontFamily: fontFamily.regular, fontSize: 10, color: '#4A5E50' }}>Not enough HRV data yet</Text>;
  }

  const width = 280;
  const height = 28;
  const min = Math.min(...values, baseline ?? Infinity) - 5;
  const max = Math.max(...values, baseline ?? -Infinity) + 5;
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const baselineY = baseline != null ? height - ((baseline - min) / range) * height : null;

  return (
    <Svg width={width} height={height}>
      {baselineY != null && (
        <Line
          x1={0} y1={baselineY} x2={width} y2={baselineY}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1}
          strokeDasharray="4,3"
        />
      )}
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

// ── Readiness Trend (7-day sparkline) ──
function ReadinessTrend({ vitals, signalColor }: { vitals: any[]; signalColor: string }) {
  const values = (vitals ?? [])
    .map(v => v.readiness_score)
    .filter((v): v is number => v != null)
    .reverse();

  if (values.length < 2) return null;

  const latestReadiness = values[values.length - 1];
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
    <View style={metricStyles.sectionCard}>
      <Text style={metricStyles.cardLabel}>READINESS TREND</Text>
      <View style={metricStyles.metricRow}>
        <Text style={metricStyles.metricValue}>{Math.round(latestReadiness)}</Text>
        <Text style={[metricStyles.metricDeltaMuted]}>latest score</Text>
      </View>
      <Svg width={width} height={height}>
        <Polyline points={points} stroke={signalColor} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

// ── Energy / Mood / Soreness Mini Trends ──
function VitalsMiniTrends({ vitals }: { vitals: any[] }) {
  const energy = (vitals ?? []).map(v => v.energy).filter((v): v is number => v != null).reverse();
  const mood = (vitals ?? []).map(v => v.mood).filter((v): v is number => v != null).reverse();
  const soreness = (vitals ?? []).map(v => v.soreness).filter((v): v is number => v != null).reverse();

  if (energy.length < 2 && mood.length < 2 && soreness.length < 2) return null;

  return (
    <View style={metricStyles.sectionCard}>
      <Text style={metricStyles.cardLabel}>WELLNESS TRENDS</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <MiniSparkColumn label="Energy" values={energy} color="#7a9b76" />
        <MiniSparkColumn label="Mood" values={mood} color="#5A8A9F" />
        <MiniSparkColumn label="Soreness" values={soreness} color="#c49a3c" />
      </View>
    </View>
  );
}

function MiniSparkColumn({ label, values, color }: { label: string; values: number[]; color: string }) {
  const width = 80;
  const height = 20;

  if (values.length < 2) {
    return (
      <View style={{ alignItems: 'center', flex: 1 }}>
        <Text style={{ fontFamily: fontFamily.medium, fontSize: 8, color: 'rgba(255,255,255,0.18)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{label}</Text>
        <Text style={{ fontFamily: fontFamily.regular, fontSize: 9, color: '#4A5E50' }}>--</Text>
      </View>
    );
  }

  const min = Math.min(...values) - 0.5;
  const max = Math.max(...values) + 0.5;
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontFamily: fontFamily.medium, fontSize: 8, color: 'rgba(255,255,255,0.18)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{label}</Text>
      <Svg width={width} height={height}>
        <Polyline points={points} stroke={color} strokeWidth={1.2} fill="none" strokeLinejoin="round" />
      </Svg>
      <Text style={{ fontFamily: fontFamily.regular, fontSize: 9, color: '#7A8D7E', marginTop: 2 }}>{values[values.length - 1]}/5</Text>
    </View>
  );
}

// ── Training Load Section ──
function TrainingLoadSection({ dailyLoad, signalColor }: { dailyLoad?: { date: string; trainingLoadAu: number; sessionCount: number }[]; signalColor: string }) {
  const data = (dailyLoad ?? []).slice(-7);
  if (data.length === 0) return null;

  const maxLoad = Math.max(...data.map(d => d.trainingLoadAu), 1);
  const barWidth = 24;
  const barGap = 8;
  const chartHeight = 40;

  return (
    <View style={metricStyles.sectionCard}>
      <Text style={metricStyles.cardLabel}>TRAINING LOAD</Text>
      <Text style={metricStyles.metricDeltaMuted}>Last 7 days (AU)</Text>
      <View style={{ marginTop: 8 }}>
        <Svg width={(barWidth + barGap) * data.length} height={chartHeight + 16}>
          {data.map((d, i) => {
            const barH = (d.trainingLoadAu / maxLoad) * chartHeight;
            const dayLabel = new Date(d.date).toLocaleDateString('en', { weekday: 'narrow' });
            return (
              <React.Fragment key={i}>
                <Rect
                  x={i * (barWidth + barGap)}
                  y={chartHeight - barH}
                  width={barWidth}
                  height={barH}
                  rx={4}
                  fill={signalColor + '50'}
                />
              </React.Fragment>
            );
          })}
        </Svg>
        <View style={{ flexDirection: 'row' }}>
          {data.map((d, i) => {
            const dayLabel = new Date(d.date).toLocaleDateString('en', { weekday: 'narrow' });
            return (
              <Text key={i} style={{ width: barWidth + barGap, textAlign: 'center', fontFamily: fontFamily.regular, fontSize: 7, color: '#4A5E50' }}>{dayLabel}</Text>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// Reference to main styles for sub-components
const metricStyles = StyleSheet.create({
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
  metricDeltaMuted: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: '#7A8D7E',
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
