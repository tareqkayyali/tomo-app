/**
 * useBreathing Hook
 * Provides a subtle continuous scale oscillation for "alive" UI elements.
 *
 * Used on AI-recommended content to give cards a breathing feel.
 * Default: 1.0 → 1.015 → 1.0 over 3 seconds, repeating.
 */

import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface BreathingOptions {
  /** Peak scale (default 1.015 — very subtle) */
  amplitude?: number;
  /** Full inhale+exhale cycle in ms (default 3000) */
  duration?: number;
  /** Whether the animation is active (default true) */
  active?: boolean;
}

export function useBreathing(options: BreathingOptions = {}) {
  const {
    amplitude = 1.015,
    duration = 3000,
    active = true,
  } = options;

  const scale = useSharedValue(1);

  useEffect(() => {
    if (!active) {
      scale.value = 1;
      return;
    }

    const halfDuration = duration / 2;

    scale.value = withRepeat(
      withSequence(
        withTiming(amplitude, {
          duration: halfDuration,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(1, {
          duration: halfDuration,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1, // infinite repeat
      false,
    );
  }, [active, amplitude, duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return animatedStyle;
}
