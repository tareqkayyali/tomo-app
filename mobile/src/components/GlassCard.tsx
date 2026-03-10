/**
 * GlassCard — Dark integrated card with subtle glass border
 * Replaces all white cards. Seamless with background.
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
          backgroundColor: colors.glass,
          borderRadius: borderRadius.lg,
          borderWidth: 1,
          borderColor: colors.glassBorder,
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
