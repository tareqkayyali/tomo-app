/**
 * GlowWrapper Component
 * Tomo Design System — selective neon glow effects
 *
 * Applies configurable glow shadow around any child component.
 * Per the UI Aesthetic doc:
 *   - Orange glow: bottom-right of cards (e.g., Streak card)
 *   - Cyan glow:   top-left of cards (e.g., Sleep card)
 *   - Ring glow:   avatar borders, #1 leaderboard position
 *   - Subtle glow: interactive elements
 *
 * Enhanced modes:
 *   - animated: glow intensity pulses on tap (Pressable wrapper)
 *   - breathing: continuous glow opacity oscillation (AI content)
 *
 * Usage:
 *   <GlowWrapper glow="orange">
 *     <Card>...</Card>
 *   </GlowWrapper>
 *
 *   <GlowWrapper glow="orange" animated>
 *     <Card onPress={...}>...</Card>
 *   </GlowWrapper>
 *
 *   <GlowWrapper glow="orange" breathing>
 *     <Card>AI Recommended</Card>
 *   </GlowWrapper>
 */

import React, { ReactNode, useEffect } from 'react';
import { View, Pressable, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { shadows } from '../theme';

export type GlowPreset = 'orange' | 'cyan' | 'ring' | 'subtle' | 'none';

interface GlowWrapperProps {
  children: ReactNode;
  glow?: GlowPreset;
  /** Override with a fully custom shadow style */
  customShadow?: ViewStyle;
  style?: ViewStyle;
  /** Animate glow intensity on tap */
  animated?: boolean;
  /** Continuous breathing glow pulse (for AI content) */
  breathing?: boolean;
}

const glowMap: Record<GlowPreset, ViewStyle> = {
  orange: shadows.glowOrange,
  cyan: shadows.glowCyan,
  ring: shadows.glowOrangeRing,
  subtle: shadows.glowSubtle,
  none: {},
};

// Base opacity values per preset (used as resting state for animations)
const baseOpacity: Record<GlowPreset, number> = {
  orange: 0.20,
  cyan: 0.25,
  ring: 0.30,
  subtle: 0.10,
  none: 0,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function GlowWrapper({
  children,
  glow = 'none',
  customShadow,
  style,
  animated = false,
  breathing = false,
}: GlowWrapperProps) {
  const shadowStyle = customShadow || glowMap[glow];
  const restingOpacity = baseOpacity[glow];

  // ── No glow: plain wrapper ─────────────────────────────────────────
  if (glow === 'none' && !customShadow) {
    return <View style={style}>{children}</View>;
  }

  // ── Breathing mode: continuous opacity pulse ───────────────────────
  if (breathing) {
    return (
      <BreathingGlow
        shadowStyle={shadowStyle}
        restingOpacity={restingOpacity}
        style={style}
      >
        {children}
      </BreathingGlow>
    );
  }

  // ── Animated tap mode: pulse on press ──────────────────────────────
  if (animated) {
    return (
      <TapGlow
        shadowStyle={shadowStyle}
        restingOpacity={restingOpacity}
        style={style}
      >
        {children}
      </TapGlow>
    );
  }

  // ── Static glow (default) ──────────────────────────────────────────
  return (
    <View style={[shadowStyle, style]}>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Breathing Glow — continuous opacity oscillation
// ---------------------------------------------------------------------------

function BreathingGlow({
  children,
  shadowStyle,
  restingOpacity,
  style,
}: {
  children: ReactNode;
  shadowStyle: ViewStyle;
  restingOpacity: number;
  style?: ViewStyle;
}) {
  const opacity = useSharedValue(restingOpacity);

  useEffect(() => {
    const peakOpacity = Math.min(restingOpacity * 2.2, 0.6);
    opacity.value = withRepeat(
      withSequence(
        withTiming(peakOpacity, {
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(restingOpacity, {
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      false,
    );
  }, [restingOpacity]);

  const animatedShadow = useAnimatedStyle(() => ({
    ...shadowStyle,
    shadowOpacity: opacity.value,
  }));

  return (
    <Animated.View style={[animatedShadow, style]}>
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Tap Glow — pulse on press
// ---------------------------------------------------------------------------

function TapGlow({
  children,
  shadowStyle,
  restingOpacity,
  style,
}: {
  children: ReactNode;
  shadowStyle: ViewStyle;
  restingOpacity: number;
  style?: ViewStyle;
}) {
  const opacity = useSharedValue(restingOpacity);

  const onPressIn = () => {
    const peakOpacity = Math.min(restingOpacity * 2.5, 0.65);
    opacity.value = withTiming(peakOpacity, { duration: 150 });
  };

  const onPressOut = () => {
    opacity.value = withTiming(restingOpacity, { duration: 300 });
  };

  const animatedShadow = useAnimatedStyle(() => ({
    ...shadowStyle,
    shadowOpacity: opacity.value,
  }));

  return (
    <AnimatedPressable
      style={[animatedShadow, style]}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      {children}
    </AnimatedPressable>
  );
}
