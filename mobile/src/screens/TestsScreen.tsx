/**
 * Tests Screen — Two tabs: Vitals + My Tests
 *
 * Tab 1: Vitals — wearable data from health_data (HR, HRV, steps, etc.)
 *         + "Connect Wearable" CTA linking to Settings
 * Tab 2: My Tests — inline smart search to find & add tests from catalog
 *         User taps a search result → test added to list with inline value input
 *         User can edit own values inline; coach-submitted tests are read-only.
 *
 * Top row matches the Plan screen pattern (consistent across all pages).
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import {
  spacing,
  fontFamily,
  layout,
  borderRadius,
} from '../theme';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import {
  getVitals,
  getMyTestResults,
  searchTestCatalog,
  logTestResult,
  type VitalsResponse,
  type TestCatalogItem,
  type MyTestResult,
} from '../services/api';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, MainStackParamList } from '../navigation/types';

// ── Types ────────────────────────────────────────────────────────────────

type TestsScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Test'>,
    NativeStackNavigationProp<MainStackParamList>
  >;
};

type Tab = 'vitals' | 'tests';

// ── Vitals display config ────────────────────────────────────────────────

const VITAL_CONFIG: Record<string, { label: string; emoji: string; unit: string; color: string }> = {
  heart_rate: { label: 'Heart Rate', emoji: '❤️', unit: 'bpm', color: '#FF3B30' },
  hrv: { label: 'HRV', emoji: '💓', unit: 'ms', color: '#AF52DE' },
  resting_hr: { label: 'Resting HR', emoji: '💗', unit: 'bpm', color: '#FF6B6B' },
  steps: { label: 'Steps', emoji: '👣', unit: 'steps', color: '#30D158' },
  calories: { label: 'Active Cal', emoji: '🔥', unit: 'kcal', color: '#FF9500' },
  blood_oxygen: { label: 'SpO₂', emoji: '🫁', unit: '%', color: '#00D9FF' },
  sleep_hours: { label: 'Sleep', emoji: '😴', unit: 'hrs', color: '#6366F1' },
  body_temp: { label: 'Body Temp', emoji: '🌡️', unit: '°C', color: '#FF6B35' },
  respiratory_rate: { label: 'Resp Rate', emoji: '🌬️', unit: '/min', color: '#34C759' },
  vo2max: { label: 'VO₂ Max', emoji: '🏃', unit: 'ml/kg/min', color: '#007AFF' },
};

// ── Component ────────────────────────────────────────────────────────────

export function TestsScreen({ navigation }: TestsScreenProps) {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState<Tab>('vitals');
  const [refreshing, setRefreshing] = useState(false);

  // Vitals state
  const [vitals, setVitals] = useState<VitalsResponse['vitals']>({});
  const [vitalsLoading, setVitalsLoading] = useState(true);

  // Tests state
  const [myResults, setMyResults] = useState<MyTestResult[]>([]);
  const [testsLoading, setTestsLoading] = useState(true);

  // Inline search
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<TestCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inline add/edit
  const [pendingTest, setPendingTest] = useState<TestCatalogItem | null>(null);
  const [pendingValue, setPendingValue] = useState('');
  const [editingResultId, setEditingResultId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const weekdayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  // ── Data fetching ───────────────────────────────────────────────

  const fetchVitals = useCallback(async () => {
    try {
      const data = await getVitals(7);
      setVitals(data.vitals);
    } catch {
      // graceful
    } finally {
      setVitalsLoading(false);
    }
  }, []);

  const fetchTests = useCallback(async () => {
    try {
      const data = await getMyTestResults(200);
      setMyResults(data.results);
    } catch {
      // graceful
    } finally {
      setTestsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVitals();
    fetchTests();
  }, [fetchVitals, fetchTests]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchVitals(), fetchTests()]);
    setRefreshing(false);
  }, [fetchVitals, fetchTests]);

  // ── Search catalog ──────────────────────────────────────────────

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!q.trim()) {
      setCatalogResults([]);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const data = await searchTestCatalog(q);
        setCatalogResults(data.tests);
      } catch {
        setCatalogResults([]);
      } finally {
        setCatalogLoading(false);
      }
    }, 250);
  }, []);

  // ── Select test from search results ─────────────────────────────

  const handleSelectTest = useCallback((item: TestCatalogItem) => {
    setPendingTest(item);
    setPendingValue('');
    setSearchQuery('');
    setCatalogResults([]);
    setSearchFocused(false);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // ── Save new test result (inline) ──────────────────────────────

  const handleSavePending = useCallback(async () => {
    if (!pendingTest || !pendingValue.trim()) return;
    const numVal = parseFloat(pendingValue);
    if (isNaN(numVal)) {
      Alert.alert('Invalid', 'Please enter a valid number.');
      return;
    }

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
      fetchTests();
    } catch {
      Alert.alert('Error', 'Could not save test result.');
    } finally {
      setSubmitting(false);
    }
  }, [pendingTest, pendingValue, fetchTests]);

  // ── Save edited value ──────────────────────────────────────────

  const handleSaveEdit = useCallback(async (result: MyTestResult) => {
    const numVal = parseFloat(editValue);
    if (isNaN(numVal)) {
      Alert.alert('Invalid', 'Please enter a valid number.');
      return;
    }

    setSubmitting(true);
    try {
      const unit = (result.rawData as Record<string, unknown>)?.unit as string || '';
      await logTestResult({
        testType: result.testType,
        score: numVal,
        unit,
        date: result.date,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingResultId(null);
      setEditValue('');
      fetchTests();
    } catch {
      Alert.alert('Error', 'Could not update test result.');
    } finally {
      setSubmitting(false);
    }
  }, [editValue, fetchTests]);

  // ── Group test results by testType for display ──────────────────

  const groupedResults = useMemo(() => {
    const map = new Map<string, MyTestResult[]>();
    for (const r of myResults) {
      if (!map.has(r.testType)) map.set(r.testType, []);
      map.get(r.testType)!.push(r);
    }
    return map;
  }, [myResults]);

  // Whether search dropdown should show
  const showDropdown = searchFocused && searchQuery.length > 0 && (catalogResults.length > 0 || catalogLoading);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Top Row (same as Plan screen) ── */}
      <View style={styles.headerArea}>
        <View style={styles.headerLeft}>
          <View>
            <Text style={styles.headerSubtitle}>TOMO · {weekdayName.toUpperCase()}</Text>
            <Text style={styles.screenTitle}>Your Tests</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.settingsCapsule}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={15} color={colors.textOnDark} />
            <Text style={styles.settingsCapsuleText}>Settings</Text>
          </Pressable>
          <HeaderProfileButton
            initial={profile?.name?.charAt(0)?.toUpperCase() || '?'}
            photoUrl={profile?.photoUrl}
          />
        </View>
      </View>

      {/* ── Tab Switcher ── */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, activeTab === 'vitals' && styles.tabActive]}
          onPress={() => setActiveTab('vitals')}
        >
          <Ionicons
            name="heart-outline"
            size={15}
            color={activeTab === 'vitals' ? '#FFF' : colors.textInactive}
          />
          <Text style={[styles.tabText, activeTab === 'vitals' && styles.tabTextActive]}>
            Vitals
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'tests' && styles.tabActive]}
          onPress={() => setActiveTab('tests')}
        >
          <Ionicons
            name="fitness-outline"
            size={15}
            color={activeTab === 'tests' ? '#FFF' : colors.textInactive}
          />
          <Text style={[styles.tabText, activeTab === 'tests' && styles.tabTextActive]}>
            My Tests
          </Text>
        </Pressable>
      </View>

      {/* ── Content ── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent1} />
        }
      >
        {activeTab === 'vitals' ? (
          <VitalsTab
            vitals={vitals}
            loading={vitalsLoading}
            colors={colors}
            styles={styles}
            onConnectWearable={() => navigation.navigate('Settings')}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {/* ── Inline Smart Search ── */}
            <View style={{ zIndex: 100 }}>
              <View style={[styles.searchBar, searchFocused && { borderColor: colors.accent1 }]}>
                <Ionicons name="search" size={18} color={searchFocused ? colors.accent1 : colors.textInactive} />
                <TextInput
                  style={[styles.searchInput, { color: colors.textOnDark }]}
                  placeholder="Search tests... (sprint, jump, strength)"
                  placeholderTextColor={colors.textInactive}
                  value={searchQuery}
                  onChangeText={handleSearch}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => {
                    // Delay blur so onPress on results can fire
                    setTimeout(() => setSearchFocused(false), 200);
                  }}
                />
                {searchQuery !== '' && (
                  <Pressable onPress={() => { handleSearch(''); setSearchFocused(false); }}>
                    <Ionicons name="close-circle" size={18} color={colors.textInactive} />
                  </Pressable>
                )}
              </View>

              {/* ── Search dropdown ── */}
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
                          <Text style={[styles.dropdownName, { color: colors.textOnDark }]}>
                            {item.name}
                          </Text>
                          <Text style={[styles.dropdownMeta, { color: colors.textInactive }]}>
                            {item.category} · {item.unit}
                          </Text>
                        </View>
                        <Ionicons name="add-circle" size={22} color={colors.accent1} />
                      </Pressable>
                    ))
                  )}
                  {!catalogLoading && searchQuery && catalogResults.length === 0 && (
                    <Text style={[styles.dropdownEmpty, { color: colors.textInactive }]}>
                      No tests found
                    </Text>
                  )}
                </View>
              )}
            </View>

            {/* ── Pending test (just added from search) ── */}
            {pendingTest && (
              <View style={[styles.pendingCard, { borderColor: colors.accent1 }]}>
                <View style={styles.pendingHeader}>
                  <Text style={{ fontSize: 20 }}>{pendingTest.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pendingName, { color: colors.textOnDark }]}>
                      {pendingTest.name}
                    </Text>
                    <Text style={[styles.pendingMeta, { color: colors.textInactive }]}>
                      {pendingTest.category} · {pendingTest.direction === 'higher' ? '↑ Higher is better' : '↓ Lower is better'}
                    </Text>
                  </View>
                  <Pressable onPress={() => setPendingTest(null)} hitSlop={8}>
                    <Ionicons name="close" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
                <View style={styles.pendingInputRow}>
                  <View style={[styles.valueInputWrap, { borderColor: colors.accent1 + '60', flex: 1 }]}>
                    <TextInput
                      style={[styles.valueInput, { color: colors.textOnDark }]}
                      placeholder={`Value (${pendingTest.unit})`}
                      placeholderTextColor={colors.textInactive}
                      value={pendingValue}
                      onChangeText={setPendingValue}
                      keyboardType="decimal-pad"
                      autoFocus
                    />
                    <Text style={[styles.unitLabel, { color: colors.textMuted }]}>
                      {pendingTest.unit}
                    </Text>
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
              </View>
            )}

            {/* ── My Tests list ── */}
            {testsLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={colors.accent1} size="large" />
              </View>
            ) : groupedResults.size > 0 ? (
              Array.from(groupedResults.keys()).map((testType) => {
                const results = groupedResults.get(testType) || [];
                const latest = results[0];
                const prev = results.length > 1 ? results[1] : null;
                const unit = (latest.rawData as Record<string, unknown>)?.unit as string || '';
                const isCoach = (latest.rawData as Record<string, unknown>)?.source === 'coach';
                const isEditing = editingResultId === latest.id;
                const catalogMatch = getCatalogInfo(testType);

                return (
                  <View
                    key={testType}
                    style={[styles.testCard, { borderColor: isCoach ? '#6366F1' + '40' : colors.glassBorder }]}
                  >
                    <View style={styles.testCardHeader}>
                      <Text style={{ fontSize: 22 }}>{catalogMatch.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.testCardName, { color: colors.textOnDark }]}>
                            {catalogMatch.name}
                          </Text>
                          {isCoach && (
                            <View style={[styles.coachBadge, { backgroundColor: '#6366F1' + '20' }]}>
                              <Ionicons name="shield-checkmark" size={10} color="#6366F1" />
                              <Text style={{ fontSize: 9, color: '#6366F1', fontWeight: '700' }}>COACH</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.testCardCategory, { color: colors.textInactive }]}>
                          {catalogMatch.category} · {results.length} result{results.length !== 1 ? 's' : ''}
                          {unit ? ` · ${unit}` : ''}
                        </Text>
                      </View>
                      {!isCoach && !isEditing && (
                        <Pressable
                          onPress={() => {
                            setEditingResultId(latest.id);
                            setEditValue(String(latest.score ?? ''));
                          }}
                          hitSlop={8}
                          style={[styles.editBtn, { backgroundColor: colors.accent1 + '12' }]}
                        >
                          <Ionicons name="pencil" size={14} color={colors.accent1} />
                        </Pressable>
                      )}
                    </View>

                    {isEditing ? (
                      /* ── Inline edit mode ── */
                      <View style={styles.pendingInputRow}>
                        <View style={[styles.valueInputWrap, { borderColor: colors.accent1 + '60', flex: 1 }]}>
                          <TextInput
                            style={[styles.valueInput, { color: colors.textOnDark }]}
                            placeholder={`Value (${unit})`}
                            placeholderTextColor={colors.textInactive}
                            value={editValue}
                            onChangeText={setEditValue}
                            keyboardType="decimal-pad"
                            autoFocus
                          />
                          {unit ? (
                            <Text style={[styles.unitLabel, { color: colors.textMuted }]}>{unit}</Text>
                          ) : null}
                        </View>
                        <Pressable
                          style={[
                            styles.inlineSaveBtn,
                            { backgroundColor: colors.accent1, opacity: (submitting || !editValue.trim()) ? 0.5 : 1 },
                          ]}
                          onPress={() => handleSaveEdit(latest)}
                          disabled={submitting || !editValue.trim()}
                        >
                          {submitting ? (
                            <ActivityIndicator color="#FFF" size="small" />
                          ) : (
                            <Ionicons name="checkmark" size={20} color="#FFF" />
                          )}
                        </Pressable>
                        <Pressable
                          style={[styles.cancelBtn, { backgroundColor: colors.textInactive + '20' }]}
                          onPress={() => { setEditingResultId(null); setEditValue(''); }}
                        >
                          <Ionicons name="close" size={20} color={colors.textMuted} />
                        </Pressable>
                      </View>
                    ) : (
                      /* ── Value display ── */
                      <View style={styles.testCardBody}>
                        <View>
                          <Text style={[styles.testCardValue, { color: colors.textOnDark }]}>
                            {latest.score ?? '-'}
                          </Text>
                          <Text style={[styles.testCardUnit, { color: colors.textInactive }]}>
                            {unit} · {latest.date}
                          </Text>
                        </View>
                        {prev && latest.score !== null && prev.score !== null && latest.score !== prev.score && (
                          <View style={[
                            styles.trendPill,
                            { backgroundColor: (latest.score > prev.score ? '#30D158' : '#FF3B30') + '18' },
                          ]}>
                            <Ionicons
                              name={latest.score > prev.score ? 'trending-up' : 'trending-down'}
                              size={14}
                              color={latest.score > prev.score ? '#30D158' : '#FF3B30'}
                            />
                            <Text style={{
                              fontSize: 11,
                              fontWeight: '700',
                              color: latest.score > prev.score ? '#30D158' : '#FF3B30',
                            }}>
                              {Math.abs(latest.score - prev.score).toFixed(1)}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Mini sparkline (last 5 values) */}
                    {!isEditing && results.length >= 2 && (
                      <View style={styles.sparkRow}>
                        {results.slice(0, 5).reverse().map((r, i, arr) => {
                          const maxVal = Math.max(...arr.map((rr) => rr.score ?? 0));
                          const minVal = Math.min(...arr.map((rr) => rr.score ?? 0));
                          const range = maxVal - minVal || 1;
                          const height = 4 + ((r.score ?? 0) - minVal) / range * 20;
                          return (
                            <View
                              key={r.id || i}
                              style={[
                                styles.sparkBar,
                                {
                                  height,
                                  backgroundColor: i === arr.length - 1
                                    ? colors.accent1
                                    : colors.accent1 + '40',
                                },
                              ]}
                            />
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })
            ) : (
              /* ── Empty state ── */
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.accent1 + '12' }]}>
                  <Ionicons name="clipboard-outline" size={48} color={colors.accent1} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>No Tests Yet</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textInactive }]}>
                  Use the search above to find a test from our catalog of 90+ standard athletic tests and log your first result.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Vitals Tab ────────────────────────────────────────────────────────────

function VitalsTab({
  vitals,
  loading,
  colors,
  styles,
  onConnectWearable,
}: {
  vitals: VitalsResponse['vitals'];
  loading: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onConnectWearable: () => void;
}) {
  const vitalKeys = Object.keys(vitals);
  const hasData = vitalKeys.length > 0;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent1} size="large" />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {/* Connect wearable CTA */}
      <Pressable
        style={[styles.connectCard, { borderColor: colors.accent1 + '40' }]}
        onPress={onConnectWearable}
      >
        <View style={[styles.connectIconWrap, { backgroundColor: colors.accent1 + '15' }]}>
          <Ionicons name="watch-outline" size={28} color={colors.accent1} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.connectTitle, { color: colors.textOnDark }]}>
            {hasData ? 'Wearable Connected' : 'Connect Wearable'}
          </Text>
          <Text style={[styles.connectDesc, { color: colors.textInactive }]}>
            {hasData
              ? 'Syncing vitals from your device'
              : 'Link Apple Watch, Garmin, or Whoop to track vitals automatically'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textInactive} />
      </Pressable>

      {hasData ? (
        <View style={styles.vitalsGrid}>
          {vitalKeys.map((key) => {
            const config = VITAL_CONFIG[key] || {
              label: key.replace(/_/g, ' '),
              emoji: '📊',
              unit: '',
              color: colors.accent1,
            };
            const readings = vitals[key];
            const latest = readings[0];
            const prev = readings.length > 1 ? readings[1] : null;
            const trend = prev ? latest.value - prev.value : 0;

            return (
              <View
                key={key}
                style={[styles.vitalCard, { borderColor: config.color + '30' }]}
              >
                <View style={styles.vitalCardHeader}>
                  <Text style={{ fontSize: 18 }}>{config.emoji}</Text>
                  <Text style={[styles.vitalLabel, { color: colors.textMuted }]}>{config.label}</Text>
                </View>
                <Text style={[styles.vitalValue, { color: colors.textOnDark }]}>
                  {latest.value % 1 === 0 ? latest.value : latest.value.toFixed(1)}
                </Text>
                <View style={styles.vitalFooter}>
                  <Text style={[styles.vitalUnit, { color: colors.textInactive }]}>
                    {config.unit}
                  </Text>
                  {trend !== 0 && (
                    <View style={styles.trendBadge}>
                      <Ionicons
                        name={trend > 0 ? 'arrow-up' : 'arrow-down'}
                        size={10}
                        color={trend > 0 ? '#30D158' : '#FF3B30'}
                      />
                      <Text style={{ fontSize: 10, color: trend > 0 ? '#30D158' : '#FF3B30', fontWeight: '600' }}>
                        {Math.abs(trend).toFixed(1)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.accent1 + '12' }]}>
            <Ionicons name="pulse-outline" size={48} color={colors.accent1} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>No Vitals Yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textInactive }]}>
            Connect a wearable to start tracking your health data automatically.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

const CATALOG_LOOKUP: Record<string, { name: string; emoji: string; category: string }> = {
  '10m-sprint': { name: '10m Sprint', emoji: '🏃', category: 'Speed' },
  '20m-sprint': { name: '20m Sprint', emoji: '🏃', category: 'Speed' },
  '30m-sprint': { name: '30m Sprint', emoji: '🏃', category: 'Speed' },
  'cmj': { name: 'Counter Movement Jump', emoji: '🦘', category: 'Power' },
  'vertical-jump': { name: 'Vertical Jump', emoji: '🦘', category: 'Power' },
  'broad-jump': { name: 'Standing Broad Jump', emoji: '🦘', category: 'Power' },
  't-test': { name: 'Agility T-Test', emoji: '🔀', category: 'Agility' },
  'yo-yo-ir1': { name: 'Yo-Yo IR1', emoji: '🫁', category: 'Endurance' },
  'beep-test': { name: 'Beep Test', emoji: '🫁', category: 'Endurance' },
  'vo2max': { name: 'VO₂ Max', emoji: '🫁', category: 'Endurance' },
  'bench-press-1rm': { name: 'Bench Press 1RM', emoji: '🏋️', category: 'Strength' },
  'squat-1rm': { name: 'Back Squat 1RM', emoji: '🏋️', category: 'Strength' },
  'pull-ups': { name: 'Pull-Ups', emoji: '💪', category: 'Strength' },
  'reaction-time': { name: 'Reaction Time', emoji: '⚡', category: 'Reaction' },
  'sit-reach': { name: 'Sit & Reach', emoji: '🧘', category: 'Flexibility' },
  'free-kicks-10': { name: 'Free Kicks (10)', emoji: '⚽', category: 'Sport Skill' },
  'ball-juggling': { name: 'Ball Juggling', emoji: '⚽', category: 'Sport Skill' },
  'body-weight': { name: 'Body Weight', emoji: '⚖️', category: 'Body Comp' },
  'reaction-tap': { name: 'Reaction Tap', emoji: '⚡', category: 'Phone Test' },
  'jump-height': { name: 'Jump Height', emoji: '🦘', category: 'Phone Test' },
  'sprint-speed': { name: 'Sprint Speed', emoji: '🏃', category: 'Phone Test' },
  'agility-shuffle': { name: 'Agility Shuffle', emoji: '🔀', category: 'Phone Test' },
  'balance-stability': { name: 'Balance', emoji: '🧘', category: 'Phone Test' },
};

function getCatalogInfo(testType: string): { name: string; emoji: string; category: string } {
  return CATALOG_LOOKUP[testType] || {
    name: testType.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    emoji: '📊',
    category: 'Custom',
  };
}

// ── Styles ──────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },

    // Header
    headerArea: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: layout.screenMargin,
      paddingVertical: spacing.sm,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    headerSubtitle: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.textMuted,
      letterSpacing: 1.5,
      textTransform: 'uppercase' as const,
    },
    screenTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 24,
      color: colors.textOnDark,
    },
    settingsCapsule: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      borderRadius: borderRadius.full,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    settingsCapsuleText: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.textOnDark,
    },

    // Tabs
    tabRow: {
      flexDirection: 'row',
      paddingHorizontal: layout.screenMargin,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      backgroundColor: 'transparent',
    },
    tabActive: {
      backgroundColor: colors.accent1,
    },
    tabText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textInactive,
    },
    tabTextActive: {
      color: '#FFFFFF',
    },

    scrollContent: {
      paddingHorizontal: layout.screenMargin,
      paddingBottom: layout.navHeight + spacing.xl,
    },

    // Connect wearable
    connectCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderWidth: 1,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      backgroundColor: colors.backgroundElevated,
    },
    connectIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    connectTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
    },
    connectDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
    },

    // Vitals grid
    vitalsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    vitalCard: {
      width: '48%' as unknown as number,
      borderWidth: 1,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      backgroundColor: colors.backgroundElevated,
    },
    vitalCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: spacing.sm,
    },
    vitalLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      letterSpacing: 0.3,
    },
    vitalValue: {
      fontFamily: fontFamily.bold,
      fontSize: 28,
    },
    vitalFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    vitalUnit: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
    },
    trendBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },

    // Inline search
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      borderRadius: borderRadius.lg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: colors.backgroundElevated,
    },
    searchInput: {
      flex: 1,
      fontFamily: fontFamily.regular,
      fontSize: 15,
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
    },

    // Dropdown
    dropdown: {
      position: 'absolute',
      top: 50,
      left: 0,
      right: 0,
      borderWidth: 1,
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
      ...(Platform.OS === 'web'
        ? { boxShadow: '0 8px 32px rgba(0,0,0,0.4)' } as any
        : {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.4,
            shadowRadius: 16,
            elevation: 20,
          }),
    },
    dropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    dropdownName: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
    },
    dropdownMeta: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      marginTop: 1,
    },
    dropdownEmpty: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: 24,
    },

    // Pending test (add new)
    pendingCard: {
      borderWidth: 1.5,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      backgroundColor: colors.backgroundElevated,
      gap: spacing.sm,
    },
    pendingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    pendingName: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
    },
    pendingMeta: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      marginTop: 1,
    },
    pendingInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    valueInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 2,
      borderRadius: borderRadius.md,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    valueInput: {
      flex: 1,
      fontFamily: fontFamily.bold,
      fontSize: 20,
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
    },
    unitLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
    },
    inlineSaveBtn: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelBtn: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Tests list
    testCard: {
      borderWidth: 1,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      backgroundColor: colors.backgroundElevated,
    },
    testCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    testCardName: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
    },
    testCardCategory: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      marginTop: 1,
    },
    testCardBody: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
    testCardValue: {
      fontFamily: fontFamily.bold,
      fontSize: 32,
    },
    testCardUnit: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      marginTop: 2,
    },
    coachBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    editBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    trendPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    sparkRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 3,
      marginTop: spacing.sm,
      height: 24,
    },
    sparkBar: {
      flex: 1,
      borderRadius: 2,
      minHeight: 4,
    },

    // Empty state
    emptyState: {
      alignItems: 'center',
      paddingVertical: spacing.huge,
      gap: spacing.md,
    },
    emptyIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 18,
    },
    emptySubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      textAlign: 'center',
      paddingHorizontal: spacing.lg,
    },
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
    },
  });
}
