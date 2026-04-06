/**
 * TestLogCapsule — Inline test logging form within chat.
 * Two-tier selector: Recent tests + categorized full catalog.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Platform } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { TestLogCapsule as TestLogCapsuleType, CapsuleAction, CapsuleCatalogItem } from '../../../types/chat';
import { CapsuleNumberInput } from './shared/CapsuleNumberInput';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

// Category definitions matching mastery pillars
const CATEGORIES = [
  { id: 'all', label: 'All', emoji: '' },
  { id: 'speed', label: 'Speed', emoji: '' },
  { id: 'power', label: 'Power', emoji: '' },
  { id: 'agility', label: 'Agility', emoji: '' },
  { id: 'endurance', label: 'Endurance', emoji: '' },
  { id: 'strength', label: 'Strength', emoji: '' },
  { id: 'mobility', label: 'Mobility', emoji: '' },
  { id: 'body', label: 'Body', emoji: '' },
];

interface TestLogCapsuleProps {
  card: TestLogCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

export function TestLogCapsuleComponent({ card, onSubmit }: TestLogCapsuleProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [selectedTest, setSelectedTest] = useState(card.prefilledTestType ?? '');
  const [score, setScore] = useState('');
  const date = card.prefilledDate ?? today;
  const [submitting, setSubmitting] = useState(false);
  const [showFullCatalog, setShowFullCatalog] = useState(!!(card.prefilledTestType && !card.recentTests?.length));
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const selectedTestInfo = useMemo(
    () => (card.catalog ?? []).find((t) => t.id === selectedTest),
    [selectedTest, card.catalog]
  );

  // Recent tests (up to 3)
  const recentPills = useMemo(() => {
    return card.recentTests?.slice(0, 3).map((t) => ({ id: t.id, label: t.name })) ?? [];
  }, [card.recentTests]);

  // Filtered catalog by category + search
  const filteredCatalog = useMemo(() => {
    let items = card.catalog ?? [];
    if (activeCategory !== 'all') {
      items = items.filter((t) => t.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((t) => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
    }
    return items;
  }, [card.catalog, activeCategory, searchQuery]);

  // Categories that actually have tests
  const availableCategories = useMemo(() => {
    const catSet = new Set((card.catalog ?? []).map((t) => t.category));
    return CATEGORIES.filter((c) => c.id === 'all' || catSet.has(c.id));
  }, [card.catalog]);

  const handleSelectTest = useCallback((testId: string) => {
    setSelectedTest(testId);
    // Don't auto-collapse if user is browsing the catalog
  }, []);

  const canSubmit = selectedTest && score && parseFloat(score) > 0;

  const handleSubmit = () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);

    onSubmit({
      type: 'test_log_capsule',
      toolName: 'log_test_result',
      toolInput: {
        testType: selectedTest,
        score: parseFloat(score),
        unit: selectedTestInfo?.unit ?? '',
        date,
      },
      agentType: 'output',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log Test Result</Text>

      {/* Tier 1: Recent tests quick-access */}
      {recentPills.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Recent</Text>
          <View style={styles.pillRow}>
            {recentPills.map((opt) => {
              const isSelected = opt.id === selectedTest;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => handleSelectTest(opt.id)}
                  style={[styles.pill, isSelected && styles.pillSelected]}
                >
                  <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
            {!showFullCatalog && (
              <Pressable
                onPress={() => setShowFullCatalog(true)}
                style={styles.morePill}
              >
                <Text style={styles.morePillText}>More tests →</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Show "Browse all" if no recent tests */}
      {recentPills.length === 0 && !showFullCatalog && (
        <Pressable onPress={() => setShowFullCatalog(true)} style={styles.browseButton}>
          <Text style={styles.browseButtonText}>Browse all {(card.catalog ?? []).length} tests</Text>
        </Pressable>
      )}

      {/* Tier 2: Full categorized catalog */}
      {(showFullCatalog || recentPills.length === 0) && (
        <View style={styles.catalogSection}>
          {/* Search bar */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search tests..."
              placeholderTextColor={colors.textInactive}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
          </View>

          {/* Category tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScroll}
            contentContainerStyle={styles.categoryContainer}
          >
            {availableCategories.map((cat) => {
              const isActive = cat.id === activeCategory;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setActiveCategory(cat.id)}
                  style={[styles.categoryTab, isActive && styles.categoryTabActive]}
                >
                  <Text style={[styles.categoryTabText, isActive && styles.categoryTabTextActive]}>
                    {cat.emoji ? `${cat.emoji} ` : ''}{cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Test pills grid — scrollable */}
          <ScrollView
            style={styles.catalogScrollArea}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            <View style={styles.catalogGrid}>
              {filteredCatalog.map((test) => {
                const isSelected = test.id === selectedTest;
                return (
                  <Pressable
                    key={test.id}
                    onPress={() => handleSelectTest(test.id)}
                    style={[styles.pill, isSelected && styles.pillSelected]}
                  >
                    <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                      {test.name}
                    </Text>
                    {test.unit ? (
                      <Text style={[styles.unitBadge, isSelected && styles.unitBadgeSelected]}>
                        {test.unit}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
              {filteredCatalog.length === 0 && (
                <Text style={styles.emptyText}>No tests found</Text>
              )}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Selected test indicator */}
      {selectedTest && selectedTestInfo && (
        <View style={styles.selectedBanner}>
          <Text style={styles.selectedBannerText}>
            Selected: {selectedTestInfo.name} {selectedTestInfo.unit ? `(${selectedTestInfo.unit})` : ''}
          </Text>
        </View>
      )}

      <CapsuleNumberInput
        label="Score"
        value={score}
        onChangeText={setScore}
        unit={selectedTestInfo?.unit}
        placeholder="Enter value"
      />

      <CapsuleSubmitButton
        title="Log it"
        onPress={handleSubmit}
        disabled={!canSubmit}
        loading={submitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.cardLight,
    borderRadius: borderRadius.md,
    padding: 14,
    gap: 12,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  section: {
    gap: 4,
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.textInactive,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.chipBackground,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 4,
  },
  pillSelected: {
    borderColor: colors.accent1,
    backgroundColor: `rgba(122, 155, 118, 0.12)`,
  },
  pillText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textInactive,
  },
  pillTextSelected: {
    color: colors.accent1,
  },
  unitBadge: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: colors.textInactive,
    opacity: 0.6,
  },
  unitBadgeSelected: {
    color: colors.accent1,
    opacity: 0.8,
  },
  morePill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.accent2,
    borderStyle: 'dashed',
  },
  morePillText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.accent2,
  },
  browseButton: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderStyle: 'dashed',
  },
  browseButtonText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.accent2,
  },
  catalogSection: {
    gap: 8,
  },
  searchContainer: {
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  searchInput: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textPrimary,
    padding: 0,
  },
  categoryScroll: {
    maxHeight: 34,
  },
  categoryContainer: {
    gap: 6,
    paddingRight: 8,
  },
  categoryTab: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
    backgroundColor: colors.chipBackground,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryTabActive: {
    borderColor: colors.accent1,
    backgroundColor: `rgba(122, 155, 118, 0.12)`,
  },
  categoryTabText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textInactive,
  },
  categoryTabTextActive: {
    color: colors.accent1,
  },
  catalogScrollArea: {
    maxHeight: 180,
    borderRadius: borderRadius.sm,
  },
  catalogGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingBottom: 4,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textInactive,
    fontStyle: 'italic',
  },
  selectedBanner: {
    backgroundColor: colors.accentSubtle,
    borderRadius: borderRadius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent1,
  },
  selectedBannerText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.accent1,
  },
});
