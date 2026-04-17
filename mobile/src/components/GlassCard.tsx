/**
 * GlassCard — Near-transparent card with visible border frame.
 * Uses colors.surface (3% cream overlay) + colors.border (10% cream line).
 */

import React from 'react';
import { View, ViewStyle } from 'react-native';
import { borderRadius, spacing } from '../theme';
import { useTheme } from '../hooks/useTheme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  noPadding?: boolean;
}

export function GlassCard({ children, style, noPadding }: GlassCardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: borderRadius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.lg,
        },
        noPadding && { padding: 0 },
        style,
      ]}
    >
      {children}
    </View>
  );
}
