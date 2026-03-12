/**
 * SuggestionsBanner — Shows pending suggestions at the top of the Plan tab
 * Collapsible: shows count badge when collapsed, full cards when expanded.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../hooks/useTheme';
import { SuggestionCard } from './SuggestionCard';
import { spacing, borderRadius } from '../theme';
import type { Suggestion } from '../types';

interface SuggestionsBannerProps {
  suggestions: Suggestion[];
  onResolved: (id: string, status: string) => void;
}

export function SuggestionsBanner({ suggestions, onResolved }: SuggestionsBannerProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(true);

  if (suggestions.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={[styles.header, { backgroundColor: colors.surface }]}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.countBadge, { backgroundColor: '#FF6B35' }]}>
            <Text style={styles.countText}>{suggestions.length}</Text>
          </View>
          <Text style={[styles.headerTitle, { color: colors.textOnDark }]}>
            Pending Suggestions
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>

      {/* Cards */}
      {expanded &&
        suggestions.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            onResolved={onResolved}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
});
