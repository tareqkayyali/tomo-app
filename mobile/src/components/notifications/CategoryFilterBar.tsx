/**
 * CategoryFilterBar — Horizontal scrollable filter tabs for notification categories.
 * Sticky below header. Active state uses category accent color.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius, fontFamily } from '../../theme';
import { FILTER_CATEGORIES, type CategoryFilter } from './constants';

import { colors } from '../../theme/colors';

interface CategoryFilterBarProps {
  selected: CategoryFilter;
  counts: Record<string, number>;
  onSelect: (category: CategoryFilter) => void;
}

export function CategoryFilterBar({ selected, counts, onSelect }: CategoryFilterBarProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {FILTER_CATEGORIES.map(({ key, label, color }) => {
          const isActive = selected === key;
          const count = key === 'all'
            ? Object.values(counts).reduce((a, b) => a + b, 0)
            : (counts[key] ?? 0);

          return (
            <Pressable
              key={key}
              style={[
                styles.tab,
                isActive
                  ? { backgroundColor: color + '20', borderColor: color }
                  : { backgroundColor: 'transparent', borderColor: colors.border },
              ]}
              onPress={() => onSelect(key)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: isActive ? color : colors.textSecondary },
                ]}
              >
                {label}
              </Text>
              {count > 0 && (
                <View style={[styles.countBadge, { backgroundColor: isActive ? color : colors.textDisabled }]}>
                  <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(245,243,237,0.05)',
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.compact,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
  },
  countBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  countText: {
    fontSize: 9,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
  },
});
