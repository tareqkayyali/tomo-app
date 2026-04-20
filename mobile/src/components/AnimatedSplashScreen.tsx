/**
 * Animated Splash Screen
 * Overlays a branded splash on top of the app content, then fades out.
 *
 * Flow:
 *   1. Native splash (Kon #12141F bg, splash-icon.png) shows during JS
 *      bundle load.
 *   2. Fonts finish loading → native splash hides → this component takes
 *      over rendering the SAME composition (orb + ring + "tomo" + tagline).
 *   3. Composition fades in gently.
 *   4. Once `isReady` flips true, waits a beat then fades out.
 *   5. Children (app content) are revealed underneath.
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { colors } from '../theme';

// Splash composition — orb + ring + "tomo" wordmark + tagline, baked as PNG.
// Shared with the native splash (app.json) so the JS overlay is a seamless
// continuation rather than a branding change.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const splashComposition = require('../../assets/splash-icon.png');

interface AnimatedSplashScreenProps {
  children: React.ReactNode;
  /** When true, the splash begins its exit animation */
  isReady: boolean;
}

export function AnimatedSplashScreen({ children, isReady }: AnimatedSplashScreenProps) {
  const [showSplash, setShowSplash] = useState(true);

  // Splash overlay opacity (1 → 0 on exit)
  const overlayOpacity = useSharedValue(1);
  // Composition fade-in
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.96);

  // Phase 1: Entrance animation (runs immediately)
  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    logoScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [logoOpacity, logoScale]);

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

  return (
    <View style={styles.root}>
      {children}
      {showSplash && (
        <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
          {/* Single composited image — orb + ring + "tomo" + tagline all
              baked into splash-icon.png so this overlay is a cross-fade of
              the native splash rather than a distinct second brand moment. */}
          <Animated.View style={[styles.logoGroup, logoStyle]}>
            <Image
              source={splashComposition}
              style={styles.brandImage}
              resizeMode="contain"
            />
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

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
    justifyContent: 'center',
    flex: 1,
    alignSelf: 'stretch',
  },
  // Full composition covers the available area so the orb, "tomo" wordmark,
  // and tagline keep their baked-in spacing from splash-icon.png.
  brandImage: {
    width: '100%',
    height: '100%',
  },
});
