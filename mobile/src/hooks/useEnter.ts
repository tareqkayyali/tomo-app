/**
 * useEnter — fade + rise-in animation on mount with optional delay.
 *
 * Port of the Player App design's `useEnter` hook. Returns a style object
 * suitable for RN `Animated` or a plain style with a key-based remount.
 *
 * Since RN has no CSS transition, we use Animated under the hood.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

export interface EnterStyle {
  opacity: Animated.Value;
  transform: Array<{ translateY: Animated.Value }>;
}

/**
 * Usage:
 *   const enter = useEnter(120);
 *   <Animated.View style={[styles.card, enter]} />
 */
export function useEnter(delay = 0): EnterStyle {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        delay,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 500,
        delay,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return { opacity, transform: [{ translateY }] };
}
