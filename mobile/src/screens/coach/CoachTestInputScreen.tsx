/**
 * Coach Test Input Screen — Dynamic catalog with smart search
 *
 * Full test catalog (97 tests) loaded from API.
 * Smart search with category filters.
 * Multiple tests can be queued before submitting.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { SmartIcon } from '../../components/SmartIcon';
import { Loader } from '../../components/Loader';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { searchTestCatalog, submitPlayerTest, type TestCatalogItem } from '../../services/api';
import { GlassCard } from '../../components/GlassCard';
import { PlayerScreen } from '../../components/tomo-ui/playerDesign';
import { spacing, borderRadius, layout, fontFamily } from '../../theme';
import type { CoachStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<CoachStackParamList, 'CoachTestInput'>;

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'Speed', label: 'Speed' },
  { key: 'Power', label: 'Power' },
  { key: 'Agility', label: 'Agility' },
  { key: 'Endurance', label: 'Endurance' },
  { key: 'Strength', label: 'Strength' },
  { key: 'Flexibility', label: 'Flexibility' },
  { key: 'Reaction', label: 'Reaction' },
  { key: 'Balance', label: 'Balance' },
  { key: 'Body Comp', label: 'Body' },
  { key: 'Sport Skill', label: 'Skill' },
];

const CATEGORY_COLORS: Record<string, string> = {
  Speed: colors.accent,
  Power: colors.error,
  Agility: colors.warning,
  Endurance: colors.accent,
  Strength: colors.info,
  Flexibility: colors.info,
  Reaction: colors.warning,
  Balance: colors.info,
  'Body Comp': colors.textSecondary,
  'Sport Skill': colors.info,
};

interface QueuedTest {
  test: TestCatalogItem;
  value: string;
}

export function CoachTestInputScreen({ route, navigation }: Props) {
  const { playerId, playerName } = route.params;
  const { colors } = useTheme();

  // Catalog state
  const [allTests, setAllTests] = useState<TestCatalogItem[]>([]);
  const [filteredTests, setFilteredTests] = useState<TestCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Queue state
  const [queue, setQueue] = useState<QueuedTest[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load full catalog on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await searchTestCatalog();
        setAllTests(data.tests);
        setFilteredTests(data.tests);
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, []);

  // Filter tests by category + search
  const applyFilter = useCallback((query: string, category: string) => {
    let results = allTests;
    if (category !== 'all') {
      results = results.filter(t => t.category === category);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      results = results.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.tags?.some(tag => tag.toLowerCase().includes(q))
      );
    }
    // Exclude already queued
    const queuedIds = new Set(queue.map(q => q.test.id));
    results = results.filter(t => !queuedIds.has(t.id));
    setFilteredTests(results);
  }, [allTests, queue]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => applyFilter(q, selectedCategory), 150);
  }, [selectedCategory, applyFilter]);

  const handleCategoryChange = useCallback((cat: string) => {
    setSelectedCategory(cat);
    applyFilter(searchQuery, cat);
  }, [searchQuery, applyFilter]);

  const addToQueue = useCallback((test: TestCatalogItem) => {
    setQueue(prev => [...prev, { test, value: '' }]);
    applyFilter(searchQuery, selectedCategory);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [searchQuery, selectedCategory, applyFilter]);

  const updateQueueValue = useCallback((id: string, value: string) => {
    setQueue(prev => prev.map(q => q.test.id === id ? { ...q, value } : q));
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(q => q.test.id !== id));
    // Re-filter to show removed test in the list again
    setTimeout(() => applyFilter(searchQuery, selectedCategory), 50);
  }, [searchQuery, selectedCategory, applyFilter]);

  const handleSubmitAll = async () => {
    const validTests = queue.filter(q => q.value && !isNaN(parseFloat(q.value)));
    if (validTests.length === 0) {
      const msg = 'Please enter values for at least one test.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Tomo', msg);
      }
      return;
    }

    setSubmitting(true);
    setSuccessMsg(null);
    try {
      for (const q of validTests) {
        await submitPlayerTest(playerId, {
          testType: q.test.id,
          sport: 'football',
          values: { primaryValue: parseFloat(q.value), unit: q.test.unit },
        });
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const names = validTests.map(q => q.test.name).join(', ');
      setSuccessMsg(`${validTests.length} test${validTests.length > 1 ? 's' : ''} submitted for ${playerName.split(' ')[0]}: ${names}`);
      setQueue([]);
      applyFilter(searchQuery, selectedCategory);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Tomo', message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const firstName = playerName.split(' ')[0];

  return (
    <PlayerScreen
      label="TEST"
      title="Submit"
      onBack={() => navigation.goBack()}
      contentStyle={styles.content}
      scrollProps={{ keyboardShouldPersistTaps: 'handled' }}
    >
      {/* Context banner */}
      <View style={[styles.contextBanner, { backgroundColor: colors.accent1 + '10' }]}>
        <SmartIcon name="flash-outline" size={14} color={colors.accent1} />
        <Text style={[styles.contextText, { color: colors.accent1 }]}>
          Logging tests for {playerName}
        </Text>
      </View>

      {/* Success banner */}
      {successMsg && (
        <View style={[styles.successBanner, { backgroundColor: colors.success + '18' }]}>
          <SmartIcon name="checkmark-circle" size={18} color={colors.success} />
          <Text style={[styles.successText, { color: colors.success }]} numberOfLines={2}>{successMsg}</Text>
          <Pressable onPress={() => setSuccessMsg(null)} hitSlop={8}>
            <SmartIcon name="close" size={16} color={colors.success} />
          </Pressable>
        </View>
      )}

      {/* Queued tests */}
      {queue.length > 0 && (
        <GlassCard>
          <Text style={[styles.sectionTitle, { color: colors.textOnDark }]}>
            Tests to Submit ({queue.length})
          </Text>
          {queue.map((q) => {
            const catColor = CATEGORY_COLORS[q.test.category] || colors.textMuted;
            return (
              <View key={q.test.id} style={[styles.queueRow, { borderColor: colors.glassBorder }]}>
                {q.test.emoji ? <Text style={styles.queueEmoji}>{q.test.emoji}</Text> : null}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.queueName, { color: colors.textOnDark }]}>{q.test.name}</Text>
                  <Text style={[styles.queueCategory, { color: catColor }]}>{q.test.category}</Text>
                </View>
                <TextInput
                  value={q.value}
                  onChangeText={v => updateQueueValue(q.test.id, v)}
                  placeholder="0"
                  placeholderTextColor={colors.textInactive}
                  keyboardType="decimal-pad"
                  style={[styles.queueInput, { color: colors.textOnDark, backgroundColor: colors.inputBackground }]}
                />
                <Text style={[styles.queueUnit, { color: colors.textMuted }]}>{q.test.unit}</Text>
                <Pressable onPress={() => removeFromQueue(q.test.id)} hitSlop={8}>
                  <SmartIcon name="close-circle" size={18} color={colors.error} />
                </Pressable>
              </View>
            );
          })}
          <Pressable
            onPress={handleSubmitAll}
            disabled={submitting || queue.every(q => !q.value)}
            style={[
              styles.submitButton,
              { backgroundColor: submitting || queue.every(q => !q.value) ? colors.textInactive : colors.accent1 },
            ]}
          >
            {submitting ? (
              <Loader size="sm" />
            ) : (
              <>
                <SmartIcon name="checkmark-circle-outline" size={18} color={colors.textPrimary} />
                <Text style={styles.submitButtonText}>
                  Submit {queue.filter(q => q.value).length} Test{queue.filter(q => q.value).length !== 1 ? 's' : ''} for {firstName}
                </Text>
              </>
            )}
          </Pressable>
        </GlassCard>
      )}

      {/* Search */}
      <GlassCard>
        <View style={styles.searchRow}>
          <SmartIcon name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder="Search 97 tests..."
            placeholderTextColor={colors.textInactive}
            style={[styles.searchInput, { color: colors.textOnDark }]}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => handleSearch('')} hitSlop={8}>
              <SmartIcon name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Category filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
          {CATEGORIES.map(cat => {
            const isActive = selectedCategory === cat.key;
            const catColor = cat.key === 'all' ? colors.accent1 : CATEGORY_COLORS[cat.key] || colors.textMuted;
            return (
              <Pressable
                key={cat.key}
                onPress={() => handleCategoryChange(cat.key)}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: isActive ? catColor + '22' : colors.glass,
                    borderColor: isActive ? catColor : 'transparent',
                    borderWidth: 1,
                  },
                ]}
              >
                <Text style={[styles.catChipText, { color: isActive ? catColor : colors.textMuted }]}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </GlassCard>

      {/* Test list */}
      {loading ? (
        <Loader size="lg" style={{ marginTop: spacing.xl }} />
      ) : filteredTests.length === 0 ? (
        <View style={styles.emptyState}>
          <SmartIcon name="search-outline" size={32} color={colors.textInactive} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {searchQuery ? `No tests matching "${searchQuery}"` : 'No tests in this category'}
          </Text>
        </View>
      ) : (
        <View style={styles.testList}>
          {filteredTests.map(test => {
            const catColor = CATEGORY_COLORS[test.category] || colors.textMuted;
            return (
              <Pressable
                key={test.id}
                onPress={() => addToQueue(test)}
                style={({ pressed }) => [
                  styles.testRow,
                  {
                    backgroundColor: pressed ? colors.glass : colors.surfaceElevated,
                    borderColor: colors.glassBorder,
                  },
                ]}
              >
                {test.emoji ? <Text style={styles.testEmoji}>{test.emoji}</Text> : null}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.testName, { color: colors.textOnDark }]}>{test.name}</Text>
                  <View style={styles.testMeta}>
                    <View style={[styles.testCatBadge, { backgroundColor: catColor + '18' }]}>
                      <Text style={[styles.testCatText, { color: catColor }]}>{test.category}</Text>
                    </View>
                    <Text style={[styles.testUnit, { color: colors.textMuted }]}>{test.unit}</Text>
                    <SmartIcon
                      name={test.direction === 'higher' ? 'arrow-up' : 'arrow-down'}
                      size={10}
                      color={colors.textInactive}
                    />
                  </View>
                </View>
                <SmartIcon name="add-circle-outline" size={22} color={colors.accent1} />
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={{ height: spacing.xxl }} />
    </PlayerScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: layout.screenMargin,
    gap: spacing.sm,
  },
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  contextText: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
  },
  successText: {
    flex: 1,
    fontSize: 13,
    fontFamily: fontFamily.medium,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: fontFamily.bold,
    marginBottom: spacing.sm,
  },

  // Queue
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
  },
  queueEmoji: { fontSize: 18 },
  queueName: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
  },
  queueCategory: {
    fontSize: 10,
    fontFamily: fontFamily.medium,
  },
  queueInput: {
    width: 60,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: fontFamily.bold,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: borderRadius.sm,
  },
  queueUnit: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
    width: 30,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
  },
  submitButtonText: {
    fontSize: 14,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: fontFamily.regular,
    paddingVertical: 4,
  },
  catScroll: {
    marginTop: spacing.sm,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginRight: 6,
  },
  catChipText: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
  },

  // Test list
  testList: {
    gap: 6,
  },
  testRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    borderWidth: 0.5,
  },
  testEmoji: { fontSize: 20 },
  testName: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
  },
  testMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  testCatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
  },
  testCatText: {
    fontSize: 9,
    fontFamily: fontFamily.semiBold,
  },
  testUnit: {
    fontSize: 10,
    fontFamily: fontFamily.regular,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
  },
});
