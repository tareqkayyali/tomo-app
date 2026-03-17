/**
 * MetricsSection — Gen Z redesign with FIFA-style RadarCard hero,
 * 7 TestGroupCards, and preserved inline smart search for logging tests.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { GlassCard } from '../GlassCard';
import { GlowWrapper } from '../GlowWrapper';
import { HexagonRadar, type RadarAttribute } from '../HexagonRadar';
import { PercentileBar } from '../benchmarks/PercentileBar';
import { TestHistoryTimeline } from './TestHistoryTimeline';
import { InlineTestInput } from './InlineTestInput';
import {
  searchTestCatalog,
  logTestResult,
  getMyTestResults,
  type TestCatalogItem,
  type MyTestResult,
} from '../../services/api';
import type { OutputSnapshot, TestGroupCategory, RawTestGroup } from '../../services/api';
import { getZoneColor, getZoneLabel, getGroupThemeColor } from './outputTypes';

// ── Reverse mapping: metric key → catalog test type ────────────────────
// Inverse of backend's CATALOG_TO_METRIC. Uses the primary catalog ID for each metric.
const METRIC_TO_CATALOG: Record<string, string> = {
  sprint_10m: '10m-sprint',
  sprint_20m: '20m-sprint',
  sprint_30m: '30m-sprint',
  est_max_speed: 'flying-10m',
  cmj: 'cmj',
  broad_jump: 'broad-jump',
  agility_505: '5-0-5',
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
}

export function MetricsSection({ metrics, onTestLogged }: Props) {
  const { colors } = useTheme();
  const recentTests = metrics.recentTests ?? [];
  const radarProfile = metrics.radarProfile ?? [];
  const rawTestGroups = metrics.rawTestGroups ?? [];
  const hasRadar = radarProfile.some((a) => a.value > 0);

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
    if (!q.trim()) { setCatalogResults([]); return; }

    searchTimerRef.current = setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const data = await searchTestCatalog(q);
        setCatalogResults(data.tests);
      } catch { setCatalogResults([]); }
      finally { setCatalogLoading(false); }
    }, 250);
  }, []);

  const handleSelectTest = useCallback((item: TestCatalogItem) => {
    setPendingTest(item);
    setPendingValue('');
    setSearchQuery('');
    setCatalogResults([]);
    setSearchFocused(false);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleSavePending = useCallback(async () => {
    if (!pendingTest || !pendingValue.trim()) return;
    const numVal = parseFloat(pendingValue);
    if (isNaN(numVal)) { Alert.alert('Invalid', 'Please enter a valid number.'); return; }

    setSubmitting(true);
    try {
      await logTestResult({
        testType: pendingTest.id,
        score: numVal,
        unit: pendingTest.unit,
        date: new Date().toISOString().slice(0, 10),
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPendingTest(null);
      setPendingValue('');
      onTestLogged?.();
    } catch { Alert.alert('Error', 'Could not save test result.'); }
    finally { setSubmitting(false); }
  }, [pendingTest, pendingValue, onTestLogged]);

  const showDropdown = searchFocused && searchQuery.length > 0 && (catalogResults.length > 0 || catalogLoading);

  // Map radar profile to HexagonRadar attributes
  const radarAttributes: RadarAttribute[] = radarProfile.map((a) => ({
    key: a.key,
    label: a.label,
    value: a.value,
    maxValue: a.maxValue,
    color: a.color,
  }));

  return (
    <View style={styles.container}>
      {/* ── Inline Smart Search ───────────────────────────────── */}
      <View style={{ zIndex: 100 }}>
        <View style={[
          styles.searchBar,
          { backgroundColor: colors.inputBackground || colors.backgroundElevated },
        ]}>
          <Ionicons name="search" size={18} color={searchFocused ? colors.accent1 : colors.textInactive} />
          <TextInput
            style={[styles.searchInput, { color: colors.textOnDark }]}
            placeholder="Search tests... (sprint, jump, strength)"
            placeholderTextColor={colors.textInactive}
            value={searchQuery}
            onChangeText={handleSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => { setTimeout(() => setSearchFocused(false), 200); }}
          />
          {searchQuery !== '' && (
            <Pressable onPress={() => { handleSearch(''); setSearchFocused(false); }}>
              <Ionicons name="close-circle" size={18} color={colors.textInactive} />
            </Pressable>
          )}
        </View>

        {showDropdown && (
          <View style={[styles.dropdown, { backgroundColor: colors.backgroundElevated, borderColor: colors.glassBorder }]}>
            {catalogLoading ? (
              <ActivityIndicator color={colors.accent1} style={{ paddingVertical: 20 }} />
            ) : (
              catalogResults.slice(0, 8).map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.dropdownItem,
                    { borderBottomColor: colors.glassBorder },
                    pressed && { backgroundColor: colors.accent1 + '10' },
                  ]}
                  onPress={() => handleSelectTest(item)}
                >
                  <Text style={{ fontSize: 18 }}>{item.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dropdownName, { color: colors.textOnDark }]}>{item.name}</Text>
                    <Text style={[styles.dropdownMeta, { color: colors.textInactive }]}>
                      {item.category} · {item.unit}
                    </Text>
                  </View>
                  <Ionicons name="add-circle" size={22} color={colors.accent1} />
                </Pressable>
              ))
            )}
            {!catalogLoading && searchQuery && catalogResults.length === 0 && (
              <Text style={[styles.dropdownEmpty, { color: colors.textInactive }]}>No tests found</Text>
            )}
          </View>
        )}
      </View>

      {/* ── Pending Test Card ─────────────────────────────────── */}
      {pendingTest && (
        <GlassCard>
          <View style={styles.pendingHeader}>
            <Text style={{ fontSize: 20 }}>{pendingTest.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pendingName, { color: colors.textOnDark }]}>{pendingTest.name}</Text>
              <Text style={[styles.pendingMeta, { color: colors.textInactive }]}>
                {pendingTest.category} · {pendingTest.direction === 'higher' ? '↑ Higher is better' : '↓ Lower is better'}
              </Text>
            </View>
            <Pressable onPress={() => setPendingTest(null)} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <View style={styles.pendingInputRow}>
            <View style={[styles.valueInputWrap, { backgroundColor: colors.inputBackground || colors.backgroundElevated, flex: 1 }]}>
              <TextInput
                style={[styles.valueInput, { color: colors.textOnDark }]}
                placeholder={`Value (${pendingTest.unit})`}
                placeholderTextColor={colors.textInactive}
                value={pendingValue}
                onChangeText={setPendingValue}
                keyboardType="decimal-pad"
                autoFocus
              />
              <Text style={[styles.unitLabel, { color: colors.textMuted }]}>{pendingTest.unit}</Text>
            </View>
            <Pressable
              style={[
                styles.inlineSaveBtn,
                { backgroundColor: colors.accent1, opacity: (submitting || !pendingValue.trim()) ? 0.5 : 1 },
              ]}
              onPress={handleSavePending}
              disabled={submitting || !pendingValue.trim()}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Ionicons name="checkmark" size={20} color="#FFF" />
              )}
            </Pressable>
          </View>
        </GlassCard>
      )}

      {/* ── FIFA-Style Radar Hero Card ────────────────────────── */}
      {hasRadar && (
        <GlowWrapper glow="orange">
          <GlassCard>
            <View style={styles.radarCenter}>
              <Text style={[styles.radarTitle, { color: colors.textOnDark }]}>Your Football DNA</Text>
              <HexagonRadar
                attributes={radarAttributes}
                size={200}
                animate
                fillColor="#FF6B35"
                fillOpacity={0.2}
              />
              {/* Overall percentile badge */}
              {metrics.overallPercentile != null && (
                <View style={[styles.overallBadge, { backgroundColor: getZoneColor(metrics.overallPercentile) + '22' }]}>
                  <Text style={[styles.overallBadgeText, { color: getZoneColor(metrics.overallPercentile) }]}>
                    P{metrics.overallPercentile} · {getZoneLabel(metrics.overallPercentile)}
                  </Text>
                </View>
              )}
              {/* Strengths & Gaps chips */}
              <View style={styles.chipRow}>
                {metrics.strengths.slice(0, 3).map((s) => (
                  <View key={s} style={[styles.chip, { backgroundColor: 'rgba(48, 209, 88, 0.15)' }]}>
                    <Text style={[styles.chipText, { color: '#30D158' }]}>{s}</Text>
                  </View>
                ))}
                {metrics.gaps.slice(0, 3).map((g) => (
                  <View key={g} style={[styles.chip, { backgroundColor: 'rgba(255, 149, 0, 0.15)' }]}>
                    <Text style={[styles.chipText, { color: '#FF9500' }]}>{g}</Text>
                  </View>
                ))}
              </View>
            </View>
          </GlassCard>
        </GlowWrapper>
      )}

      {/* ── Raw Test Group Cards (when no benchmark snapshots) ── */}
      {rawTestGroups.length > 0 && metrics.categories.length === 0 && (
        <View style={{ gap: spacing.sm }}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Your Tests by Category</Text>
          {rawTestGroups.map((group) => (
            <RawTestGroupCard key={group.groupId} group={group} colors={colors} onTestLogged={onTestLogged} />
          ))}
          {/* Ungrouped tests */}
          {ungroupedTests.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: spacing.xs }]}>Other Tests</Text>
              {ungroupedTests.map((t) => (
                <GlassCard key={t.testType}>
                  <View style={styles.rawTestRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rawTestName, { color: colors.textOnDark }]}>
                        {t.testType.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Text>
                      <Text style={[styles.rawTestMeta, { color: colors.textMuted }]}>
                        {t.date}{t.unit ? ` · ${t.unit}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.rawTestValue, { color: colors.accent1 }]}>{t.score}</Text>
                  </View>
                </GlassCard>
              ))}
            </>
          )}
        </View>
      )}

      {/* ── Empty State ───────────────────────────────────────── */}
      {metrics.categories.length === 0 && rawTestGroups.length === 0 && recentTests.length === 0 && (
        <GlassCard>
          <View style={styles.emptyState}>
            <Ionicons name="analytics-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>No Test Data Yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Search above and log your first test to see your football DNA.
            </Text>
          </View>
        </GlassCard>
      )}

      {/* ── 7 Test Group Cards (with benchmarks) ──────────────── */}
      {metrics.categories.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          {metrics.categories.map((cat) => (
            <TestGroupCard key={cat.groupId || cat.category} category={cat} colors={colors} onTestLogged={onTestLogged} />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Test Group Card ─────────────────────────────────────────────────────

function TestGroupCard({ category, colors, onTestLogged }: {
  category: TestGroupCategory;
  colors: any;
  onTestLogged?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const themeColor = getGroupThemeColor(category.colorTheme || 'orange');
  const zoneColor = getZoneColor(category.categoryAvgPercentile);
  const zoneLabel = getZoneLabel(category.categoryAvgPercentile);

  // Per-metric interaction state
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
      setActiveMetricKey(null);
      setActiveMode(null);
      return;
    }
    setActiveMetricKey(metricKey);
    setActiveMode('history');
    fetchHistory(METRIC_TO_CATALOG[metricKey] || metricKey);
  }, [activeMetricKey, activeMode, fetchHistory]);

  const handleLogNew = useCallback((metricKey: string, _label: string, _unit: string) => {
    if (activeMetricKey === metricKey && activeMode === 'logNew') {
      setActiveMetricKey(null);
      setActiveMode(null);
      return;
    }
    setActiveMetricKey(metricKey);
    setActiveMode('logNew');
  }, [activeMetricKey, activeMode]);

  // Top 2 metrics for collapsed preview
  const previewMetrics = category.metrics.slice(0, 2);

  return (
    <Pressable onPress={() => setExpanded(!expanded)}>
      <GlassCard>
        {/* Header */}
        <View style={styles.groupHeader}>
          <Text style={styles.groupEmoji}>{category.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.groupName, { color: colors.textOnDark }]}>{category.category}</Text>
          </View>
          <View style={[styles.zoneBadge, { backgroundColor: zoneColor + '22' }]}>
            <Text style={[styles.zoneBadgeText, { color: zoneColor }]}>
              P{category.categoryAvgPercentile} · {zoneLabel}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
            style={{ marginLeft: 4 }}
          />
        </View>

        {/* Athlete description */}
        {category.athleteDescription && (
          <Text style={[styles.groupDesc, { color: colors.textMuted }]}>
            {category.athleteDescription}
          </Text>
        )}

        {/* Collapsed: inline preview of top 2 test results */}
        {!expanded && previewMetrics.length > 0 && (
          <View style={styles.previewRow}>
            {previewMetrics.map((m) => (
              <View key={m.metricKey} style={[styles.previewChip, { backgroundColor: themeColor + '12' }]}>
                <Text style={[styles.previewLabel, { color: colors.textMuted }]}>{m.metricLabel}</Text>
                <Text style={[styles.previewValue, { color: themeColor }]}>
                  {m.value}{m.unit ? ` ${m.unit}` : ''}
                </Text>
                <Text style={[styles.previewBadge, { color: zoneColor }]}>P{m.percentile}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Expanded: full PercentileBar per test with history/log-new */}
        {expanded && (
          <View style={styles.expandedTests}>
            <Text style={[styles.catSummary, { color: colors.textMuted }]}>
              {category.categorySummary}
            </Text>
            {category.metrics.map((m) => (
              <View key={m.metricKey}>
                <PercentileBar
                  benchmark={m}
                  onShowHistory={handleShowHistory}
                  onLogNew={handleLogNew}
                />
                {activeMetricKey === m.metricKey && activeMode === 'logNew' && (
                  <InlineTestInput
                    testType={METRIC_TO_CATALOG[m.metricKey] || m.metricKey}
                    unit={m.unit}
                    currentValue={m.value}
                    onSave={async (score) => {
                      await logTestResult({
                        testType: METRIC_TO_CATALOG[m.metricKey] || m.metricKey,
                        score,
                        unit: m.unit,
                        date: new Date().toISOString().slice(0, 10),
                      });
                      setActiveMode(null);
                      setActiveMetricKey(null);
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
        )}
      </GlassCard>
    </Pressable>
  );
}

// ── Raw Test Group Card (no percentiles, just values) ────────────────────

function RawTestGroupCard({ group, colors, onTestLogged }: {
  group: RawTestGroup;
  colors: any;
  onTestLogged?: () => void;
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
    <Pressable onPress={() => setExpanded(!expanded)}>
      <GlassCard>
        {/* Header */}
        <View style={styles.groupHeader}>
          <Text style={styles.groupEmoji}>{group.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.groupName, { color: colors.textOnDark }]}>{group.displayName}</Text>
          </View>
          <View style={[styles.rawCountBadge, { backgroundColor: themeColor + '22' }]}>
            <Text style={[styles.rawCountText, { color: themeColor }]}>
              {group.tests.length} test{group.tests.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
            style={{ marginLeft: 4 }}
          />
        </View>

        {/* Athlete description */}
        <Text style={[styles.groupDesc, { color: colors.textMuted }]}>
          {group.athleteDescription}
        </Text>

        {/* Collapsed: inline preview of top 2 test results */}
        {!expanded && previewTests.length > 0 && (
          <View style={styles.previewRow}>
            {previewTests.map((t) => (
              <View key={t.testType} style={[styles.previewChip, { backgroundColor: themeColor + '12' }]}>
                <Text style={[styles.previewLabel, { color: colors.textMuted }]}>{t.displayName}</Text>
                <Text style={[styles.previewValue, { color: themeColor }]}>
                  {t.score}{t.unit ? ` ${t.unit}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Expanded: all tests with values + action icons */}
        {expanded && (
          <View style={styles.expandedTests}>
            {group.tests.map((t) => (
              <View key={t.testType}>
                <View style={styles.rawExpandedRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rawExpandedName, { color: colors.textOnDark }]}>{t.displayName}</Text>
                    <Text style={[styles.rawExpandedDate, { color: colors.textMuted }]}>{t.date}</Text>
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
                      <Ionicons name="time-outline" size={16} color={colors.textMuted} />
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
                      <Ionicons name="add-circle-outline" size={16} color={colors.accent1} />
                    </Pressable>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.rawExpandedValue, { color: themeColor }]}>
                      {t.score}
                    </Text>
                    {t.unit ? (
                      <Text style={[styles.rawExpandedUnit, { color: colors.textMuted }]}>{t.unit}</Text>
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
                      await logTestResult({
                        testType: t.testType,
                        score,
                        unit: t.unit || undefined,
                        date: new Date().toISOString().slice(0, 10),
                      });
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
            <View style={[styles.benchmarkHint, { backgroundColor: colors.accent1 + '10' }]}>
              <Ionicons name="bulb-outline" size={14} color={colors.accent1} />
              <Text style={[styles.benchmarkHintText, { color: colors.accent1 }]}>
                Log more tests to unlock percentile rankings
              </Text>
            </View>
          </View>
        )}
      </GlassCard>
    </Pressable>
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
    borderWidth: 0,
    borderRadius: borderRadius.lg,
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
  radarCenter: { alignItems: 'center', gap: spacing.sm },
  radarTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  overallBadge: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 5 },
  overallBadgeText: { fontFamily: fontFamily.bold, fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  chip: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: fontFamily.medium, fontSize: 11 },

  // Raw tests
  sectionLabel: { fontFamily: fontFamily.medium, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  rawTestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rawTestName: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  rawTestMeta: { fontFamily: fontFamily.regular, fontSize: 11, marginTop: 2 },
  rawTestValue: { fontFamily: fontFamily.bold, fontSize: 20 },

  // Test group cards
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupEmoji: { fontSize: 20 },
  groupName: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  groupDesc: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 2 },
  zoneBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  zoneBadgeText: { fontFamily: fontFamily.semiBold, fontSize: 11 },
  previewRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.sm,
  },
  previewLabel: { fontFamily: fontFamily.regular, fontSize: 11 },
  previewValue: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  previewBadge: { fontFamily: fontFamily.medium, fontSize: 10 },
  expandedTests: { marginTop: spacing.sm, gap: spacing.xs },
  catSummary: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18, marginBottom: 8 },

  // Raw test group cards
  rawCountBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  rawCountText: { fontFamily: fontFamily.semiBold, fontSize: 11 },
  rawExpandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
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
  rawExpandedValue: { fontFamily: fontFamily.bold, fontSize: 18 },
  rawExpandedUnit: { fontFamily: fontFamily.regular, fontSize: 10, marginTop: 1 },
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
