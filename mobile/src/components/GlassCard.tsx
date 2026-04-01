/**
 * GlassCard — Clean dark card with v0 surface styling.
 * Uses colors.surface (#141414) + colors.chalkGhost border.
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
          borderColor: colors.chalkGhost,
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
