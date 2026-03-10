/**
 * Animation Hooks
 * Premium spring/timing animations shared across all sport screens.
 * All use react-native-reanimated 4.x APIs.
 */

import { useEffect, useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

// ─── Spring Entrance (staggered) ─────────────────────────────────────

export function useSpringEntrance(index: number = 0, delay: number = 0, trigger?: boolean) {
  const translateY = useSharedValue(30);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (trigger === undefined || trigger) {
      translateY.value = 30;
      opacity.value = 0;
      const staggerDelay = delay + index * 80;
      translateY.value = withDelay(
        staggerDelay,
        withSpring(0, { damping: 12, stiffness: 100 }),
      );
      opacity.value = withDelay(
        staggerDelay,
        withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) }),
      );
    } else {
      translateY.value = 30;
      opacity.value = 0;
    }
  }, [trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return animatedStyle;
}

// ─── Scale on Press ──────────────────────────────────────────────────

export function useScaleOnPress(targetScale: number = 0.97) {
  const scale = useSharedValue(1);

  const onPressIn = useCallback(() => {
    scale.value = withSpring(targetScale, { damping: 15, stiffness: 150 });
  }, []);

  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return { animatedStyle, onPressIn, onPressOut };
}

// ─── Animated Counter ────────────────────────────────────────────────

export function useAnimatedCounter(
  target: number,
  duration: number = 1200,
  delay: number = 200,
) {
  const value = useSharedValue(0);

  useEffect(() => {
    value.value = withDelay(
      delay,
      withTiming(target, {
        duration,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [target]);

  return value;
}

// ─── Radar Grow ──────────────────────────────────────────────────────

export function useRadarGrow(animate: boolean = true) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (animate) {
      progress.value = withDelay(
        300,
        withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }),
      );
    } else {
      progress.value = 1;
    }
  }, [animate]);

  return progress;
}

// ─── Pulse Animation ─────────────────────────────────────────────────

export function usePulse(minScale: number = 1, maxScale: number = 1.15) {
  const scale = useSharedValue(minScale);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(maxScale, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(minScale, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return animatedStyle;
}

// ─── Bar Fill Animation ──────────────────────────────────────────────

export function useBarFill(target: number, delay: number = 0, trigger?: boolean) {
  const width = useSharedValue(0);

  useEffect(() => {
    if (trigger === undefined || trigger) {
      width.value = 0;
      width.value = withDelay(
        delay,
        withTiming(target, { duration: 800, easing: Easing.out(Easing.cubic) }),
      );
    } else {
      width.value = 0;
    }
  }, [target, trigger]);

  return width;
}

// ─── Shimmer / Glow for Tier Borders ─────────────────────────────────

export function useTierShimmer(enabled: boolean = false) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (enabled) {
      shimmer.value = withRepeat(
        withTiming(1, { duration: 3000, easing: Easing.linear }),
        -1,
        false,
      );
    }
  }, [enabled]);

  return shimmer;
}

// ─── Slide In From Side ──────────────────────────────────────────────

export function useSlideIn(
  direction: 'left' | 'right' = 'right',
  index: number = 0,
  delay: number = 0,
  trigger?: boolean,
) {
  const initialX = direction === 'right' ? 60 : -60;
  const translateX = useSharedValue(initialX);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (trigger === undefined || trigger) {
      translateX.value = initialX;
      opacity.value = 0;
      const staggerDelay = delay + index * 60;
      translateX.value = withDelay(
        staggerDelay,
        withSpring(0, { damping: 14, stiffness: 90 }),
      );
      opacity.value = withDelay(
        staggerDelay,
        withTiming(1, { duration: 300 }),
      );
    } else {
      translateX.value = initialX;
      opacity.value = 0;
    }
  }, [trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return animatedStyle;
}
