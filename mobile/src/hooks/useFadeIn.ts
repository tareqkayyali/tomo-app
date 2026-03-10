/**
 * useFadeIn Hook
 * Provides staggered fade-in + slide-up entrance animations for screen elements.
 * Pass `trigger` (e.g. useIsFocused()) to replay the animation on every tab visit.
 */

import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

interface FadeInOptions {
  delay?: number;
  duration?: number;
  translateY?: number;
  /** When provided, animation replays each time trigger becomes true and resets when false. */
  trigger?: boolean;
}

/**
 * Returns an animated style that fades in and slides up on mount.
 * Use `staggerIndex` for staggered entrance of multiple elements.
 */
export function useFadeIn(staggerIndex: number = 0, options: FadeInOptions = {}) {
  const {
    delay = 0,
    duration = 400,
    translateY: translateYAmount = 20,
    trigger,
  } = options;

  const opacity = useSharedValue(0);
  const translate = useSharedValue(translateYAmount);

  useEffect(() => {
    if (trigger === undefined || trigger) {
      opacity.value = 0;
      translate.value = translateYAmount;
      const staggerDelay = delay + staggerIndex * 100;
      opacity.value = withDelay(
        staggerDelay,
        withTiming(1, { duration, easing: Easing.out(Easing.cubic) })
      );
      translate.value = withDelay(
        staggerDelay,
        withTiming(0, { duration, easing: Easing.out(Easing.cubic) })
      );
    } else {
      opacity.value = 0;
      translate.value = translateYAmount;
    }
  }, [trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translate.value }],
  }));

  return animatedStyle;
}
