/**
 * MetricsSection — Orbit Altitude redesign.
 * 5-tier rating-as-altitude: Needs Attention (1) → Elite (5).
 * Categories sorted urgent-first. Sphere shows composite readiness tier.
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { emitRefresh } from '../../utils/refreshBus';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { SmartIcon } from '../SmartIcon';
import { Loader } from '../Loader';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { GlassCard } from '../GlassCard';
import { TestHistoryTimeline } from './TestHistoryTimeline';
import { InlineTestInput } from './InlineTestInput';
import {
  searchTestCatalog,
  logTestResult,
  deleteTestResult,
  submitPlayerTest,
  getMyTestResults,
  type TestCatalogItem,
  type MyTestResult,
} from '../../services/api';
import type { OutputSnapshot, TestGroupCategory, RawTestGroup } from '../../services/api';
import type { BenchmarkResult } from '../../types/benchmarks';
import { getGroupThemeColor } from './outputTypes';

import { colors } from '../../theme/colors';

// ── Reverse mapping: metric key → catalog test type ────────────────────
// Inverse of backend's CATALOG_TO_METRIC. Uses the primary catalog ID for each metric.
const METRIC_TO_CATALOG: Record<string, string> = {
  sprint_10m: '10m-sprint',
  sprint_20m: '20m-sprint',
  flying_20m: 'flying-20m',
  sprint_30m: '30m-sprint',
  est_max_speed: 'flying-10m',
  cmj: 'cmj',
  broad_jump: 'broad-jump',
  agility_505: '5-0-5',
  agility_ttest: 't-test',
  agility_5105: '5-10-5-agility',
  illinois_agility: 'illinois-agility',
  arrowhead_agility: 'arrowhead-agility',
  vo2max: 'yoyo-ir1',
  reaction_time: 'reaction-time',
  squat_rel: '1rm-squat',
  grip_strength: 'grip-strength',
  body_fat_pct: 'body-fat',
  hrv_rmssd: 'hrv',
};

interface Props {
  metrics: OutputSnapshot['metrics'];
  onTestLogged?: () => void;
  /** When set, logs tests via coach API (creates suggestion + notification for player) */
  targetPlayerId?: string;
  /** Phase 4: sport for the empty-state CTA. Defaults to generic copy if unset. */
  sport?: string | null;
}

/**
 * First-test suggestion per sport (matches seedWarmLanding in the
 * backend so the Own It rec and the Metrics CTA point at the same
 * thing). Keep synchronised.
 */
const FIRST_TEST_BY_SPORT: Record<string, { name: string; note: string }> = {
  football: { name: '20-metre sprint', note: '30 seconds, no warm-up needed.' },
  soccer: { name: '20-metre sprint', note: '30 seconds, no warm-up needed.' },
  basketball: { name: 'Standing vertical jump', note: 'Jump as high as you can, three tries.' },
  tennis: { name: 'T-test agility', note: 'A 3-direction sprint pattern.' },
  padel: { name: 'T-test agility', note: 'A 3-direction sprint pattern.' },
};

export function MetricsSection({ metrics, onTestLogged, targetPlayerId, sport }: Props) {
  const { colors } = useTheme();
  const recentTests = metrics.recentTests ?? [];
  const rawTestGroups = metrics.rawTestGroups ?? [];
  // Find tests not in any raw test group (ungrouped)
  const groupedTestTypes = new Set(rawTestGroups.flatMap((g) => g.tests.map((t) => t.testType)));
  const ungroupedTests = recentTests.filter((t) => !groupedTestTypes.has(t.testType));

  // ── Smart search state ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<TestCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pendingTest, setPendingTest] = useState<TestCatalogItem | null>(null);
  const [pendingValue, setPendingValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    // For coach mode, show all tests even on empty query
    if (!q.trim() && !targetPlayerId) { setCatalogResults([]); return; }

    searchTimerRef.current = setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const data = await searchTestCatalog(q || undefined);
        setCatalogResults(data.tests);
      } catch { setCatalogResults([]); }
      finally { setCatalogLoading(false); }
    }, q.trim() ? 250 : 50); // faster for empty query (load all)
  }, [targetPlayerId]);

  // Auto-load all tests for coach on focus
  const handleSearchFocus = useCallback(() => {
    setSearchFocused(true);
    if (targetPlayerId && catalogResults.length === 0 && !searchQuery) {
      // Load full catalog for coaches
      (async () => {
        setCatalogLoading(true);
        try {
          const data = await searchTestCatalog();
          setCatalogResults(data.tests);
        } catch { /* silent */ }
        finally { setCatalogLoading(false); }
      })();
    }
  }, [targetPlayerId, catalogResults.length, searchQuery]);

  const handleSelectTest = useCallback((item: TestCatalogItem) => {
    setPendingTest(item);
    setPendingValue('');
    setSearchQuery('');
    setCatalogResults([]);
    setSearchFocused(false);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleSavePending = useCallback(async () => {
    console.log('[MetricsSection] Save pressed', { pendingTest: pendingTest?.id, pendingValue, trimmed: pendingValue.trim() });
    if (!pendingTest || !pendingValue.trim()) {
      console.warn('[MetricsSection] Save aborted — no test or empty value', { hasTest: !!pendingTest, value: pendingValue });
      return;
    }
    const numVal = parseFloat(pendingValue);
    if (isNaN(numVal)) {
      if (Platform.OS === 'web') window.alert('Please enter a valid number.');
      else Alert.alert('Invalid', 'Please enter a valid number.');
      return;
    }

    setSubmitting(true);
    try {
      if (targetPlayerId) {
        // Coach mode: use coach API → creates suggestion + notification for player
        await submitPlayerTest(targetPlayerId, {
          testType: pendingTest.id,
          sport: 'football',
          values: { primaryValue: numVal, unit: pendingTest.unit },
        });
      } else {
        // Player mode: log for self
        await logTestResult({
          testType: pendingTest.id,
          score: numVal,
          unit: pendingTest.unit,
          date: new Date().toISOString().slice(0, 10),
        });
      }
      console.log('[MetricsSection] Test saved successfully! Refreshing...');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPendingTest(null);
      setPendingValue('');
      emitRefresh('metrics');
      emitRefresh('recommendations');
      emitRefresh('notifications');
      // Small delay to let the event processor + benchmark write complete before re-fetching
      await new Promise(r => setTimeout(r, 800));
      onTestLogged?.();
    } catch (e: any) {
      console.error('[MetricsSection] Test save failed:', e);
      if (Platform.OS === 'web') {
        window.alert('Could not save test result: ' + (e?.message || 'Unknown error'));
      } else {
        Alert.alert('Error', 'Could not save test result.');
      }
    } finally { setSubmitting(false); }
  }, [pendingTest, pendingValue, onTestLogged, targetPlayerId]);

  // Helper: log test via player or coach API
  const doLogTest = useCallback(async (testType: string, score: number, unit?: string) => {
    if (targetPlayerId) {
      await submitPlayerTest(targetPlayerId, {
        testType,
        sport: 'football',
        values: { primaryValue: score, unit: unit || '' },
      });
    } else {
      await logTestResult({
        testType,
        score,
        unit,
        date: new Date().toISOString().slice(0, 10),
      });
    }
  }, [targetPlayerId]);

  const showDropdown = searchFocused && (
    (searchQuery.length > 0 && (catalogResults.length > 0 || catalogLoading)) ||
    (targetPlayerId && catalogResults.length > 0) // Coach mode: show all on focus
  );

  return (
    <View style={styles.container}>
      {/* ── Inline Smart Search ───────────────────────────────── */}
      <View style={{ zIndex: 100 }}>
        <View style={[
          styles.searchBar,
          { backgroundColor: colors.cream06 },
        ]}>
          <SmartIcon name="search" size={18} color={searchFocused ? colors.tomoSage : colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.tomoCream }]}
            placeholder="Search tests... (sprint, jump, strength)"
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={handleSearch}
            onFocus={handleSearchFocus}
            onBlur={() => { setTimeout(() => setSearchFocused(false), 200); }}
          />
          {searchQuery !== '' && (
            <Pressable onPress={() => { handleSearch(''); setSearchFocused(false); }}>
              <SmartIcon name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {showDropdown && (
          <View style={[styles.dropdown, { backgroundColor: colors.cream06, borderColor: colors.cream10 }]}>
            {catalogLoading ? (
              <Loader style={{ paddingVertical: 20 }} />
            ) : (
              catalogResults.slice(0, 8).map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.dropdownItem,
                    { borderBottomColor: colors.cream10 },
                    pressed && { backgroundColor: colors.tomoSage + '10' },
                  ]}
                  onPress={() => handleSelectTest(item)}
                >
                  {item.emoji ? <Text style={{ fontSize: 18 }}>{item.emoji}</Text> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dropdownName, { color: colors.tomoCream }]}>{item.name}</Text>
                    <Text style={[styles.dropdownMeta, { color: colors.muted }]}>
                      {item.category} · {item.unit}
                    </Text>
                  </View>
                  <SmartIcon name="add-circle" size={22} color={colors.tomoSage} />
                </Pressable>
              ))
            )}
            {!catalogLoading && searchQuery && catalogResults.length === 0 && (
              <Text style={[styles.dropdownEmpty, { color: colors.muted }]}>No tests found</Text>
            )}
          </View>
        )}
      </View>

      {/* ── Pending Test Card ─────────────────────────────────── */}
      {pendingTest && (
        <GlassCard>
          <View style={styles.pendingHeader}>
            {pendingTest.emoji ? <Text style={{ fontSize: 20 }}>{pendingTest.emoji}</Text> : null}
            <View style={{ flex: 1 }}>
              <Text style={[styles.pendingName, { color: colors.tomoCream }]}>{pendingTest.name}</Text>
              <Text style={[styles.pendingMeta, { color: colors.muted }]}>
                {pendingTest.category} · {pendingTest.direction === 'higher' ? '↑ Higher is better' : '↓ Lower is better'}
              </Text>
            </View>
            <Pressable onPress={() => setPendingTest(null)} hitSlop={8}>
              <SmartIcon name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          <View style={styles.pendingInputRow}>
            <View style={[styles.valueInputWrap, { backgroundColor: colors.cream06, flex: 1 }]}>
              <TextInput
                style={[styles.valueInput, { color: colors.tomoCream }]}
                placeholder={`Value (${pendingTest.unit})`}
                placeholderTextColor={colors.muted}
                value={pendingValue}
                onChangeText={setPendingValue}
                keyboardType="decimal-pad"
                autoFocus
              />
              <Text style={[styles.unitLabel, { color: colors.muted }]}>{pendingTest.unit}</Text>
            </View>
            <Pressable
              style={[
                styles.inlineSaveBtn,
                { backgroundColor: colors.tomoSage, opacity: (submitting || !pendingValue.trim()) ? 0.5 : 1 },
              ]}
              onPress={handleSavePending}
              disabled={submitting || !pendingValue.trim()}
            >
              {submitting ? (
                <Loader size="sm" />
              ) : (
                <SmartIcon name="checkmark" size={20} color={colors.tomoCream} />
              )}
            </Pressable>
          </View>
        </GlassCard>
      )}


      {/* ── Raw Test Group Cards (when no benchmark snapshots) ── */}
      {rawTestGroups.length > 0 && metrics.categories.length === 0 && (
        <View style={{ gap: spacing.sm }}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>Your Tests by Category</Text>
          {rawTestGroups.map((group) => (
            <RawTestGroupCard key={group.groupId} group={group} colors={colors} onTestLogged={onTestLogged} logTest={doLogTest} />
          ))}
          {/* Ungrouped tests */}
          {ungroupedTests.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: spacing.xs }]}>Other Tests</Text>
              {ungroupedTests.map((t) => (
                <GlassCard key={t.testType}>
                  <View style={styles.rawTestRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={[styles.rawTestName, { color: colors.tomoCream }]}>
                          {t.testType.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </Text>
                        {(t as any).coachName && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.secondarySubtle, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9999 }}>
                            <SmartIcon name="person-circle-outline" size={10} color={colors.muted} />
                            <Text style={{ fontSize: 9, fontFamily: fontFamily.semiBold, color: colors.muted }}>
                              Coach {(t as any).coachName}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.rawTestMeta, { color: colors.muted }]}>
                        {t.date}{t.unit ? ` · ${t.unit}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.rawTestValue, { color: colors.tomoSage }]}>{t.score}</Text>
                  </View>
                </GlassCard>
              ))}
            </>
          )}
        </View>
      )}

      {/* ── Empty State ───────────────────────────────────────── */}
      {metrics.categories.length === 0 && rawTestGroups.length === 0 && recentTests.length === 0 && (() => {
        const suggestion = sport ? FIRST_TEST_BY_SPORT[sport] : null;
        return (
          <GlassCard>
            <View style={styles.emptyState}>
              <SmartIcon name="analytics-outline" size={40} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.tomoCream }]}>
                {suggestion ? 'Start with one test' : 'No Test Data Yet'}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                {suggestion ? (
                  <>
                    A great first test for you is a{' '}
                    <Text style={{ color: colors.tomoSage, fontFamily: fontFamily.semiBold }}>
                      {suggestion.name}
                    </Text>
                    . {suggestion.note} Search for it above to log your first result.
                  </>
                ) : (
                  'Search above and log your first test to see your DNA.'
                )}
              </Text>
            </View>
          </GlassCard>
        );
      })()}

      {/* ── Orbit Altitude — categories with benchmarks ───────── */}
      {metrics.categories.length > 0 && (
        <OrbitMetrics
          categories={metrics.categories}
          onTestLogged={onTestLogged}
          logTest={doLogTest}
        />
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
// ORBIT ALTITUDE — Rating-as-altitude redesign
// Tiers: 1 Needs Attention → 5 Elite. Lowest tier = most urgent =
// "closest orbit." Categories sort ascending; sphere shows composite.
// ══════════════════════════════════════════════════════════════════

type Tier = 1 | 2 | 3 | 4 | 5;

const TIERS: readonly string[] = [
  'Needs Attention',
  'Developing',
  'Solid',
  'Strong',
  'Elite',
];

const TIER_COLORS: readonly string[] = [
  colors.error,       // 1 · Needs Attention
  colors.tomoClay,    // 2 · Developing
  colors.body,        // 3 · Solid
  colors.accentLight, // 4 · Strong
  colors.accent,      // 5 · Elite
];

function zoneToTier(zone: string | undefined | null): Tier {
  switch (zone) {
    case 'elite':      return 5;
    case 'good':       return 4;
    case 'average':    return 3;
    case 'developing': return 2;
    default:           return 1;
  }
}

function percentileToTier(p: number | null | undefined): Tier {
  if (p == null || !Number.isFinite(p)) return 1;
  if (p >= 90) return 5;
  if (p >= 75) return 4;
  if (p >= 40) return 3;
  if (p >= 20) return 2;
  return 1;
}

function categoryTier(cat: TestGroupCategory): Tier {
  if (!cat.metrics || cat.metrics.length === 0) {
    return percentileToTier(cat.categoryAvgPercentile);
  }
  return Math.min(...cat.metrics.map((m) => zoneToTier(m.zone))) as Tier;
}

function categoryPhaseLabel(tier: Tier): string {
  if (tier <= 2) return 'Needs Attention';
  if (tier === 3) return 'Developing';
  if (tier === 4) return 'On Track';
  return 'Elite';
}

function testStatusLabel(tier: Tier): string {
  if (tier <= 2) return 'Needs Attention';
  return TIERS[tier - 1] ?? 'Solid';
}

function formatThreshold(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

// ── Sphere glyph ────────────────────────────────────────────────────
function Sphere({ size = 22 }: { size?: number }) {
  const id = useMemo(() => `sph-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${id}-core`} cx="38%" cy="32%" r="70%">
          <Stop offset="0%"   stopColor="#C8DCC3" />
          <Stop offset="35%"  stopColor="#9AB896" />
          <Stop offset="75%"  stopColor="#7A9B76" />
          <Stop offset="100%" stopColor="#5E7A5B" />
        </RadialGradient>
        <RadialGradient id={`${id}-hl`} cx="35%" cy="28%" r="30%">
          <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity={0.55} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={26} fill={`url(#${id}-core)`} />
      <Circle cx={50} cy={50} r={26} fill={`url(#${id}-hl)`} />
    </Svg>
  );
}

// ── 5-dot altitude indicator ─────────────────────────────────────────
// Tier 5 = all 5 lit, tier 1 = 1 dot lit. Top dot glows on web.
function Altitude5({ tier }: { tier: Tier }) {
  const litColor = TIER_COLORS[tier - 1];
  return (
    <View style={orbitStyles.altitudeCol}>
      {[5, 4, 3, 2, 1].map((i) => {
        const lit = i <= tier;
        const isTop = i === tier;
        return (
          <View
            key={i}
            style={[
              orbitStyles.altitudeDot,
              { backgroundColor: lit ? litColor : colors.cream10 },
              isTop && Platform.OS === 'web'
                ? ({ boxShadow: `0 0 6px ${litColor}` } as any)
                : null,
            ]}
          />
        );
      })}
    </View>
  );
}

// ── Horizontal tier scale ────────────────────────────────────────────
function TierScale({
  tier,
  thresholds,
}: {
  tier: Tier;
  thresholds: Array<number | null | undefined>;
}) {
  const tierColor = TIER_COLORS[tier - 1];
  return (
    <View style={orbitStyles.scaleWrap}>
      <View style={orbitStyles.scaleTrack}>
        <View
          style={[
            orbitStyles.scaleFill,
            { width: `${(tier / 5) * 100}%` as any, backgroundColor: tierColor },
          ]}
        />
        <View
          style={[
            orbitStyles.scaleMarker,
            {
              left: `${((tier - 0.5) / 5) * 100}%` as any,
              backgroundColor: tierColor,
              borderColor: colors.background,
              ...(Platform.OS === 'web'
                ? ({ boxShadow: `0 0 8px ${tierColor}` } as any)
                : null),
            },
          ]}
        />
      </View>
      <View style={orbitStyles.scaleLabels}>
        {TIERS.map((label, i) => {
          const active = i === tier - 1;
          const c = active ? TIER_COLORS[i] : colors.cream50;
          return (
            <View key={label} style={orbitStyles.scaleLabelCol}>
              <Text
                numberOfLines={2}
                style={[
                  orbitStyles.scaleLabelText,
                  { color: c, fontFamily: active ? fontFamily.semiBold : fontFamily.medium },
                ]}
              >
                {label}
              </Text>
              <Text style={[orbitStyles.scaleThreshold, { color: active ? c : colors.cream15 }]}>
                {formatThreshold(thresholds[i])}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Orbit wrapper: sphere header + urgent-first list ─────────────────
function OrbitMetrics({
  categories,
  onTestLogged,
  logTest,
}: {
  categories: TestGroupCategory[];
  onTestLogged?: () => void;
  logTest: (testType: string, score: number, unit?: string) => Promise<void>;
}) {
  const sorted = useMemo(
    () => [...categories].sort((a, b) => categoryTier(a) - categoryTier(b)),
    [categories],
  );
  const [openId, setOpenId] = useState<string | null>(() => {
    const first = sorted[0];
    return first ? (first.groupId || first.category) : null;
  });
  const avgTier = useMemo<Tier>(() => {
    if (sorted.length === 0) return 3;
    const sum = sorted.reduce((s, c) => s + categoryTier(c), 0);
    return Math.max(1, Math.min(5, Math.round(sum / sorted.length))) as Tier;
  }, [sorted]);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={orbitStyles.spherePlate}>
        <Sphere size={22} />
        <Text style={orbitStyles.sphereLabel}>
          NOW · READINESS{' '}
          <Text style={{ color: TIER_COLORS[avgTier - 1], fontFamily: fontFamily.semiBold }}>
            {TIERS[avgTier - 1].toUpperCase()}
          </Text>
        </Text>
      </View>

      <Text style={orbitStyles.orbitHeader}>
        IN ORBIT · {sorted.length} {sorted.length === 1 ? 'CATEGORY' : 'CATEGORIES'}
      </Text>

      <View style={{ gap: 10 }}>
        {sorted.map((cat) => {
          const key = cat.groupId || cat.category;
          return (
            <OrbitCategoryCard
              key={key}
              category={cat}
              open={openId === key}
              onToggle={() => setOpenId(openId === key ? null : key)}
              onTestLogged={onTestLogged}
              logTest={logTest}
            />
          );
        })}
      </View>
    </View>
  );
}

// ── Category card — altitude indicator + collapsible test list ───────
function OrbitCategoryCard({
  category,
  open,
  onToggle,
  onTestLogged,
  logTest,
}: {
  category: TestGroupCategory;
  open: boolean;
  onToggle: () => void;
  onTestLogged?: () => void;
  logTest: (testType: string, score: number, unit?: string) => Promise<void>;
}) {
  const tier = categoryTier(category);
  const tierColor = TIER_COLORS[tier - 1];
  const urgentCount = category.metrics.filter((m) => zoneToTier(m.zone) <= 2).length;

  const [activeMetricKey, setActiveMetricKey] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<'history' | 'logNew' | null>(null);
  const [historyData, setHistoryData] = useState<MyTestResult[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = useCallback(async (catalogId: string) => {
    setHistoryLoading(true);
    try {
      const data = await getMyTestResults(50, catalogId);
      setHistoryData(data.results);
    } catch {
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleShowHistory = useCallback((metricKey: string) => {
    if (activeMetricKey === metricKey && activeMode === 'history') {
      setActiveMetricKey(null); setActiveMode(null); return;
    }
    setActiveMetricKey(metricKey);
    setActiveMode('history');
    fetchHistory(METRIC_TO_CATALOG[metricKey] || metricKey);
  }, [activeMetricKey, activeMode, fetchHistory]);

  const handleLogNew = useCallback((metricKey: string) => {
    if (activeMetricKey === metricKey && activeMode === 'logNew') {
      setActiveMetricKey(null); setActiveMode(null); return;
    }
    setActiveMetricKey(metricKey);
    setActiveMode('logNew');
  }, [activeMetricKey, activeMode]);

  const handleEdit = useCallback((metricKey: string) => {
    setActiveMetricKey(metricKey);
    setActiveMode('logNew');
  }, []);

  const handleDelete = useCallback(async (
    metricKey: string, metricLabel: string, value: number, unit: string,
  ) => {
    const msg = `Delete ${metricLabel} (${value} ${unit})?`;
    const doDelete = async () => {
      try {
        await deleteTestResult(metricKey);
        emitRefresh('metrics');
        emitRefresh('recommendations');
        emitRefresh('notifications');
        await new Promise((r) => setTimeout(r, 500));
        onTestLogged?.();
      } catch (e: any) {
        if (Platform.OS === 'web') window.alert('Could not delete: ' + (e?.message || 'Unknown error'));
        else Alert.alert('Error', 'Could not delete test result.');
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) await doDelete();
    } else {
      Alert.alert('Delete Test', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { void doDelete(); } },
      ]);
    }
  }, [onTestLogged]);

  return (
    <View style={orbitStyles.row}>
      <View style={orbitStyles.altitudeSlot}>
        <Altitude5 tier={tier} />
      </View>

      <View style={orbitStyles.card}>
        <Pressable onPress={onToggle}>
          <View style={orbitStyles.cardHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={orbitStyles.catTitle} numberOfLines={2}>
                {category.emoji ? `${category.emoji} ` : ''}
                {category.category}
              </Text>
              {!open && (
                <Text style={orbitStyles.catMeta}>
                  {category.metrics.length} test{category.metrics.length === 1 ? '' : 's'}
                  {urgentCount > 0 && (
                    <Text style={{ color: colors.error }}>
                      {'  ·  '}{urgentCount} need{urgentCount === 1 ? 's' : ''} attention
                    </Text>
                  )}
                </Text>
              )}
            </View>
            <View
              style={[
                orbitStyles.phasePill,
                { backgroundColor: tierColor + '22', borderColor: tierColor + '66' },
              ]}
            >
              <Text style={[orbitStyles.phasePillText, { color: tierColor }]}>
                {categoryPhaseLabel(tier)}
              </Text>
            </View>
            <SmartIcon
              name={open ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.cream50}
              style={{ marginLeft: 6 }}
            />
          </View>
        </Pressable>

        {open && (
          <View>
            {category.athleteDescription ? (
              <Text style={orbitStyles.catDesc}>{category.athleteDescription}</Text>
            ) : null}
            <View style={{ marginTop: 12 }}>
              {category.metrics.map((m, i) => (
                <View key={m.metricKey}>
                  <OrbitTestBlock
                    benchmark={m}
                    first={i === 0}
                    onShowHistory={() => handleShowHistory(m.metricKey)}
                    onLogNew={() => handleLogNew(m.metricKey)}
                    onEdit={() => handleEdit(m.metricKey)}
                    onDelete={() => handleDelete(m.metricKey, m.metricLabel, m.value, m.unit)}
                  />
                  {activeMetricKey === m.metricKey && activeMode === 'logNew' && (
                    <InlineTestInput
                      testType={METRIC_TO_CATALOG[m.metricKey] || m.metricKey}
                      unit={m.unit}
                      currentValue={m.value}
                      onSave={async (score) => {
                        await logTest(METRIC_TO_CATALOG[m.metricKey] || m.metricKey, score, m.unit);
                        setActiveMode(null);
                        setActiveMetricKey(null);
                        await new Promise((r) => setTimeout(r, 800));
                        onTestLogged?.();
                      }}
                      onCancel={() => { setActiveMode(null); setActiveMetricKey(null); }}
                    />
                  )}
                  {activeMetricKey === m.metricKey && activeMode === 'history' && (
                    <TestHistoryTimeline
                      history={historyData}
                      unit={m.unit}
                      direction={m.direction === 'lower_better' ? 'lower' : 'higher'}
                      loading={historyLoading}
                      onClose={() => { setActiveMode(null); setActiveMetricKey(null); }}
                    />
                  )}
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Test block — name, value, actions, tier scale, advice ────────────
function OrbitTestBlock({
  benchmark,
  first,
  onShowHistory,
  onLogNew,
  onEdit,
  onDelete,
}: {
  benchmark: BenchmarkResult;
  first: boolean;
  onShowHistory: () => void;
  onLogNew: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tier = zoneToTier(benchmark.zone);
  const tierColor = TIER_COLORS[tier - 1];
  const thresholds = [
    benchmark.norm?.p10,
    benchmark.norm?.p25,
    benchmark.norm?.p50,
    benchmark.norm?.p75,
    benchmark.norm?.p90,
  ];

  return (
    <View
      style={[
        orbitStyles.testBlock,
        !first
          ? { borderTopWidth: 1, borderTopColor: colors.cream06, paddingTop: 14, marginTop: 14 }
          : null,
      ]}
    >
      <View style={orbitStyles.testTopRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={orbitStyles.testName} numberOfLines={1}>{benchmark.metricLabel}</Text>
          <Text style={[orbitStyles.testValue, { color: tierColor }]}>
            {benchmark.value}{benchmark.unit ? ` ${benchmark.unit}` : ''}
          </Text>
        </View>
        <View style={orbitStyles.actionsRow}>
          <Pressable onPress={onShowHistory} hitSlop={8} style={orbitStyles.actionBtn}>
            <SmartIcon name="time-outline" size={16} color={colors.cream50} />
          </Pressable>
          <Pressable onPress={onLogNew} hitSlop={8} style={orbitStyles.actionBtn}>
            <SmartIcon name="add-circle-outline" size={16} color={colors.accent} />
          </Pressable>
          <Pressable onPress={onEdit} hitSlop={8} style={orbitStyles.actionBtn}>
            <SmartIcon name="create-outline" size={15} color={colors.cream50} />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} style={orbitStyles.actionBtn}>
            <SmartIcon name="trash-outline" size={15} color={colors.error} />
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: 8, flexDirection: 'row' }}>
        <View
          style={[
            orbitStyles.statusPill,
            { backgroundColor: tierColor + '22', borderColor: tierColor + '66' },
          ]}
        >
          <Text style={[orbitStyles.statusPillText, { color: tierColor }]}>
            {testStatusLabel(tier)}
          </Text>
        </View>
      </View>

      <TierScale tier={tier} thresholds={thresholds} />

      {benchmark.message ? (
        <Text style={orbitStyles.testAdvice}>{benchmark.message}</Text>
      ) : null}
    </View>
  );
}

// ── Orbit StyleSheet ─────────────────────────────────────────────────
const orbitStyles = StyleSheet.create({
  spherePlate: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
    paddingBottom: 2,
  },
  sphereLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.8,
    color: colors.cream50,
    textAlign: 'center',
  },
  orbitHeader: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.cream50,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  altitudeSlot: {
    width: 10,
    paddingTop: 18,
    alignItems: 'center',
  },
  altitudeCol: {
    alignItems: 'center',
    gap: 4,
  },
  altitudeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: colors.cream03,
    borderWidth: 1,
    borderColor: colors.cream10,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.tomoCream,
    letterSpacing: -0.2,
  },
  catMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.cream50,
    marginTop: 3,
  },
  catDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.body,
    lineHeight: 18,
    marginTop: 12,
  },
  phasePill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  phasePillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.1,
  },
  testBlock: {},
  testTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  testName: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.tomoCream,
    letterSpacing: -0.15,
  },
  testValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    padding: 2,
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  statusPillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.1,
  },
  scaleWrap: {
    marginTop: 10,
  },
  scaleTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.cream06,
    overflow: 'hidden',
    position: 'relative',
  },
  scaleFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    opacity: 0.9,
  },
  scaleMarker: {
    position: 'absolute',
    top: '50%',
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: -5,
    marginLeft: -5,
    borderWidth: 1.5,
  },
  scaleLabels: {
    marginTop: 6,
    flexDirection: 'row',
  },
  scaleLabelCol: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  scaleLabelText: {
    fontSize: 8.5,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  scaleThreshold: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
    marginTop: 2,
    textAlign: 'center',
  },
  testAdvice: {
    marginTop: 10,
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    color: colors.cream50,
    lineHeight: 17,
  },
});

// ── Raw Test Group Card (no percentiles, just values) ────────────────────

function RawTestGroupCard({ group, colors, onTestLogged, logTest }: {
  group: RawTestGroup;
  colors: any;
  onTestLogged?: () => void;
  logTest: (testType: string, score: number, unit?: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const themeColor = getGroupThemeColor(group.colorTheme || 'orange');

  // Per-test interaction state
  const [activeTestType, setActiveTestType] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<'history' | 'logNew' | null>(null);
  const [historyData, setHistoryData] = useState<MyTestResult[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = useCallback(async (testType: string) => {
    setHistoryLoading(true);
    try {
      const data = await getMyTestResults(50, testType);
      setHistoryData(data.results);
    } catch {
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Top 2 tests for collapsed preview
  const previewTests = group.tests.slice(0, 2);

  return (
    <GlassCard>
      {/* Header — tap to expand/collapse */}
      <Pressable onPress={() => setExpanded(!expanded)}>
        <View style={styles.groupHeader}>
          {group.emoji ? <Text style={styles.groupEmoji}>{group.emoji}</Text> : null}
          <View style={{ flex: 1 }}>
            <Text style={[styles.groupName, { color: colors.tomoCream }]}>{group.displayName}</Text>
          </View>
          <View style={[styles.rawCountBadge, { backgroundColor: themeColor + '22' }]}>
            <Text style={[styles.rawCountText, { color: themeColor }]}>
              {group.tests.length} test{group.tests.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <SmartIcon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.muted}
            style={{ marginLeft: 4 }}
          />
        </View>
      </Pressable>

      {/* Preview chips removed — collapsed cards show header only */}

        {/* Expanded: description + all tests with values + action icons */}
        {expanded && (
          <View style={styles.expandedTests}>
            <Text style={[styles.groupDesc, { color: colors.muted }]}>
              {group.athleteDescription}
            </Text>
            {group.tests.map((t) => (
              <View key={t.testType}>
                <View style={styles.rawExpandedRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={[styles.rawExpandedName, { color: colors.tomoCream }]}>{t.displayName}</Text>
                      {(t as any).coachName && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.secondarySubtle, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9999 }}>
                          <SmartIcon name="person-circle-outline" size={10} color={colors.muted} />
                          <Text style={{ fontSize: 9, fontFamily: fontFamily.semiBold, color: colors.muted }}>
                            Coach {(t as any).coachName}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.rawExpandedDate, { color: colors.muted }]}>{t.date}</Text>
                  </View>
                  <View style={styles.rawActionIcons}>
                    <Pressable
                      onPress={() => {
                        if (activeTestType === t.testType && activeMode === 'history') {
                          setActiveTestType(null); setActiveMode(null); return;
                        }
                        setActiveTestType(t.testType);
                        setActiveMode('history');
                        fetchHistory(t.testType);
                      }}
                      hitSlop={8}
                      style={styles.rawActionBtn}
                    >
                      <SmartIcon name="time-outline" size={16} color={colors.muted} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (activeTestType === t.testType && activeMode === 'logNew') {
                          setActiveTestType(null); setActiveMode(null); return;
                        }
                        setActiveTestType(t.testType);
                        setActiveMode('logNew');
                      }}
                      hitSlop={8}
                      style={styles.rawActionBtn}
                    >
                      <SmartIcon name="add-circle-outline" size={16} color={colors.tomoSage} />
                    </Pressable>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.rawExpandedValue, { color: themeColor }]}>
                      {t.score}
                    </Text>
                    {t.unit ? (
                      <Text style={[styles.rawExpandedUnit, { color: colors.muted }]}>{t.unit}</Text>
                    ) : null}
                  </View>
                </View>

                {/* Inline log-new input */}
                {activeTestType === t.testType && activeMode === 'logNew' && (
                  <InlineTestInput
                    testType={t.testType}
                    unit={t.unit || ''}
                    currentValue={t.score}
                    onSave={async (score) => {
                      await logTest(t.testType, score, t.unit || undefined);
                      setActiveMode(null);
                      setActiveTestType(null);
                      onTestLogged?.();
                    }}
                    onCancel={() => { setActiveMode(null); setActiveTestType(null); }}
                  />
                )}

                {/* History timeline */}
                {activeTestType === t.testType && activeMode === 'history' && (
                  <TestHistoryTimeline
                    history={historyData}
                    unit={t.unit || ''}
                    direction="higher"
                    loading={historyLoading}
                    onClose={() => { setActiveMode(null); setActiveTestType(null); }}
                  />
                )}
              </View>
            ))}
            {/* Hint to get benchmarks */}
            <View style={[styles.benchmarkHint, { backgroundColor: colors.tomoSage + '10' }]}>
              <SmartIcon name="bulb-outline" size={14} color={colors.tomoSage} />
              <Text style={[styles.benchmarkHintText, { color: colors.tomoSage }]}>
                Log more tests to unlock percentile rankings
              </Text>
            </View>
          </View>
        )}
    </GlassCard>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { gap: spacing.sm },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.cream10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    padding: 0,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    marginTop: 4,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.3)' } : {}),
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  dropdownName: { fontFamily: fontFamily.medium, fontSize: 14 },
  dropdownMeta: { fontFamily: fontFamily.regular, fontSize: 11, marginTop: 1 },
  dropdownEmpty: { fontFamily: fontFamily.regular, fontSize: 13, textAlign: 'center', paddingVertical: 16 },

  // Pending test
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.sm,
  },
  pendingName: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  pendingMeta: { fontFamily: fontFamily.regular, fontSize: 11, marginTop: 1 },
  pendingInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  valueInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0,
    borderRadius: borderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'web' ? 8 : 6,
    gap: 6,
  },
  valueInput: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 16,
    padding: 0,
  },
  unitLabel: { fontFamily: fontFamily.regular, fontSize: 12 },
  inlineSaveBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Radar hero

  // Raw tests
  sectionLabel: { fontFamily: fontFamily.regular, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'rgba(245,243,237,0.35)' },
  rawTestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rawTestName: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  rawTestMeta: { fontFamily: fontFamily.regular, fontSize: 11, marginTop: 2 },
  rawTestValue: { fontFamily: fontFamily.semiBold, fontSize: 20 },

  // Raw test group cards (RawTestGroupCard still uses these)
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupEmoji: { fontSize: 20 },
  groupName: { fontFamily: fontFamily.semiBold, fontSize: 14, letterSpacing: -0.2 },
  groupDesc: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 2 },
  expandedTests: { marginTop: spacing.sm, gap: spacing.xs },

  // Raw test group cards
  rawCountBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  rawCountText: { fontFamily: fontFamily.semiBold, fontSize: 11 },
  rawExpandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cream10,
  },
  rawActionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 8,
  },
  rawActionBtn: {
    padding: 2,
  },
  rawExpandedName: { fontFamily: fontFamily.medium, fontSize: 14 },
  rawExpandedDate: { fontFamily: fontFamily.regular, fontSize: 11, marginTop: 2 },
  rawExpandedValue: { fontFamily: fontFamily.semiBold, fontSize: 18 },
  rawExpandedUnit: { fontFamily: fontFamily.regular, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' as const, marginTop: 1 },
  benchmarkHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  benchmarkHintText: { fontFamily: fontFamily.medium, fontSize: 12, flex: 1 },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.huge,
    gap: spacing.sm,
  },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  emptySubtitle: { fontFamily: fontFamily.regular, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.lg },
});
