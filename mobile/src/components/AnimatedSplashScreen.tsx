/**
 * Animated Splash Screen
 * Overlays a branded splash on top of the app content, then fades out.
 *
 * Flow:
 *   1. Native splash (#1A1D2E bg) shows during JS bundle load
 *   2. Fonts finish loading → native splash hides → this component takes over
 *   3. tomo wordmark fades in with orange glow pulse
 *   4. Once `isReady` flips true, waits a beat then fades out
 *   5. Children (app content) are revealed underneath
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { colors, fontFamily } from '../theme';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const shieldLogo = require('../../assets/tomo-logo.png');

interface AnimatedSplashScreenProps {
  children: React.ReactNode;
  /** When true, the splash begins its exit animation */
  isReady: boolean;
}

export function AnimatedSplashScreen({ children, isReady }: AnimatedSplashScreenProps) {
  const [showSplash, setShowSplash] = useState(true);

  // Splash overlay opacity (1 → 0 on exit)
  const overlayOpacity = useSharedValue(1);
  // Wordmark fade-in
  const textOpacity = useSharedValue(0);
  const textScale = useSharedValue(0.92);
  // Glow pulse
  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.6);

  // Phase 1: Entrance animation (runs immediately)
  useEffect(() => {
    // Fade in wordmark
    textOpacity.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    textScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });

    // Glow expands and pulses
    glowOpacity.value = withDelay(200, withTiming(0.7, { duration: 800 }));
    glowScale.value = withDelay(200,
      withSequence(
        withTiming(1.1, { duration: 800, easing: Easing.out(Easing.cubic) }),
        withTiming(0.95, { duration: 600, easing: Easing.inOut(Easing.cubic) }),
        withTiming(1.05, { duration: 600, easing: Easing.inOut(Easing.cubic) }),
      ),
    );
  }, []);

  // Phase 2: Exit animation (when app is ready)
  useEffect(() => {
    if (!isReady) return;

    const hideSplash = () => setShowSplash(false);

    // Wait a moment so the user sees the branding, then fade out
    overlayOpacity.value = withDelay(
      600,
      withTiming(0, { duration: 500, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) {
          runOnJS(hideSplash)();
        }
      }),
    );
  }, [isReady]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ scale: textScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  return (
    <View style={styles.root}>
      {children}
      {showSplash && (
        <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
          {/* Orange glow behind logo */}
          <Animated.View style={[styles.glow, glowStyle]} />

          {/* Shield logo + tomo wordmark */}
          <Animated.View style={[styles.logoGroup, textStyle]}>
            <Image
              source={shieldLogo}
              style={styles.shieldLogo}
              resizeMode="contain"
            />
            <Animated.Text style={styles.wordmark}>
              TOMO
            </Animated.Text>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const GLOW_SIZE = 200;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoGroup: {
    alignItems: 'center',
  },
  shieldLogo: {
    width: 80,
    height: 80,
    tintColor: '#FFFFFF',
    marginBottom: 16,
  },
  wordmark: {
    fontFamily: fontFamily.bold,
    fontSize: 36,
    letterSpacing: 8,
    color: colors.accent1,
    textTransform: 'uppercase',
  },
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    shadowColor: colors.accent1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 60,
    elevation: 20,
  },
});
