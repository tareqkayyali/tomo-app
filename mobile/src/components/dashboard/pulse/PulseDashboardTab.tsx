/**
 * Pulse — Signal tab Dashboard sub-tab (feature-flagged).
 * Visual language + IA per Pulse spec; data from boot + output snapshots.
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../hooks/useTheme';
import { fontFamily } from '../../../theme/typography';
import { useEnter } from '../../../hooks/useEnter';
import type { BootData, OutputSnapshot, DashboardLayoutSection } from '../../../services/api';
import { ReadinessRing } from '../signal/ReadinessRing';
import { SleepTrendCard } from '../signal/SleepTrendCard';
import {
  deriveReadiness,
  deriveSleep,
  pickHighlightWord,
} from '../signal/dashboardPulseDerivations';
import {
  computeAcwrFromDailyLoad,
  acwrZone,
  getPulseVitalsEmptyState,
  hasAnyVitalsSeries,
  last7Series,
  ordinalPercentile,
} from './pulseDashboardLogic';
import {
  buildMetricChipBuckets,
  thisCalendarMonthStats,
  heatmapIntensity12x7,
} from './pulseDashboardWiring';
import { pulseCategoryColor } from './pulseCategoryColors';
import { PulseCard } from './PulseCard';
import { PulseSectionLabel } from './PulseSectionLabel';
import { Sparkline } from './Sparkline';
import { SegmentRail } from './SegmentRail';
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const LABEL_MUTED = 'rgba(245,243,237,0.35)';

// ── CMS section registry ─────────────────────────────────────────────────────
// These keys map 1:1 to `dashboard_sections.component_type` in the CMS.
// Admin enables/disables sections; mobile renders the default order unless
// a Pulse-typed layout is configured.
export const PULSE_SECTION_KEYS = [
  'pulse_hero',
  'pulse_vitals',
  'pulse_sleep',
  'pulse_load_wellness',
  'pulse_session',
  'pulse_programs',
  'pulse_metrics',
  'pulse_progress',
  'pulse_benchmark',
  'pulse_month',
  'pulse_consistency',
] as const;

export type PulseSectionKey = typeof PULSE_SECTION_KEYS[number];

const ALL_PULSE_SECTIONS = new Set<string>(PULSE_SECTION_KEYS);

function splitHighlight(msg: string, word: string | undefined): {
  before: string;
  highlight: string;
  after: string;
} {
  if (!word) return { before: msg, highlight: '', after: '' };
  const idx = msg.toLowerCase().indexOf(word.toLowerCase());
  if (idx < 0) return { before: msg, highlight: '', after: '' };
  return {
    before: msg.slice(0, idx),
    highlight: msg.slice(idx, idx + word.length),
    after: msg.slice(idx + word.length),
  };
}

function formatEventClock(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch {
    return '';
  }
}

const ACWR_SCALE_MIN = 0.4;
const ACWR_SCALE_MAX = 1.7;

type SignalShape = NonNullable<BootData['signalContext']>;

export type PulseDashboardTabProps = {
  bootData: BootData | null;
  outputData: OutputSnapshot | null;
  modeLabel: string;
  signal: SignalShape;
  /** CMS-managed layout from bootData.dashboardLayout. When this contains
   *  pulse_* entries, only those sections render (in the hardcoded Pulse
   *  order). Empty / omitted = all sections visible. */
  dashboardLayout?: DashboardLayoutSection[];
  onSleepPress?: () => void;
  onStrengthPress?: () => void;
  onGapPress?: () => void;
  onOpenMetricsTab?: () => void;
  onOpenProgramsTab?: () => void;
};

const SLEEP_SPARKLINE = '#5A7BA6';
const MOOD_RAIL = '#C8A27A';
const SORENESS_RAIL = '#9B7CB8';
const ACWR_RISK = 'rgba(140, 58, 58, 0.55)';
const ACWR_OPT = 'rgba(58, 98, 58, 0.72)';

function WellnessRow({ label, value, railColor }: { label: string; value: number; railColor: string }) {
  const done = Math.max(0, Math.min(7, Math.round((value / 10) * 7)));
  return (
    <View style={styles.wellnessRow}>
      <Text style={styles.wellLabel}>{label}</Text>
      <View style={styles.wellnessRailWrap}>
        <View style={{ opacity: 0.35 + 0.65 * (value / 10) }}>
          <SegmentRail total={7} done={done} color={railColor} brickHeight={5} />
        </View>
      </View>
      <Text style={styles.wellnessScore}>{value.toFixed(1)}/10</Text>
    </View>
  );
}

export function PulseDashboardTab({
  bootData,
  outputData,
  modeLabel,
  signal,
  dashboardLayout,
  onSleepPress,
  onStrengthPress,
  onGapPress,
  onOpenMetricsTab,
  onOpenProgramsTab,
}: PulseDashboardTabProps) {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [progressExpanded, setProgressExpanded] = useState(false);
  const [metricsExpanded, setMetricsExpanded] = useState<Record<string, boolean>>({});

  // Which Pulse sections are enabled — derived from CMS dashboardLayout.
  // If the layout has no pulse_* entries, all sections are shown (default).
  const enabledSections = useMemo((): Set<string> => {
    const pulseEntries = (dashboardLayout ?? []).filter(
      (s) => ALL_PULSE_SECTIONS.has(s.component_type),
    );
    if (pulseEntries.length === 0) return ALL_PULSE_SECTIONS;
    return new Set(pulseEntries.map((s) => s.component_type));
  }, [dashboardLayout]);

  const delays = useMemo(() => Array.from({ length: 11 }, (_, i) => i * 48), []);
  const e0 = useEnter(delays[0]);
  const e1 = useEnter(delays[1]);
  const e2 = useEnter(delays[2]);
  const e3 = useEnter(delays[3]);
  const e4 = useEnter(delays[4]);
  const e5 = useEnter(delays[5]);
  const e6 = useEnter(delays[6]);
  const e7 = useEnter(delays[7]);
  const e8 = useEnter(delays[8]);
  const e9 = useEnter(delays[9]);
  const e10 = useEnter(delays[10]);

  const readiness = useMemo(() => deriveReadiness(bootData), [bootData]);
  const sleepData = useMemo(() => deriveSleep(bootData), [bootData]);
  const highlightWord = useMemo(() => pickHighlightWord(signal.coaching ?? ''), [signal.coaching]);
  const parts = splitHighlight(signal.coaching ?? '', highlightWord);

  const recent = bootData?.recentVitals ?? [];
  const hrvSeries = useMemo(
    () => last7Series((r) => r.hrv_morning_ms, recent),
    [recent],
  );
  const sleepSeries = useMemo(
    () => last7Series((r) => r.sleep_hours, recent),
    [recent],
  );
  const readinessSeries = useMemo(
    () => last7Series((r) => r.readiness_score, recent),
    [recent],
  );
  const vitalsEmpty = !hasAnyVitalsSeries(hrvSeries, sleepSeries, readinessSeries);
  const emptyVitals = getPulseVitalsEmptyState();

  const vitalsHeadlines = useMemo(() => {
    const lastNum = (arr: (number | null)[]) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (typeof arr[i] === 'number') return arr[i] as number;
      }
      return null as number | null;
    };
    const nums = (arr: (number | null)[]) => arr.filter((v): v is number => typeof v === 'number');
    const hrvLast = lastNum(hrvSeries);
    const yHrv = bootData?.yesterdayVitals?.hrv_morning_ms;
    let hrvSub = '';
    if (typeof hrvLast === 'number' && typeof yHrv === 'number') {
      const d = Math.round(hrvLast - yHrv);
      hrvSub = d === 0 ? 'flat vs base' : `${d > 0 ? '↑' : '↓'} ${Math.abs(d)} vs base`;
    } else if (typeof hrvLast === 'number') {
      hrvSub = 'last 7d';
    }
    const sleepNums = nums(sleepSeries);
    const sleepAvg =
      sleepNums.length > 0 ? sleepNums.reduce((a, b) => a + b, 0) / sleepNums.length : null;
    const sleepSub = sleepAvg != null ? `avg ${sleepAvg.toFixed(1)}h` : '';
    const readLast = lastNum(readinessSeries);
    let readSub = '';
    if (readLast != null) {
      if (readLast >= 75) readSub = 'Primed';
      else if (readLast >= 55) readSub = 'Steady';
      else readSub = 'Building';
    }
    return { hrvLast, hrvSub, sleepSub, readLast, readSub };
  }, [bootData?.yesterdayVitals, hrvSeries, sleepSeries, readinessSeries]);

  const acwr = useMemo(() => computeAcwrFromDailyLoad(bootData?.dailyLoad), [bootData?.dailyLoad]);
  const zone = acwrZone(acwr);
  const zoneLine =
    zone === 'optimal' ? 'Optimal zone' : zone === 'risk' ? 'Risk zone' : 'Detrain zone';

  const latestWell = bootData?.latestCheckin;
  const energy = latestWell?.energy ?? 7;
  const mood = latestWell?.mood ?? 7;
  const soreness = latestWell?.soreness ?? 4;

  const bars = useMemo(() => {
    const rows = [...(bootData?.dailyLoad ?? [])].slice(0, 28).reverse();
    const max = Math.max(1, ...rows.map((r) => r.trainingLoadAu || 0));
    return { rows, max };
  }, [bootData?.dailyLoad]);

  const metricBuckets = useMemo(() => buildMetricChipBuckets(outputData), [outputData]);
  const metricsTracked = useMemo(
    () =>
      (outputData?.metrics?.categories ?? []).reduce((n, c) => n + (c.metrics?.length ?? 0), 0),
    [outputData?.metrics?.categories],
  );

  const risingRows = useMemo(
    () => (signal.triggerRows ?? []).filter((r) => r.isPositive),
    [signal.triggerRows],
  );
  const watchRows = useMemo(
    () => (signal.triggerRows ?? []).filter((r) => !r.isPositive),
    [signal.triggerRows],
  );
  const cap = progressExpanded ? 99 : 4;
  const risingShow = risingRows.slice(0, cap);
  const watchShow = watchRows.slice(0, cap);

  const month = useMemo(() => thisCalendarMonthStats(bootData), [bootData]);
  const heatMatrix = useMemo(() => heatmapIntensity12x7(bootData?.dailyLoad ?? []), [bootData?.dailyLoad]);

  const programActiveCount = useMemo(() => {
    const c = (bootData?.coachProgrammes?.length ?? 0) + (bootData?.activePrograms?.length ?? 0);
    return c;
  }, [bootData?.coachProgrammes, bootData?.activePrograms]);

  const sessionTimeShort = useMemo(() => {
    const ev = bootData?.todayEvents?.[0];
    return ev?.startAt ? formatEventClock(ev.startAt) : null;
  }, [bootData?.todayEvents]);

  const sessionScheduleRight = useMemo(() => {
    return sessionTimeShort ? `Scheduled · ${sessionTimeShort}` : 'Plan';
  }, [sessionTimeShort]);

  const strength = bootData?.benchmarkSummary?.topStrengthDetail ?? null;
  const gap = bootData?.benchmarkSummary?.topGapDetail ?? null;
  const positionPct = bootData?.benchmarkSummary?.overallPercentile ?? null;

  const sessionTiles = useMemo(() => {
    const pills = signal.pills ?? [];
    const base = pills.slice(0, 4).map((p, i) => ({
      title: `${String(i + 1).padStart(2, '0')} ${p.label}`,
      sub: p.subLabel || '—',
      key: `pill-${i}`,
    }));
    const fallbacks = ['Activation', 'Main block', 'Accessory', 'Cooldown'];
    while (base.length < 4) {
      const i = base.length;
      base.push({
        title: `${String(i + 1).padStart(2, '0')} ${fallbacks[i]}`,
        sub: '—',
        key: `pad-${i}`,
      });
    }
    return base;
  }, [signal.pills]);

  const onStart = useCallback(() => {
    navigation.navigate('Main', { screen: 'Plan' });
  }, [navigation]);

  const onToggleProgress = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setProgressExpanded((v) => !v);
  }, []);

  const sage = colors.tomoSage;
  const clay = colors.tomoClay;
  const zoneLineColor =
    zone === 'optimal' ? sage : zone === 'risk' ? '#E8A598' : colors.tomoSteel;

  const acwrMarkerPct = useMemo(() => {
    if (acwr <= 0) return 8;
    const clamped = Math.max(ACWR_SCALE_MIN, Math.min(ACWR_SCALE_MAX, acwr));
    return ((clamped - ACWR_SCALE_MIN) / (ACWR_SCALE_MAX - ACWR_SCALE_MIN)) * 100;
  }, [acwr]);

  const renderMetricChip = (m: (typeof metricBuckets.strong)[0], tint: string) => {
    const zoneLabelChip =
      m.bucket === 'strong' ? 'Strong' : m.bucket === 'holding' ? 'Solid' : 'Watch';
    const a11y = `${m.metric.metricLabel}, ${m.metric.value} ${m.metric.unit}, ${ordinalPercentile(m.metric.percentile)} percentile, ${zoneLabelChip}`;
    return (
      <PulseCard key={m.metric.metricKey} tintColor={tint} tintOpacity={0.1} style={styles.metricChip}>
        <View style={styles.metricChipInner} accessibilityLabel={a11y}>
          <Text style={styles.metricChipEyebrow}>{m.metric.metricLabel.toUpperCase()}</Text>
          <View style={styles.metricChipRow}>
            <Text style={styles.metricChipValue}>
              {typeof m.metric.value === 'number' ? m.metric.value.toFixed(2).replace(/\.?0+$/, '') : m.metric.value}
            </Text>
            <Text style={styles.metricChipUnit}>{m.metric.unit}</Text>
          </View>
          <Sparkline values={m.spark} color={tint} height={28} />
          <Text style={[styles.metricChipTag, { color: tint }]}>{ordinalPercentile(m.metric.percentile)}</Text>
        </View>
      </PulseCard>
    );
  };

  const renderMetricBucket = (
    label: string,
    items: (typeof metricBuckets.strong),
    tint: string,
    bucketKey: string,
  ) => {
    if (items.length === 0) return null;
    const expanded = metricsExpanded[bucketKey] ?? false;
    // Show 4 chips (2 rows) collapsed; all when expanded
    const visible = expanded ? items : items.slice(0, 4);
    const hasMore = items.length > 4;
    return (
      <View key={bucketKey}>
        <View style={styles.bucketHeaderRow}>
          <Text style={[styles.bucketHead, { color: tint }]}>{label} · {items.length}</Text>
          {hasMore && (
            <Pressable
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setMetricsExpanded((prev) => ({ ...prev, [bucketKey]: !expanded }));
              }}
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Show less' : `Show all ${items.length}`}
            >
              <Text style={[styles.bucketToggle, { color: tint }]}>
                {expanded ? 'Show less' : `Show all ${items.length}`}
              </Text>
            </Pressable>
          )}
        </View>
        <View style={styles.metricGrid}>
          {visible.map((m) => renderMetricChip(m, tint))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {/* 1 Hero */}
      {enabledSections.has('pulse_hero') && (
        <Animated.View style={[styles.section, e0]}>
          <PulseCard tintColor={sage} tintOpacity={0.2}>
            <LinearGradient
              colors={['rgba(48, 68, 50, 0.88)', 'rgba(18, 20, 31, 0.08)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
              pointerEvents="none"
            />
            <View style={styles.heroPad}>
              <View style={styles.heroRow}>
                <ReadinessRing value={readiness} size={64} />
                <View style={styles.heroText}>
                  <Text style={[styles.heroEyebrow, { color: colors.accentLight }]}>
                    {`TODAY · ${modeLabel.toUpperCase()}`}
                  </Text>
                  <Text style={[styles.heroBody, { color: colors.textPrimary }]} accessibilityRole="text">
                    {parts.before}
                    {parts.highlight ? (
                      <Text style={[styles.heroHi, { color: colors.accentLight }]}>{parts.highlight}</Text>
                    ) : null}
                    {parts.after}
                  </Text>
                </View>
              </View>
            </View>
          </PulseCard>
        </Animated.View>
      )}

      {/* 2 Vitals */}
      {enabledSections.has('pulse_vitals') && (
      <Animated.View style={[styles.section, e1]}>
        <PulseSectionLabel left="Vitals · 7 day" />
        {vitalsEmpty ? (
          <PulseCard tintColor={sage} style={styles.vitalsEmpty}>
            <View style={styles.vitalsEmptyInner} accessibilityLabel={`${emptyVitals.title}. ${emptyVitals.body}`}>
              <Text style={styles.vitalsEmptyTitle}>{emptyVitals.title}</Text>
              <Text style={styles.vitalsEmptyBody}>{emptyVitals.body}</Text>
            </View>
          </PulseCard>
        ) : (
          <View style={styles.vitalsGrid}>
            <PulseCard tintColor={sage} style={styles.vitalCell}>
              <Text style={styles.vitalLabel}>HRV</Text>
              {typeof vitalsHeadlines.hrvLast === 'number' ? (
                <Text style={styles.vitalValue}>
                  {Math.round(vitalsHeadlines.hrvLast)}
                  <Text style={styles.vitalUnit}> ms</Text>
                </Text>
              ) : null}
              {vitalsHeadlines.hrvSub ? (
                <Text style={[styles.vitalSub, { color: sage }]}>{vitalsHeadlines.hrvSub}</Text>
              ) : null}
              <Sparkline values={hrvSeries} color={sage} height={30} />
            </PulseCard>
            <PulseCard tintColor={sage} style={styles.vitalCell}>
              <Text style={styles.vitalLabel}>Sleep</Text>
              <Text style={styles.vitalValue}>
                {(() => {
                  const n = sleepSeries.filter((x): x is number => typeof x === 'number');
                  const last = n.length ? n[n.length - 1] : null;
                  return last != null ? `${last.toFixed(1)}` : '—';
                })()}
                <Text style={styles.vitalUnit}> hrs</Text>
              </Text>
              {vitalsHeadlines.sleepSub ? (
                <Text style={[styles.vitalSub, { color: SLEEP_SPARKLINE }]}>{vitalsHeadlines.sleepSub}</Text>
              ) : (
                <View style={{ height: 16 }} />
              )}
              <Sparkline values={sleepSeries} color={SLEEP_SPARKLINE} height={30} />
            </PulseCard>
            <PulseCard tintColor={sage} style={styles.vitalCell}>
              <Text style={styles.vitalLabel}>Ready</Text>
              {typeof vitalsHeadlines.readLast === 'number' ? (
                <Text style={styles.vitalValue}>
                  {Math.round(vitalsHeadlines.readLast)}
                  <Text style={styles.vitalUnit}> /100</Text>
                </Text>
              ) : null}
              {vitalsHeadlines.readSub ? (
                <Text style={[styles.vitalSub, { color: sage }]}>{vitalsHeadlines.readSub}</Text>
              ) : null}
              <Sparkline values={readinessSeries} color={sage} height={30} />
            </PulseCard>
          </View>
        )}
      </Animated.View>
      )}

      {/* 3 Sleep */}
      {enabledSections.has('pulse_sleep') && sleepData ? (
        <Animated.View style={[styles.section, e2]}>
          <PulseCard tintColor={sage}>
            <View style={styles.sleepPad}>
              <SleepTrendCard
                nights={sleepData.nights}
                nightsLabels={sleepData.nightsLabels}
                weekAvg={sleepData.weekAvg}
                target={sleepData.target}
                debt={sleepData.debt}
                trend={sleepData.trend}
                onPress={onSleepPress}
                variant="pulse"
              />
            </View>
          </PulseCard>
        </Animated.View>
      ) : null}

      {/* 4 Load & wellness */}
      {enabledSections.has('pulse_load_wellness') && (
      <Animated.View style={[styles.section, e3]}>
        <PulseSectionLabel left="Load & wellness" />
        <PulseCard tintColor={sage}>
          <View style={styles.stackPad}>
            <Text style={styles.cardEyebrow}>TRAINING LOAD RATIO · ACWR</Text>
            <View style={styles.acwrHeroRow}>
              <Text style={styles.acwrBig}>{acwr > 0 ? acwr.toFixed(2) : '—'}</Text>
              <Text style={[styles.acwrZoneTag, { color: zoneLineColor }]}>{zoneLine}</Text>
            </View>
            <View style={styles.acwrWrap}>
              <View style={styles.acwrTrack}>
                <View style={[styles.acwrZone, { flex: 4, backgroundColor: ACWR_RISK }]} />
                <View style={[styles.acwrZone, { flex: 5, backgroundColor: ACWR_OPT }]} />
                <View style={[styles.acwrZone, { flex: 4, backgroundColor: ACWR_RISK }]} />
              </View>
              <View style={[styles.acwrMarker, { left: `${acwrMarkerPct}%` }]} />
            </View>
            <View style={styles.acwrLegendRow}>
              <Text style={styles.acwrLegend}>0.5 DETRAIN</Text>
              <Text style={styles.acwrLegend}>0.8–1.3 OPTIMAL</Text>
              <Text style={styles.acwrLegend}>1.5+ RISK</Text>
            </View>

            <Text style={[styles.cardEyebrow, { marginTop: 20 }]}>WELLNESS · 7 DAY</Text>
            <View style={{ marginTop: 10, gap: 12 }}>
              <WellnessRow label="Energy" value={energy} railColor={sage} />
              <WellnessRow label="Mood" value={mood} railColor={MOOD_RAIL} />
              <WellnessRow label="Soreness" value={soreness} railColor={SORENESS_RAIL} />
            </View>

            <View style={styles.loadSubheadRow}>
              <Text style={styles.cardEyebrow}>TRAINING LOAD · 28 DAYS</Text>
              <Text style={styles.cardEyebrow}>Load · AU</Text>
            </View>
            <View style={styles.barAxisRow}>
              <Text style={styles.barAxisLab}>4 weeks ago</Text>
              <Text style={styles.barAxisLab}>Today</Text>
            </View>
            <View style={styles.barRow}>
              {bars.rows.map((d, i) => {
                const h = Math.round((d.trainingLoadAu / bars.max) * 52);
                const isToday = i === bars.rows.length - 1;
                return (
                  <View
                    key={d.date}
                    style={[
                      styles.bar,
                      {
                        height: Math.max(4, h),
                        backgroundColor: isToday ? colors.accentLight : sage,
                        opacity: isToday ? 1 : 0.42,
                        ...(isToday
                          ? {
                              shadowColor: colors.accentLight,
                              shadowOpacity: 0.85,
                              shadowRadius: 8,
                              shadowOffset: { width: 0, height: 0 },
                              elevation: 8,
                            }
                          : {}),
                      },
                    ]}
                    accessibilityLabel={`Load ${d.trainingLoadAu} on ${d.date}`}
                  />
                );
              })}
            </View>
          </View>
        </PulseCard>
      </Animated.View>
      )}

      {/* 5 Today's session */}
      {enabledSections.has('pulse_session') && (
      <Animated.View style={[styles.section, e4]}>
        <PulseSectionLabel left="Today's session" right={sessionScheduleRight} />
        <PulseCard tintColor={sage}>
          <View style={styles.stackPad}>
            <View style={styles.sessionLiveRow}>
              <View style={[styles.liveDot, { backgroundColor: sage }]} />
              <Text style={[styles.sessionLiveText, { color: sage }]}>
                TODAY{sessionTimeShort ? ` · ${sessionTimeShort}` : ''}
              </Text>
            </View>
            {signal.adaptedPlan ? (
              <>
                <Text style={styles.sessionTitle}>{signal.adaptedPlan.sessionName}</Text>
                <Text style={styles.sessionMeta}>{signal.adaptedPlan.sessionMeta}</Text>
              </>
            ) : (
              <Text style={styles.sessionMeta}>No session pinned — open Plan to schedule.</Text>
            )}
            <View style={styles.tileGrid}>
              {sessionTiles.map((t) => (
                <View key={t.key} style={styles.tile} accessibilityLabel={`${t.title}. ${t.sub}`}>
                  <Text style={styles.tileTitle}>{t.title}</Text>
                  <Text style={styles.tileSub}>{t.sub}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={onStart}
              style={({ pressed }) => [styles.ctaFull, { opacity: pressed ? 0.92 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Start session"
            >
              <Text style={styles.ctaFullText}>Start session →</Text>
            </Pressable>
          </View>
        </PulseCard>
      </Animated.View>
      )}

      {/* 6 Programs */}
      {enabledSections.has('pulse_programs') && (
      <Animated.View style={[styles.section, e5]}>
        <PulseSectionLabel
          left="Programs"
          right={programActiveCount > 0 ? `${programActiveCount} active` : undefined}
        />
        <Pressable onPress={onOpenProgramsTab} accessibilityRole="button" accessibilityLabel="Open programs tab">
          <View style={{ gap: 10 }}>
          {(bootData?.coachProgrammes?.length ?? 0) === 0 &&
          (bootData?.activePrograms?.length ?? 0) === 0 ? (
            <PulseCard tintColor={pulseCategoryColor('coach')}>
              <Text style={styles.mutedSmall}>No active programs — tap to browse.</Text>
            </PulseCard>
          ) : (
            <>
              {(bootData?.coachProgrammes ?? []).map((cp) => {
                const total = Math.max(1, cp.weeks || 8);
                const start = new Date(cp.startDate);
                const completedWeeks = Math.min(
                  total,
                  Math.max(0, Math.floor((Date.now() - start.getTime()) / (7 * 86400000))),
                );
                return (
                  <PulseCard key={cp.id} tintColor={pulseCategoryColor('coach')} style={styles.progCard}>
                    <View style={styles.progPillRow}>
                      <View style={[styles.coachPill, { borderColor: pulseCategoryColor('coach') }]}>
                        <Text style={[styles.coachPillText, { color: pulseCategoryColor('coach') }]}>COACH</Text>
                      </View>
                      <Text style={styles.progMetaCaps}>IN-SEASON · {total} WEEKS</Text>
                    </View>
                    <Text style={styles.progName}>{cp.name}</Text>
                    <Text style={styles.progSub}>{cp.description ?? 'Coach programme'}</Text>
                    <SegmentRail total={total} done={completedWeeks} color={pulseCategoryColor('coach')} brickHeight={5} />
                  </PulseCard>
                );
              })}
              {(bootData?.activePrograms ?? []).map((ap) => {
                const meta = ap.metadata as Record<string, unknown>;
                const name = String(meta?.name ?? meta?.programName ?? 'Program');
                const cat = (meta?.category ?? meta?.trainingCategory ?? 'speed') as string;
                const c = pulseCategoryColor(cat);
                const tw = Number(meta?.totalWeeks ?? meta?.durationWeeks ?? 8) || 8;
                const wk = Number(meta?.currentWeek ?? meta?.weekNumber ?? 1) || 1;
                return (
                  <PulseCard key={ap.programId} tintColor={c} style={styles.progCard}>
                    <View style={styles.progPillRow}>
                      <View style={[styles.catDot, { backgroundColor: c }]} />
                      <Text style={[styles.progMetaCaps, { color: LABEL_MUTED }]}>{String(cat).toUpperCase()}</Text>
                      <Text style={[styles.progMetaCaps, { color: LABEL_MUTED }]}> · Wk {wk}/{tw}</Text>
                    </View>
                    <Text style={styles.progName}>{name}</Text>
                    <SegmentRail total={tw} done={Math.min(tw, wk)} color={c} brickHeight={5} />
                  </PulseCard>
                );
              })}
            </>
          )}
          </View>
        </Pressable>
      </Animated.View>
      )}

      {/* 7 Metrics */}
      {enabledSections.has('pulse_metrics') && (
      <Animated.View style={[styles.section, e6]}>
        <PulseSectionLabel left="Metrics" right={metricsTracked > 0 ? `${metricsTracked} tracked` : undefined} />
        <Pressable onPress={onOpenMetricsTab}>
          <View style={{ gap: 10 }}>
            {renderMetricBucket('STRONG', metricBuckets.strong, sage, 'strong')}
            {renderMetricBucket('HOLDING', metricBuckets.holding, colors.tomoSteel, 'holding')}
            {renderMetricBucket('WATCH', metricBuckets.watch, clay, 'watch')}
            {!outputData?.metrics?.categories?.length ? (
              <PulseCard tintColor={sage}>
                <Text style={styles.mutedSmall}>Log tests in Metrics to fill this row.</Text>
              </PulseCard>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
      )}

      {/* 8 Progress 7d */}
      {enabledSections.has('pulse_progress') && (
      <Animated.View style={[styles.section, e7]}>
        <PulseSectionLabel left="Progress · 7 day" right={progressExpanded ? 'tap to collapse' : 'tap to expand'} />
        <Pressable onPress={onToggleProgress}>
          <PulseCard tintColor={sage}>
            <View style={styles.split}>
              <View style={[styles.splitCol, { borderRightWidth: 1, borderRightColor: 'rgba(245,243,237,0.08)' }]}>
                <Text style={[styles.splitTitle, { color: sage }]}>
                  ● RISING · {risingRows.length}
                </Text>
                {risingShow.map((r) => (
                  <View key={r.metric} style={styles.splitRow}>
                    <Text style={styles.splitMetric}>{r.metric}</Text>
                    <Text style={styles.splitValBig}>
                      {r.value}
                      <Text style={styles.splitArrow}> ← </Text>
                      <Text style={styles.splitBaseline}>{r.baseline}</Text>
                    </Text>
                    <Text style={[styles.splitDelta, { color: sage }]}>↗ {r.delta}</Text>
                  </View>
                ))}
                {!risingShow.length ? <Text style={styles.mutedSmall}>No rising signals.</Text> : null}
              </View>
              <View style={styles.splitCol}>
                <Text style={[styles.splitTitle, { color: clay }]}>
                  ● WATCH · {watchRows.length}
                </Text>
                {watchShow.map((r) => (
                  <View key={r.metric} style={styles.splitRow}>
                    <Text style={styles.splitMetric}>{r.metric}</Text>
                    <Text style={styles.splitValBig}>
                      {r.value}
                      <Text style={styles.splitArrow}> ← </Text>
                      <Text style={styles.splitBaseline}>{r.baseline}</Text>
                    </Text>
                    <Text style={[styles.splitDelta, { color: clay }]}>↘ {r.delta}</Text>
                  </View>
                ))}
                {!watchShow.length ? <Text style={styles.mutedSmall}>No watch signals.</Text> : null}
              </View>
            </View>
          </PulseCard>
        </Pressable>
      </Animated.View>
      )}

      {/* 9 Benchmark */}
      {enabledSections.has('pulse_benchmark') && (strength || gap || positionPct != null) && (
        <Animated.View style={[styles.section, e8]}>
          <PulseSectionLabel left="Benchmark" />
          <PulseCard tintColor={sage}>
            <View style={styles.stackPad}>
              <View style={styles.benchHeaderRow}>
                <Text style={styles.microMuted}>POSITION PERCENTILE</Text>
                <Text style={styles.microMuted}>{(bootData?.position ?? '—').toString().toUpperCase()}</Text>
              </View>
              {positionPct != null ? (
                <View style={styles.benchOverallRow}>
                  <Text style={styles.bigPct}>{Math.round(positionPct)}</Text>
                  <Text style={styles.benchOverallWord}>overall</Text>
                </View>
              ) : null}
              {strength ? (
                <Pressable onPress={onStrengthPress} accessibilityLabel={`Strength ${strength.metric}`}>
                  <Text style={styles.benchSectionLabel}>TOP STRENGTH</Text>
                  <View style={styles.benchRow}>
                    <Text style={styles.benchMetricName}>{strength.metric}</Text>
                    <Text style={[styles.benchPct, { color: sage }]}>{ordinalPercentile(strength.percentile)}</Text>
                  </View>
                  <View style={styles.benchBarTrack}>
                    <View
                      style={[
                        styles.benchBarFill,
                        { width: `${Math.min(100, Math.max(0, strength.percentile))}%`, backgroundColor: sage },
                      ]}
                    />
                  </View>
                </Pressable>
              ) : null}
              {gap ? (
                <Pressable onPress={onGapPress} style={{ marginTop: 16 }} accessibilityLabel={`Gap ${gap.metric}`}>
                  <Text style={styles.benchSectionLabel}>BIGGEST GAP</Text>
                  <View style={styles.benchRow}>
                    <Text style={styles.benchMetricName}>{gap.metric}</Text>
                    <Text style={[styles.benchPct, { color: clay }]}>{ordinalPercentile(gap.percentile)}</Text>
                  </View>
                  <View style={styles.benchBarTrack}>
                    <View
                      style={[
                        styles.benchBarFill,
                        { width: `${Math.min(100, Math.max(0, gap.percentile))}%`, backgroundColor: clay },
                      ]}
                    />
                  </View>
                </Pressable>
              ) : null}
            </View>
          </PulseCard>
        </Animated.View>
      )}

      {/* 10 This month */}
      {enabledSections.has('pulse_month') && (
      <Animated.View style={[styles.section, e9]}>
        <PulseSectionLabel left="This month" />
        <PulseCard tintColor={sage}>
          <Text style={styles.monthBanner}>
            THIS MONTH · {new Date().toLocaleString('en-GB', { month: 'long' }).toUpperCase()}
          </Text>
          <View style={styles.monthGrid}>
            <View style={styles.monthCell}>
              <Text style={styles.monthVal}>{month.sessions}</Text>
              <Text style={styles.monthLab}>Sessions</Text>
            </View>
            <View style={styles.monthCell}>
              <Text style={styles.monthVal}>{Math.round(month.loadAu)}</Text>
              <Text style={styles.monthLab}>Load AU</Text>
            </View>
            <View style={styles.monthCell}>
              <Text style={styles.monthVal}>{month.streak}</Text>
              <Text style={styles.monthLab}>Streak</Text>
            </View>
            <View style={styles.monthCell}>
              <Text style={styles.monthVal}>
                {month.wellnessAvg != null ? month.wellnessAvg.toFixed(1) : '—'}
              </Text>
              <Text style={styles.monthLab}>Wellness avg</Text>
            </View>
          </View>
        </PulseCard>
      </Animated.View>
      )}

      {/* 11 Consistency */}
      {enabledSections.has('pulse_consistency') && (
      <Animated.View style={[styles.section, e10]}>
        <PulseSectionLabel left="Consistency · 12 weeks" right={month.streak > 0 ? `${month.streak}d streak` : undefined} />
        <PulseCard tintColor={sage}>
          <View style={styles.stackPad}>
            <View style={styles.heatGrid}>
              {heatMatrix.map((row, ri) => (
                <View key={`r-${ri}`} style={styles.heatMatrixRow}>
                  {row.map((step, ci) => {
                    const o = [0.08, 0.18, 0.34, 0.52, 0.88][Math.max(0, Math.min(4, step))];
                    return (
                      <View
                        key={`c-${ri}-${ci}`}
                        style={[
                          styles.heatCell,
                          { backgroundColor: sage, opacity: step === 0 ? 0.07 : o },
                        ]}
                        accessibilityLabel={`Training load intensity ${step} week column ${ci}`}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
            <View style={styles.heatLegendRow}>
              <Text style={styles.legend}>Less</Text>
              <View style={styles.heatLegendSwatches}>
                {[0.15, 0.3, 0.48, 0.72].map((o, i) => (
                  <View key={i} style={[styles.heatSwatch, { backgroundColor: sage, opacity: o }]} />
                ))}
              </View>
              <Text style={styles.legend}>More</Text>
            </View>
          </View>
        </PulseCard>
      </Animated.View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 4,
  },
  section: {
    marginBottom: 18,
  },
  heroPad: { paddingVertical: 14, paddingHorizontal: 14 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroText: { flex: 1 },
  heroEyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroBody: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  heroHi: { fontFamily: fontFamily.medium },
  vitalsGrid: { flexDirection: 'row', gap: 8 },
  vitalCell: { flex: 1, padding: 10, minWidth: 0 },
  vitalLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: LABEL_MUTED,
    marginBottom: 6,
  },
  vitalsEmpty: {},
  vitalsEmptyInner: { padding: 16 },
  vitalsEmptyTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: 'rgba(245,243,237,0.85)',
    marginBottom: 6,
  },
  vitalsEmptyBody: { fontFamily: fontFamily.regular, fontSize: 12, color: LABEL_MUTED, lineHeight: 18 },
  sleepPad: { paddingHorizontal: 4, paddingBottom: 4 },
  stackPad: { padding: 14 },
  cardEyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: LABEL_MUTED,
  },
  microMuted: { fontFamily: fontFamily.regular, fontSize: 10, color: LABEL_MUTED },
  acwrHeroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 4 },
  acwrBig: { fontFamily: fontFamily.bold, fontSize: 30, color: 'rgba(245,243,237,0.96)', letterSpacing: -1 },
  acwrZoneTag: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  acwrWrap: { marginTop: 10, position: 'relative', height: 14, justifyContent: 'center' },
  acwrTrack: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },
  acwrZone: { height: '100%' },
  acwrMarker: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 14,
    marginLeft: -1,
    backgroundColor: '#F5F3ED',
    borderRadius: 1,
  },
  acwrLegendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  acwrLegend: { fontFamily: fontFamily.regular, fontSize: 8, color: 'rgba(245,243,237,0.32)', letterSpacing: 0.3 },
  loadSubheadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
  },
  barAxisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginBottom: 2 },
  barAxisLab: { fontFamily: fontFamily.regular, fontSize: 9, color: 'rgba(245,243,237,0.28)' },
  wellnessRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wellnessRailWrap: { flex: 1 },
  wellnessScore: { fontFamily: fontFamily.medium, fontSize: 11, color: 'rgba(245,243,237,0.55)', width: 44, textAlign: 'right' },
  wellLabel: { fontFamily: fontFamily.medium, fontSize: 10, color: 'rgba(245,243,237,0.5)', width: 64 },
  vitalValue: { fontFamily: fontFamily.semiBold, fontSize: 17, color: 'rgba(245,243,237,0.95)', marginTop: 2 },
  vitalUnit: { fontFamily: fontFamily.regular, fontSize: 11, color: LABEL_MUTED },
  vitalSub: { fontFamily: fontFamily.medium, fontSize: 10, marginTop: 4, marginBottom: 6 },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 56, marginTop: 8 },
  bar: { flex: 1, borderRadius: 2, minWidth: 2 },
  sessionTitle: { fontFamily: fontFamily.semiBold, fontSize: 16, color: 'rgba(245,243,237,0.92)' },
  sessionMeta: { fontFamily: fontFamily.regular, fontSize: 12, color: LABEL_MUTED, marginTop: 4 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tile: {
    width: '47%',
    backgroundColor: 'rgba(245,243,237,0.05)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.08)',
  },
  tileTitle: { fontFamily: fontFamily.medium, fontSize: 11, color: 'rgba(245,243,237,0.75)' },
  tileSub: { fontFamily: fontFamily.regular, fontSize: 10, color: LABEL_MUTED, marginTop: 4 },
  sessionLiveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  sessionLiveText: { fontFamily: fontFamily.medium, fontSize: 11, letterSpacing: 0.8 },
  ctaFull: {
    marginTop: 16,
    width: '100%',
    backgroundColor: '#7A9B76',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaFullText: { fontFamily: fontFamily.semiBold, fontSize: 15, color: '#12141F', letterSpacing: 0.2 },
  progCard: { padding: 12 },
  progPillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  coachPill: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(160,140,196,0.12)',
  },
  coachPillText: { fontFamily: fontFamily.semiBold, fontSize: 8, letterSpacing: 1.2 },
  progMetaCaps: { fontFamily: fontFamily.medium, fontSize: 8, letterSpacing: 1.2 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  progName: { fontFamily: fontFamily.semiBold, fontSize: 14, color: 'rgba(245,243,237,0.9)' },
  progSub: { fontFamily: fontFamily.regular, fontSize: 11, color: LABEL_MUTED, marginBottom: 8 },
  bucketHead: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: 1.8,
    marginBottom: 8,
  },
  hScroll: { gap: 10, paddingRight: 8 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bucketHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  bucketToggle: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 0.3 },
  metricChip: { flex: 1, minWidth: '45%' },
  metricChipInner: { padding: 10 },
  metricChipEyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: 8,
    letterSpacing: 1.2,
    color: LABEL_MUTED,
  },
  metricChipRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  metricChipValue: { fontFamily: fontFamily.semiBold, fontSize: 20, color: 'rgba(245,243,237,0.95)' },
  metricChipUnit: { fontFamily: fontFamily.regular, fontSize: 11, color: LABEL_MUTED },
  metricChipTag: { fontFamily: fontFamily.medium, fontSize: 10, marginTop: 6 },
  mutedSmall: { fontFamily: fontFamily.regular, fontSize: 12, color: LABEL_MUTED, padding: 12 },
  split: { flexDirection: 'row' },
  splitCol: { flex: 1, paddingHorizontal: 8, paddingVertical: 4 },
  splitTitle: { fontFamily: fontFamily.semiBold, fontSize: 11, marginBottom: 8, letterSpacing: 1 },
  splitRow: { marginBottom: 10 },
  splitMetric: { fontFamily: fontFamily.medium, fontSize: 11, color: 'rgba(245,243,237,0.7)' },
  splitVal: { fontFamily: fontFamily.regular, fontSize: 10, color: LABEL_MUTED, marginTop: 2 },
  splitValBig: { fontFamily: fontFamily.semiBold, fontSize: 13, color: 'rgba(245,243,237,0.92)', marginTop: 4 },
  splitArrow: { fontFamily: fontFamily.regular, fontSize: 12, color: 'rgba(245,243,237,0.35)' },
  splitBaseline: { fontFamily: fontFamily.regular, fontSize: 12, color: 'rgba(245,243,237,0.45)' },
  splitDelta: { fontFamily: fontFamily.semiBold, fontSize: 12, marginTop: 4 },
  bigPct: {
    fontFamily: fontFamily.bold,
    fontSize: 42,
    letterSpacing: -2,
    color: 'rgba(245,243,237,0.95)',
    lineHeight: 44,
  },
  benchHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  benchOverallRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 8 },
  benchOverallWord: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: 'rgba(245,243,237,0.45)',
    marginBottom: 6,
  },
  benchSectionLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.6,
    color: '#C8A27A',
    marginBottom: 6,
  },
  benchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  benchMetricName: { fontFamily: fontFamily.regular, fontSize: 12, color: 'rgba(245,243,237,0.78)', flex: 1, paddingRight: 8 },
  benchPct: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  benchBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(245,243,237,0.08)',
    marginTop: 8,
    overflow: 'hidden',
  },
  benchBarFill: { height: '100%', borderRadius: 2 },
  monthBanner: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    color: LABEL_MUTED,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 8 },
  monthCell: { width: '50%', paddingVertical: 12 },
  monthVal: { fontFamily: fontFamily.semiBold, fontSize: 22, color: 'rgba(245,243,237,0.95)' },
  monthLab: { fontFamily: fontFamily.regular, fontSize: 10, color: LABEL_MUTED, marginTop: 4 },
  heatGrid: { gap: 3, marginTop: 4 },
  heatMatrixRow: { flexDirection: 'row', gap: 2 },
  heatCell: { flex: 1, aspectRatio: 1, borderRadius: 3, maxHeight: 14 },
  heatLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  heatLegendSwatches: { flexDirection: 'row', gap: 3 },
  heatSwatch: { width: 10, height: 10, borderRadius: 2 },
  legend: { fontFamily: fontFamily.regular, fontSize: 10, color: LABEL_MUTED },
});
