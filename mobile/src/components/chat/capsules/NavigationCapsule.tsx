/**
 * NavigationCapsule — Instant deep-link card to navigate to any tab.
 * Renders icon + label + description + "Go" button.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { NavigationCapsule as NavigationCapsuleType } from '../../../types/chat';

interface NavigationCapsuleProps {
  card: NavigationCapsuleType;
  onNavigate?: (deepLink: { tabName: string; params?: Record<string, any> }) => void;
}

export function NavigationCapsuleComponent({ card, onNavigate }: NavigationCapsuleProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>{card.icon}</Text>
        <View style={styles.textWrap}>
          <Text style={styles.label}>{card.label}</Text>
          <Text style={styles.description}>{card.description}</Text>
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [styles.goButton, pressed && styles.goButtonPressed]}
        onPress={() => onNavigate?.(card.deepLink)}
      >
        <Text style={styles.goButtonText}>Go →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  icon: {
    fontSize: 28,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  description: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  goButton: {
    backgroundColor: colors.accent1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  goButtonPressed: {
    opacity: 0.8,
  },
  goButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textOnDark,
  },
});
