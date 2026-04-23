/**
 * Loader — The single Tomo loader. Orbit SVG, brand gradient, looping.
 *
 * Use for indeterminate waits only: initial load, pending fetches,
 * suspense boundaries, optimistic UI fallbacks. Do not use for:
 *   - progress bars / determinate progress
 *   - skeleton shimmer (use a skeleton component)
 *   - error states or decorative placeholders
 *
 * Sizes — pick one of the three, don't invent:
 *   sm (24) — inline within rows, buttons-in-loading-state, input affixes
 *   md (48, default) — card skeletons, section-level fetches, panels
 *   lg (72) — full-screen loads, app boot, route transitions, empty states
 *
 * Cross-platform: renders the shared orbit SVG via react-native-svg
 * (works on web + iOS + Android) and rotates it with the native-driver
 * Animated API. The asset lacks baked-in animation by design, so the
 * rotation is applied here exactly once — keeping the SVG a static
 * asset the design team can edit without touching animation code.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { ORBIT_LOADER_XML } from '../assets/loaders/loaderOrbitXml';

export type LoaderSize = 'sm' | 'md' | 'lg' | 24 | 48 | 72;

export interface LoaderProps {
  /** sm=24 (inline), md=48 (default, section), lg=72 (full-screen). */
  size?: LoaderSize;
  /** Optional outer style for layout/positioning (not colour or shadow). */
  style?: ViewStyle;
  /** Accessibility label. Defaults to "Loading". */
  accessibilityLabel?: string;
}

const SIZE_MAP: Record<'sm' | 'md' | 'lg', 24 | 48 | 72> = {
  sm: 24,
  md: 48,
  lg: 72,
};

/** One revolution per 1.4s — standard indeterminate cadence. */
const ROTATION_DURATION_MS = 1400;

function resolveSize(size: LoaderSize | undefined): number {
  if (typeof size === 'number') return size;
  return SIZE_MAP[size ?? 'md'];
}

export const Loader: React.FC<LoaderProps> = ({
  size,
  style,
  accessibilityLabel = 'Loading',
}) => {
  const px = resolveSize(size);
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: ROTATION_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View
      style={[styles.wrap, { width: px, height: px }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessible
    >
      <Animated.View style={{ width: px, height: px, transform: [{ rotate }] }}>
        <SvgXml xml={ORBIT_LOADER_XML} width={px} height={px} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Loader;
