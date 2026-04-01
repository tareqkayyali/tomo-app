/**
 * MetricPill — Tiny inline metric display.
 * Shows label (muted) + value (bold, colored) in a glass pill.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SmartIcon } from '../SmartIcon';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius, fontFamily } from '../../theme';

interface MetricPillProps {
  label: string;
  value: string | number;
  color: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function MetricPill({ label, value, color, icon }: MetricPillProps) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.glass,
        borderRadius: borderRadius.sm,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        alignItems: 'center',
        minWidth: 72,
        borderWidth: 1,
        borderColor: colors.glassBorder,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {icon && (
          <SmartIcon name={icon} size={10} color={colors.textMuted} />
        )}
        <Text
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 9,
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: fontFamily.bold,
          fontSize: 14,
          color,
          marginTop: 1,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
