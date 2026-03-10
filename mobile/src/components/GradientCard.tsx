/**
 * GradientCard Component
 * Tomo Design System — card with gradient background
 *
 * Default: orange→teal gradient. Supports all gradient presets
 * from the theme (orangeCyan, orange, cyan, dark).
 */

import React, { ReactNode } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, shadows } from '../theme';

interface GradientCardProps {
  children: ReactNode;
  gradientColors?: [string, string];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: ViewStyle;
}

export function GradientCard({
  children,
  gradientColors = colors.gradientOrangeCyan,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
  style,
}: GradientCardProps) {
  return (
    <LinearGradient
      colors={gradientColors}
      start={start}
      end={end}
      style={[styles.container, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.md,
  },
});
