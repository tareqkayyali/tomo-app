/**
 * MetricsPanel — Biometric overview slide-up panel.
 *
 * Shows: HRV sparkline (with baseline), sleep bars, ACWR zone indicator,
 * readiness trend, wellness mini-trends (energy / mood / soreness),
 * 7-day training load.
 *
 * Data sourced from boot data recentVitals + snapshot.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SlideUpPanel } from './SlideUpPanel';
import { DashboardCard } from './DashboardCard';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';
import { Sparkline, BarChart, ZoneBar, type Zone } from '../../charts';
import type { DashboardLayoutSection } from '../../../services/api';

interface MetricsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: Record<string, any> | null;
  recentVitals: {
    date: string;
    sleep_hours: number | null;
    hrv_morning_ms: number | null;
    energy: number | null;
    soreness: number | null;
    mood: number | null;
    readiness_score?: number | null;
  }[];
  dailyLoad?: { date: string; trainingLoadAu: number; sessionCount: number }[];
  signalColor: string;
  freshness?: { label: string; onRefresh: () => void } | null;
  /** Whether a wearable is connected. When false, the sync row invites the athlete to connect one. */
  isWearableConnected?: boolean;
  /** Invoked when the athlete taps the sync row. Expected to call the Whoop/Terra sync + refreshBoot. */
  onSyncVitals?: () => Promise<void>;
  /** Called when the athlete taps the sync row without a wearable connected (deep-links to Settings). */
  onOpenSettings?: () => void;
  /**
   * CMS-managed sub-section ordering from `bootData.panelLayouts.metrics`.
   * When undefined/empty we fall back to the default hardcoded order below.
   */
  panelLayout?: DashboardLayoutSection[];
}

/** Default rendering order, used when CMS returns nothing. */
const DEFAULT_METRICS_ORDER = [
  'metrics_sync_row',
  'metrics_hrv',
  'metrics_sleep',
  'metrics_acwr',
  'metrics_readiness_trend',
  'metrics_wellness_trends',
  'metrics_training_load',
];

export function MetricsPanel({
  isOpen,
  onClose,
  snapshot,
  recentVitals,
  dailyLoad,
  signalColor,
  freshness,
  isWearableConnected,
  onSyncVitals,
  onOpenSettings,
  panelLayout,
}: MetricsPanelProps) {
  const { colors } = useTheme();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncPress = async () => {
    if (!onSyncVitals || isSyncing) return;
    setIsSyncing(true);
    try {
      await onSyncVitals();
    } finally {
      setIsSyncing(false);
    }
  };

  const hrvToday = snapshot?.hrv_today_ms ?? null;
  const hrvBaseline = snapshot?.hrv_baseline_ms ?? null;
  const acwr = snapshot?.acwr ?? null;

  let hrvDelta = '';
  if (hrvToday && hrvBaseline && hrvBaseline > 0) {
    const pct = Math.round(((hrvToday / hrvBaseline) - 1) * 100);
    hrvDelta = `${pct >= 0 ? '+' : ''}${pct}% vs baseline`;
  }

  const sleepValues = (recentVitals ?? []).map((v) => v.sleep_hours).filter((v): v is number => v != null);
  const sleepAvg =
    sleepValues.length > 0
      ? (sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length).toFixed(1)
      : '—';

  // ACWR zone
  let acwrZone = 'Unknown';
  let acwrZoneColor = colors.panelTextMuted;
  if (acwr != null) {
    if (acwr < 0.8) {
      acwrZone = 'Detraining';
      acwrZoneColor = '#5A8A9F';
    } else if (acwr <= 1.3) {
      acwrZone = 'Sweet Spot';
      acwrZoneColor = colors.readinessGreen;
    } else if (acwr <= 1.5) {
      acwrZone = 'Caution';
      acwrZoneColor = colors.warning;
    } else {
      acwrZone = 'Danger';
      acwrZoneColor = colors.error;
    }
  }

  const renderers: Record<string, () => React.ReactNode> = {
    metrics_sync_row: () =>
      isWearableConnected ? (
        <TouchableOpacity
          onPress={handleSyncPress}
          disabled={isSyncing || !onSyncVitals}
          activeOpacity={0.7}
          style={[styles.syncRow, { borderColor: `${signalColor}40` }]}
        >
          <Text style={[styles.syncLabel, { color: signalColor }]}>
            {isSyncing ? 'Syncing vitals…' : 'Sync vitals now'}
          </Text>
          {isSyncing && <ActivityIndicator size="small" color={signalColor} />}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={onOpenSettings}
          disabled={!onOpenSettings}
          activeOpacity={0.7}
          style={[styles.syncRow, { borderColor: colors.panelBorderSoft }]}
        >
          <Text style={[styles.syncLabelMuted, { color: colors.panelTextSecondary }]}>
            Connect a wearable to auto-sync HRV & sleep
          </Text>
        </TouchableOpacity>
      ),
    metrics_hrv: () => (
      <DashboardCard label="HRV">
        <View style={styles.metricRow}>
          <Text style={[styles.metricValue, { color: colors.panelTextPrimary }]}>
            {hrvToday != null ? `${Math.round(hrvToday)}ms` : '—'}
          </Text>
          {hrvDelta ? <Text style={[styles.metricDelta, { color: signalColor }]}>{hrvDelta}</Text> : null}
        </View>
        <HrvSparkline
          vitals={recentVitals}
          color={signalColor}
          baseline={hrvBaseline}
          hideEmptyState={hrvToday != null}
        />
      </DashboardCard>
    ),
    metrics_sleep: () => (
      <DashboardCard label="SLEEP">
        <View style={styles.metricRow}>
          <Text style={[styles.metricValue, { color: colors.panelTextPrimary }]}>{sleepAvg}h avg</Text>
          <Text style={[styles.metricDeltaMuted, { color: colors.panelTextSecondary }]}>
            {sleepValues.filter((v) => v >= 7).length}/{sleepValues.length} nights ≥7h
          </Text>
        </View>
        <SleepBars vitals={recentVitals} />
      </DashboardCard>
    ),
    metrics_acwr: () => (
      <DashboardCard label="ACWR">
        <View style={styles.metricRow}>
          <Text style={[styles.metricValue, { color: colors.panelTextPrimary }]}>
            {acwr != null ? acwr.toFixed(2) : '—'}
          </Text>
          <View style={[styles.zoneBadge, { backgroundColor: acwrZoneColor + '20' }]}>
            <Text style={[styles.zoneText, { color: acwrZoneColor }]}>{acwrZone}</Text>
          </View>
        </View>
        {acwr != null && (
          <View style={{ marginTop: 8 }}>
            <ZoneBar
              value={acwr}
              max={2.0}
              width={280}
              zones={ACWR_ZONES}
              markerColor={colors.panelTextPrimary}
              tickLabels={[0, 0.8, 1.3, 2.0]}
              tickColor={colors.panelTextMuted}
            />
          </View>
        )}
      </DashboardCard>
    ),
    metrics_readiness_trend: () => <ReadinessTrend vitals={recentVitals} signalColor={signalColor} />,
    metrics_wellness_trends: () => <VitalsMiniTrends vitals={recentVitals} />,
    metrics_training_load: () => <TrainingLoadSection dailyLoad={dailyLoad} signalColor={signalColor} />,
  };

  const order = panelLayout && panelLayout.length > 0
    ? panelLayout.map((s) => s.component_type)
    : DEFAULT_METRICS_ORDER;

  return (
    <SlideUpPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Metrics"
      subtitle="7-day biometric overview"
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

// ACWR zone definitions. Colours are deliberate semantic choices (detraining
// blue, sweet-spot sage, caution amber, danger red) — not theme tokens.
const ACWR_ZONES: Zone[] = [
  { from: 0, to: 0.8, color: '#5A8A9F', tintHex: '30', roundLeft: true },
  { from: 0.8, to: 1.3, color: '#7a9b76' },
  { from: 1.3, to: 1.5, color: '#c49a3c' },
  { from: 1.5, to: 2.0, color: '#A05A4A', roundRight: true },
];

// ── HRV Sparkline with Baseline Overlay ──
function HrvSparkline({
  vitals,
  color,
  baseline,
  hideEmptyState,
}: {
  vitals: any[];
  color: string;
  baseline?: number | null;
  /**
   * When the HRV card already shows a live value above (from
   * `snapshot.hrv_today_ms`), we don't want to also render "Not enough HRV
   * data yet" below it — that combination misleads the athlete into thinking
   * their HRV is both present and absent. Caller sets this true when the
   * live value is available.
   */
  hideEmptyState?: boolean;
}) {
  const { colors } = useTheme();
  const values = (vitals ?? [])
    .map((v) => v.hrv_morning_ms)
    .filter((v): v is number => v != null)
    .reverse(); // oldest first

  if (values.length < 2) {
    if (hideEmptyState) return null;
    return (
      <Text style={{ fontFamily: fontFamily.regular, fontSize: 10, color: colors.panelTextMuted }}>
        Not enough HRV data yet
      </Text>
    );
  }

  return (
    <View style={{ marginTop: 4 }}>
      <Sparkline values={values} color={color} width={280} height={28} baseline={baseline ?? null} />
    </View>
  );
}

// ── Sleep Bars ──
function SleepBars({ vitals }: { vitals: any[] }) {
  const { colors } = useTheme();
  const values = (vitals ?? [])
    .map((v) => v.sleep_hours)
    .filter((v): v is number => v != null)
    .reverse()
    .slice(-7);

  if (values.length === 0) {
    return (
      <Text style={{ fontFamily: fontFamily.regular, fontSize: 10, color: colors.panelTextMuted }}>
        No sleep data yet
      </Text>
    );
  }

  return (
    <BarChart
      values={values}
      color="#7a9b76"
      width={(24 + 8) * values.length}
      height={40}
      barWidth={24}
      barGap={8}
      rx={4}
      colorFn={(v) => (v < 7 ? '#c49a3c' : '#7a9b76')}
      maxOverride={10}
    />
  );
}

// ── Readiness Trend (7-day sparkline) ──
function ReadinessTrend({ vitals, signalColor }: { vitals: any[]; signalColor: string }) {
  const { colors } = useTheme();
  const values = (vitals ?? [])
    .map((v) => v.readiness_score)
    .filter((v): v is number => v != null)
    .reverse();

  if (values.length < 2) return null;

  const latestReadiness = values[values.length - 1];

  return (
    <DashboardCard label="READINESS TREND">
      <View style={styles.metricRow}>
        <Text style={[styles.metricValue, { color: colors.panelTextPrimary }]}>
          {Math.round(latestReadiness)}
        </Text>
        <Text style={[styles.metricDeltaMuted, { color: colors.panelTextSecondary }]}>
          latest score
        </Text>
      </View>
      <Sparkline values={values} color={signalColor} width={280} height={28} />
    </DashboardCard>
  );
}

// ── Energy / Mood / Soreness Mini Trends ──
function VitalsMiniTrends({ vitals }: { vitals: any[] }) {
  const energy = (vitals ?? []).map((v) => v.energy).filter((v): v is number => v != null).reverse();
  const mood = (vitals ?? []).map((v) => v.mood).filter((v): v is number => v != null).reverse();
  const soreness = (vitals ?? []).map((v) => v.soreness).filter((v): v is number => v != null).reverse();

  if (energy.length < 2 && mood.length < 2 && soreness.length < 2) return null;

  return (
    <DashboardCard label="WELLNESS TRENDS">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <MiniSparkColumn label="Energy" values={energy} color="#7a9b76" />
        <MiniSparkColumn label="Mood" values={mood} color="#5A8A9F" />
        <MiniSparkColumn label="Soreness" values={soreness} color="#c49a3c" />
      </View>
    </DashboardCard>
  );
}

function MiniSparkColumn({ label, values, color }: { label: string; values: number[]; color: string }) {
  const { colors } = useTheme();
  const width = 80;
  const height = 20;

  if (values.length < 2) {
    return (
      <View style={{ alignItems: 'center', flex: 1 }}>
        <Text
          style={{
            fontFamily: fontFamily.medium,
            fontSize: 8,
            color: colors.panelLabel,
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          {label}
        </Text>
        <Text style={{ fontFamily: fontFamily.regular, fontSize: 9, color: colors.panelTextMuted }}>
          --
        </Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text
        style={{
          fontFamily: fontFamily.medium,
          fontSize: 8,
          color: colors.panelLabel,
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </Text>
      <Sparkline values={values} color={color} width={width} height={height} strokeWidth={1.2} padY={0.5} />
      <Text style={{ fontFamily: fontFamily.regular, fontSize: 9, color: colors.panelTextSecondary, marginTop: 2 }}>
        {Math.min(Math.max(values[values.length - 1], 0), 10)}/10
      </Text>
    </View>
  );
}

// ── Training Load Section (7-day bars with weekday labels) ──
function TrainingLoadSection({
  dailyLoad,
  signalColor,
}: {
  dailyLoad?: { date: string; trainingLoadAu: number; sessionCount: number }[];
  signalColor: string;
}) {
  const { colors } = useTheme();
  const data = (dailyLoad ?? []).slice(-7);
  if (data.length === 0) return null;

  const barWidth = 24;
  const barGap = 8;
  const chartHeight = 40;
  const chartWidth = (barWidth + barGap) * data.length;
  const values = data.map((d) => d.trainingLoadAu);

  return (
    <DashboardCard label="TRAINING LOAD">
      <Text style={[styles.metricDeltaMuted, { color: colors.panelTextSecondary }]}>Last 7 days (AU)</Text>
      <View style={{ marginTop: 8 }}>
        <BarChart
          values={values}
          color={`${signalColor}50`}
          width={chartWidth}
          height={chartHeight}
          barWidth={barWidth}
          barGap={barGap}
          rx={4}
        />
        <View style={{ flexDirection: 'row' }}>
          {data.map((d, i) => {
            const dayLabel = new Date(d.date).toLocaleDateString('en', { weekday: 'narrow' });
            return (
              <Text
                key={i}
                style={{
                  width: barWidth + barGap,
                  textAlign: 'center',
                  fontFamily: fontFamily.regular,
                  fontSize: 7,
                  color: colors.panelTextMuted,
                }}
              >
                {dayLabel}
              </Text>
            );
          })}
        </View>
      </View>
    </DashboardCard>
  );
}

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 8,
  },
  metricValue: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
  },
  metricDelta: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
  },
  metricDeltaMuted: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
  },
  zoneBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  zoneText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  syncLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  syncLabelMuted: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    flex: 1,
  },
});
