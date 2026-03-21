/**
 * DualLoadBar — Inline dual-segment bar showing athletic vs academic load split.
 *
 * Renders an orange (athletic) + cyan (academic) proportional bar with labels.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';

interface DualLoadBarProps {
  athleticLoad: number;
  academicLoad: number;
}

export function DualLoadBar({ athleticLoad, academicLoad }: DualLoadBarProps) {
  const { colors } = useTheme();
  const total = athleticLoad + academicLoad;
  if (total <= 0) return null;

  const athleticPct = (athleticLoad / total) * 100;
  const academicPct = (academicLoad / total) * 100;

  return (
    <View style={{ marginTop: spacing.sm }}>
      {/* Bar */}
      <View
        style={{
          flexDirection: 'row',
          height: 6,
          borderRadius: 3,
          overflow: 'hidden',
          backgroundColor: colors.glassBorder,
        }}
      >
        {athleticPct > 0 && (
          <View
            style={{
              width: `${athleticPct}%`,
              backgroundColor: colors.accent,
              borderTopLeftRadius: 3,
              borderBottomLeftRadius: 3,
            }}
          />
        )}
        {academicPct > 0 && (
          <View
            style={{
              width: `${academicPct}%`,
              backgroundColor: colors.info,
              borderTopRightRadius: 3,
              borderBottomRightRadius: 3,
            }}
          />
        )}
      </View>

      {/* Labels */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 3,
        }}
      >
        <Text
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 10,
            color: colors.accent,
          }}
        >
          Athletic {Math.round(athleticLoad)} AU
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 10,
            color: colors.info,
          }}
        >
          Academic {Math.round(academicLoad)} AU
        </Text>
      </View>
    </View>
  );
}
