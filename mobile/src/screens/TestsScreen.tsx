/**
 * Tests Screen — Two tabs: Vitals + My Tests
 *
 * Tab 1: Vitals — wearable data from health_data (HR, HRV, steps, etc.)
 *         + "Connect Wearable" CTA linking to Settings
 * Tab 2: My Tests — user test results + smart search catalog to add tests
 *         Coach-submitted results also shown here.
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
  Modal,
  FlatList,
  Platform,
  Alert,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { LoopIndicator } from '../components/LoopIndicator';
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

  // Search + Add Test
  const [showAddTest, setShowAddTest] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<TestCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedTest, setSelectedTest] = useState<TestCatalogItem | null>(null);
  const [testValue, setTestValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const data = await getMyTestResults(100);
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
    setSelectedTest(null);
    setTestValue('');

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
    }, 300);
  }, []);

  // Load full catalog on open
  useEffect(() => {
    if (showAddTest && catalogResults.length === 0 && !searchQuery) {
      setCatalogLoading(true);
      searchTestCatalog().then((data) => {
        setCatalogResults(data.tests);
        setCatalogLoading(false);
      }).catch(() => setCatalogLoading(false));
    }
  }, [showAddTest]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit test result ──────────────────────────────────────────

  const handleSubmitTest = useCallback(async () => {
    if (!selectedTest || !testValue.trim()) return;
    const numVal = parseFloat(testValue);
    if (isNaN(numVal)) {
      Alert.alert('Invalid', 'Please enter a valid number.');
      return;
    }

    setSubmitting(true);
    try {
      await logTestResult({
        testType: selectedTest.id,
        score: numVal,
        unit: selectedTest.unit,
        date: new Date().toISOString().slice(0, 10),
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Refresh results and close
      setShowAddTest(false);
      setSelectedTest(null);
      setTestValue('');
      setSearchQuery('');
      fetchTests();
    } catch {
      Alert.alert('Error', 'Could not save test result.');
    } finally {
      setSubmitting(false);
    }
  }, [selectedTest, testValue, fetchTests]);

  // ── Group test results by testType for display ──────────────────

  const groupedResults = useMemo(() => {
    const map = new Map<string, MyTestResult[]>();
    for (const r of myResults) {
      if (!map.has(r.testType)) map.set(r.testType, []);
      map.get(r.testType)!.push(r);
    }
    return map;
  }, [myResults]);

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
            onPress={() => navigation.navigate('EditProfile')}
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
            onConnectWearable={() => navigation.navigate('EditProfile')}
          />
        ) : (
          <TestsTab
            groupedResults={groupedResults}
            loading={testsLoading}
            colors={colors}
            styles={styles}
            onAddTest={() => setShowAddTest(true)}
          />
        )}
      </ScrollView>

      {/* ── Add Test Modal ── */}
      <Modal visible={showAddTest} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowAddTest(false)}>
            <Pressable style={[styles.modalSheet, { backgroundColor: colors.backgroundElevated }]} onPress={(e) => e.stopPropagation()}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textOnDark }]}>
                  {selectedTest ? 'Log Result' : 'Find a Test'}
                </Text>
                <Pressable onPress={() => { setShowAddTest(false); setSelectedTest(null); setSearchQuery(''); }}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </Pressable>
              </View>

              {selectedTest ? (
                /* ── Log value for selected test ── */
                <View style={styles.logSection}>
                  <View style={styles.selectedTestCard}>
                    <Text style={{ fontSize: 24 }}>{selectedTest.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.testName, { color: colors.textOnDark }]}>{selectedTest.name}</Text>
                      <Text style={[styles.testMeta, { color: colors.textInactive }]}>
                        {selectedTest.category} · {selectedTest.unit}
                      </Text>
                    </View>
                    <Pressable onPress={() => setSelectedTest(null)}>
                      <Ionicons name="arrow-back" size={20} color={colors.accent1} />
                    </Pressable>
                  </View>

                  <View style={[styles.valueInputWrap, { borderColor: colors.accent1 + '60' }]}>
                    <TextInput
                      style={[styles.valueInput, { color: colors.textOnDark }]}
                      placeholder={`Enter value (${selectedTest.unit})`}
                      placeholderTextColor={colors.textInactive}
                      value={testValue}
                      onChangeText={setTestValue}
                      keyboardType="decimal-pad"
                      autoFocus
                    />
                    <Text style={[styles.unitLabel, { color: colors.textMuted }]}>
                      {selectedTest.unit}
                    </Text>
                  </View>

                  <Text style={[styles.directionHint, { color: colors.textInactive }]}>
                    {selectedTest.direction === 'higher' ? '↑ Higher is better' : '↓ Lower is better'}
                  </Text>

                  <Pressable
                    style={[styles.saveBtn, { backgroundColor: colors.accent1, opacity: (submitting || !testValue.trim()) ? 0.5 : 1 }]}
                    onPress={handleSubmitTest}
                    disabled={submitting || !testValue.trim()}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={18} color="#FFF" />
                        <Text style={styles.saveBtnText}>Save Result</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ) : (
                /* ── Search catalog ── */
                <>
                  <View style={[styles.searchBar, { borderColor: colors.glassBorder }]}>
                    <Ionicons name="search" size={18} color={colors.textInactive} />
                    <TextInput
                      style={[styles.searchInput, { color: colors.textOnDark }]}
                      placeholder="Search tests... (e.g. sprint, jump, strength)"
                      placeholderTextColor={colors.textInactive}
                      value={searchQuery}
                      onChangeText={handleSearch}
                      autoFocus
                    />
                    {searchQuery !== '' && (
                      <Pressable onPress={() => handleSearch('')}>
                        <Ionicons name="close-circle" size={18} color={colors.textInactive} />
                      </Pressable>
                    )}
                  </View>

                  {catalogLoading ? (
                    <ActivityIndicator color={colors.accent1} style={{ marginTop: 32 }} />
                  ) : (
                    <FlatList
                      data={catalogResults}
                      keyExtractor={(item) => item.id}
                      style={{ maxHeight: 400 }}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      ListEmptyComponent={
                        searchQuery ? (
                          <Text style={[styles.emptyText, { color: colors.textInactive }]}>
                            No tests found for "{searchQuery}"
                          </Text>
                        ) : null
                      }
                      renderItem={({ item }) => (
                        <Pressable
                          style={[styles.catalogItem, { borderColor: colors.glassBorder }]}
                          onPress={() => {
                            setSelectedTest(item);
                            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                        >
                          <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.catalogName, { color: colors.textOnDark }]}>
                              {item.name}
                            </Text>
                            <Text style={[styles.catalogDesc, { color: colors.textInactive }]}>
                              {item.category} · {item.unit} · {item.description}
                            </Text>
                          </View>
                          <View style={[styles.logBadge, { backgroundColor: colors.accent1 + '20' }]}>
                            <Text style={[styles.logBadgeText, { color: colors.accent1 }]}>Log</Text>
                          </View>
                        </Pressable>
                      )}
                    />
                  )}
                </>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
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
        /* ── Vitals grid ── */
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
        /* ── Empty state ── */
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.accent1 + '12' }]}>
            <Ionicons name="pulse-outline" size={48} color={colors.accent1} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>No Vitals Yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textInactive }]}>
            Connect a wearable or manually log your vitals to start tracking your health data.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── My Tests Tab ──────────────────────────────────────────────────────────

function TestsTab({
  groupedResults,
  loading,
  colors,
  styles,
  onAddTest,
}: {
  groupedResults: Map<string, MyTestResult[]>;
  loading: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onAddTest: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent1} size="large" />
      </View>
    );
  }

  const testTypes = Array.from(groupedResults.keys());

  return (
    <View style={{ gap: spacing.md }}>
      {/* Add Test CTA */}
      <Pressable
        style={[styles.addTestBtn, { borderColor: colors.accent1 }]}
        onPress={onAddTest}
      >
        <Ionicons name="add-circle-outline" size={22} color={colors.accent1} />
        <Text style={[styles.addTestText, { color: colors.accent1 }]}>Add Test Result</Text>
      </Pressable>

      {testTypes.length > 0 ? (
        testTypes.map((testType) => {
          const results = groupedResults.get(testType) || [];
          const latest = results[0];
          const prev = results.length > 1 ? results[1] : null;
          const unit = (latest.rawData as Record<string, unknown>)?.unit as string || '';

          // Try to find matching catalog item for display info
          const catalogMatch = getCatalogInfo(testType);

          return (
            <Pressable
              key={testType}
              style={[styles.testCard, { borderColor: colors.glassBorder }]}
              onPress={onAddTest}
            >
              <View style={styles.testCardHeader}>
                <Text style={{ fontSize: 22 }}>{catalogMatch.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.testCardName, { color: colors.textOnDark }]}>
                    {catalogMatch.name}
                  </Text>
                  <Text style={[styles.testCardCategory, { color: colors.textInactive }]}>
                    {catalogMatch.category} · {results.length} result{results.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>

              {/* Latest value */}
              <View style={styles.testCardBody}>
                <View>
                  <Text style={[styles.testCardValue, { color: colors.textOnDark }]}>
                    {latest.score ?? '-'}
                  </Text>
                  <Text style={[styles.testCardUnit, { color: colors.textInactive }]}>
                    {unit} · {latest.date}
                  </Text>
                </View>

                {prev && latest.score !== null && prev.score !== null && (
                  <View style={styles.testCardTrend}>
                    {latest.score !== prev.score && (
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
              </View>

              {/* Mini sparkline (last 5 values) */}
              {results.length >= 2 && (
                <View style={styles.sparkRow}>
                  {results.slice(0, 5).reverse().map((r, i) => {
                    const maxVal = Math.max(...results.slice(0, 5).map((rr) => rr.score ?? 0));
                    const minVal = Math.min(...results.slice(0, 5).map((rr) => rr.score ?? 0));
                    const range = maxVal - minVal || 1;
                    const height = 4 + ((r.score ?? 0) - minVal) / range * 20;
                    return (
                      <View
                        key={r.id || i}
                        style={[
                          styles.sparkBar,
                          {
                            height,
                            backgroundColor: i === results.slice(0, 5).length - 1 - 0
                              ? colors.accent1
                              : colors.accent1 + '40',
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              )}
            </Pressable>
          );
        })
      ) : (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.accent1 + '12' }]}>
            <Ionicons name="clipboard-outline" size={48} color={colors.accent1} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>No Tests Yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textInactive }]}>
            Tap "Add Test Result" to log your first test from our catalog of 50+ standard athletic tests.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Quick catalog lookup for display info (static, no API) */
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
  // Phone test types
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

    // Header (matches Plan screen)
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

    // Tests
    addTestBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderRadius: borderRadius.lg,
      paddingVertical: 14,
    },
    addTestText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
    },
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
    testCardTrend: {
      alignItems: 'flex-end',
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

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: spacing.lg,
      paddingBottom: spacing.huge,
      paddingHorizontal: layout.screenMargin,
      maxHeight: '80%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    modalTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 20,
    },

    // Search
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderRadius: borderRadius.lg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: spacing.md,
    },
    searchInput: {
      flex: 1,
      fontFamily: fontFamily.regular,
      fontSize: 15,
    },
    catalogItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    catalogName: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
    },
    catalogDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 11,
      marginTop: 2,
    },
    logBadge: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 8,
    },
    logBadgeText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
    },
    emptyText: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: 32,
    },

    // Log section
    logSection: {
      gap: spacing.md,
    },
    selectedTestCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: spacing.sm,
    },
    testName: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
    },
    testMeta: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      marginTop: 2,
    },
    valueInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 2,
      borderRadius: borderRadius.lg,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    valueInput: {
      flex: 1,
      fontFamily: fontFamily.bold,
      fontSize: 24,
    },
    unitLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
    },
    directionHint: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      textAlign: 'center',
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: borderRadius.lg,
      paddingVertical: 14,
    },
    saveBtnText: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: '#FFFFFF',
    },
  });
}
