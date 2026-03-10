/**
 * Card Component
 * Tomo Design System — matches UI Aesthetic Features doc
 *
 * Variants:
 *   rounded   — Type 2: Rounded Rectangle, 16px radius, white card
 *   blob      — Type 1: Organic Fluid Blob, asymmetric radii 30-60px
 *   blobTeardrop — Teardrop: rounded top, tapered bottom
 *   blobCurved   — Curved-top: wide sweep top, tight bottom
 *   muted     — Platinum Gray #ECECF1 (chat bubbles, secondary info)
 *   elevated  — White card with prominent shadow
 *   outlined  — Transparent with subtle border (on dark bg)
 *
 * All cards render correctly on the #1A1D2E dark navy background.
 */

import React, { ReactNode, useMemo } from 'react';
import { View, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Svg, { Path, Defs, ClipPath } from 'react-native-svg';
import { spacing, borderRadius, shadows } from '../theme';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';

type CardVariant = 'rounded' | 'blob' | 'blobTeardrop' | 'blobCurved' | 'muted' | 'elevated' | 'outlined' | 'default';

interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: CardVariant;
  onPress?: () => void;
  /** Override background color */
  backgroundColor?: string;
}

/**
 * Organic blob SVG clip path — irregular curves between 30-60px radii.
 * The path is sized to 1000x1000 and scaled via viewBox so it fits any card.
 */
function BlobClip({ width, height }: { width: number; height: number }) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 1000 1000"
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        <ClipPath id="blobClip">
          <Path
            d={
              'M60,0 L940,0 Q1000,0 1000,60 ' +
              'L1000,900 Q1000,1000 900,1000 ' +
              'L100,1000 Q0,1000 0,940 ' +
              'L0,100 Q0,0 60,0 Z'
            }
          />
        </ClipPath>
      </Defs>
    </Svg>
  );
}

export function Card({
  children,
  style,
  variant = 'rounded',
  onPress,
  backgroundColor,
}: CardProps) {
  const { colors } = useTheme();
  const themedVariants = useMemo(() => createVariantStyles(colors), [colors]);
  const resolvedVariant = variant === 'default' ? 'rounded' : variant;
  const variantStyle = themedVariants[resolvedVariant];
  const bgOverride = backgroundColor ? { backgroundColor } : undefined;

  // ── Blob card variants: asymmetric border radii ─────────────────
  if (variant === 'blob' || variant === 'blobTeardrop' || variant === 'blobCurved') {
    const inner = (
      <View style={[styles.base, variantStyle, bgOverride, style]}>
        {children}
      </View>
    );

    if (onPress) {
      return (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          {inner}
        </Pressable>
      );
    }
    return inner;
  }

  // ── Standard variants ─────────────────────────────────────────────
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.base,
          variantStyle,
          bgOverride,
          pressed && styles.pressed,
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[styles.base, variantStyle, bgOverride, style]}>
      {children}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    padding: spacing.lg,      // 20px internal padding per spec
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.95,
    transform: [{ scale: 0.99 }],
  },
});

function createVariantStyles(colors: ThemeColors) {
  return StyleSheet.create({
    rounded: {
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.lg,
      ...shadows.sm,
    },
    blob: {
      backgroundColor: colors.cardLight,
      borderTopLeftRadius: borderRadius.blobMax,
      borderTopRightRadius: borderRadius.blobMin,
      borderBottomLeftRadius: borderRadius.blobMid,
      borderBottomRightRadius: borderRadius.blobMax,
      ...shadows.md,
    },
    blobTeardrop: {
      backgroundColor: colors.cardLight,
      borderTopLeftRadius: borderRadius.blobMax,
      borderTopRightRadius: borderRadius.blobMax,
      borderBottomLeftRadius: borderRadius.blobMin,
      borderBottomRightRadius: borderRadius.blobMid,
      ...shadows.md,
    },
    blobCurved: {
      backgroundColor: colors.cardLight,
      borderTopLeftRadius: borderRadius.blobMid,
      borderTopRightRadius: borderRadius.blobMid,
      borderBottomLeftRadius: borderRadius.blobMax,
      borderBottomRightRadius: borderRadius.blobMin,
      ...shadows.md,
    },
    muted: {
      backgroundColor: colors.cardMuted,
      borderRadius: borderRadius.lg,
      ...shadows.sm,
    },
    elevated: {
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.lg,
      ...shadows.lg,
    },
    outlined: {
      backgroundColor: 'transparent',
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
  });
}

// Re-export BlobClip for advanced use cases (e.g., custom SVG masks)
export { BlobClip };
