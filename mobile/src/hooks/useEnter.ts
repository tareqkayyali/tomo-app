/**
 * useEnter — staggered mount-in animation (opacity 0→1 + translateY 8→0).
 *
 * Matches the Signal Dashboard prototype's "each section fades up on arrival"
 * behavior. Returns a `style` object to spread onto an `Animated.View`.
 *
 *   const enterStyle = useEnter(160); // delay in ms
 *   <Animated.View style={enterStyle}>…</Animated.View>
 */

import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

export function useEnter(delay: number = 0, duration: number = 320) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration, easing: EASE_OUT }),
    );
  }, [delay, duration, progress]);

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: 8 * (1 - progress.value) }],
  }));
}
