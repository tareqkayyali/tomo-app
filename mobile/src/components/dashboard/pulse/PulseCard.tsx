import React, { type ReactNode } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../hooks/useTheme';

export type PulseCardProps = {
  /** Border + gradient tint (hex like #7A9B76). Defaults to theme sage. */
  tintColor?: string;
  /** Peak opacity of top gradient (0–1). */
  tintOpacity?: number;
  children: ReactNode;
  style?: ViewStyle;
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(122,155,118,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 8-digit #RRGGBBAA border from base hex + '22' alpha channel (~13%). */
function border22(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length === 6) return `#${h}22`;
  return hex;
}

/**
 * Pulse card primitive — cream03 surface, tinted border, top gradient wash.
 */
export function PulseCard({
  tintColor,
  tintOpacity = 0.14,
  children,
  style,
}: PulseCardProps) {
  const { colors } = useTheme();
  const base = tintColor ?? colors.tomoSage;
  const top = hexToRgba(base, tintOpacity);

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.cream03,
          borderColor: border22(base),
        },
        style,
      ]}
    >
      <LinearGradient
        colors={[top, 'transparent']}
        locations={[0, 0.55]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
