/**
 * ScrollFadeOverlay — gradient that fades content under a fixed header.
 * Place inside a `{ flex: 1 }` wrapper around your scroll, positioned at top.
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';

const FADE_HEIGHT = 28;

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function ScrollFadeOverlay() {
  const { colors } = useTheme();
  const bg = colors.background;

  return (
    <LinearGradient
      colors={[hexToRgba(bg, 1), hexToRgba(bg, 0)]}
      style={styles.fade}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  fade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: FADE_HEIGHT,
    zIndex: 10,
  },
});
