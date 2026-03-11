/**
 * Animated Splash Screen — Brand Kit 2026
 * Overlays a branded splash on top of the app content, then fades out.
 *
 * Flow:
 *   1. Native splash (#0A0A0A bg) shows during JS bundle load
 *   2. Fonts finish loading → native splash hides → this component takes over
 *   3. tomo logo fades in with green glow pulse
 *   4. Once `isReady` flips true, waits a beat then fades out
 *   5. Children (app content) are revealed underneath
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image, Platform, Text } from 'react-native';
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

// Brand logo — transparent background, white text with green signal arcs
// eslint-disable-next-line @typescript-eslint/no-var-requires
const brandLogo = require('../../assets/tomo-logo.png');

interface AnimatedSplashScreenProps {
  children: React.ReactNode;
  /** When true, the splash begins its exit animation */
  isReady: boolean;
}

export function AnimatedSplashScreen({ children, isReady }: AnimatedSplashScreenProps) {
  const [showSplash, setShowSplash] = useState(true);

  // Splash overlay opacity (1 → 0 on exit)
  const overlayOpacity = useSharedValue(1);
  // Logo fade-in
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.92);
  // Glow pulse
  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.6);
  // Tagline fade-in (slightly delayed)
  const taglineOpacity = useSharedValue(0);

  // Phase 1: Entrance animation (runs immediately)
  useEffect(() => {
    // Fade in logo
    logoOpacity.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    logoScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });

    // Glow expands and pulses (Tomo Green)
    glowOpacity.value = withDelay(200, withTiming(0.7, { duration: 800 }));
    glowScale.value = withDelay(200,
      withSequence(
        withTiming(1.1, { duration: 800, easing: Easing.out(Easing.cubic) }),
        withTiming(0.95, { duration: 600, easing: Easing.inOut(Easing.cubic) }),
        withTiming(1.05, { duration: 600, easing: Easing.inOut(Easing.cubic) }),
      ),
    );

    // Tagline fades in after logo
    taglineOpacity.value = withDelay(500, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
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

    // Safety fallback for web: if reanimated callback doesn't fire, hide after 2s
    if (Platform.OS === 'web') {
      const fallback = setTimeout(hideSplash, 2000);
      return () => clearTimeout(fallback);
    }
  }, [isReady]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
  }));

  return (
    <View style={styles.root}>
      {children}
      {showSplash && (
        <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
          {/* Green glow behind logo */}
          <Animated.View style={[styles.glow, glowStyle]} />

          {/* Brand logo (tomo + signal arcs) */}
          <Animated.View style={[styles.logoGroup, logoStyle]}>
            <Image
              source={brandLogo}
              style={styles.brandLogo}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Tagline: TRAIN SMARTER */}
          <Animated.View style={[styles.taglineContainer, taglineStyle]}>
            <Text style={styles.tagline}>TRAIN SMARTER</Text>
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
    backgroundColor: '#0A0A0A',           // Tomo Black
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoGroup: {
    alignItems: 'center',
  },
  brandLogo: {
    width: 200,
    height: 200,
    marginBottom: 8,
  },
  taglineContainer: {
    marginTop: 4,
  },
  tagline: {
    fontFamily: fontFamily.light,         // Poppins Light — matches brand kit tagline weight
    fontSize: 12,
    letterSpacing: 6,                     // Wide tracking per brand kit (+0.15em × 12 ≈ 1.8, bumped for visual match)
    color: '#B0B0B0',                     // Gray — per brand kit
    textTransform: 'uppercase',
  },
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: 'rgba(46, 204, 113, 0.15)',  // Tomo Green glow
    shadowColor: '#2ECC71',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 60,
    elevation: 20,
  },
});
