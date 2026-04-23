/**
 * AppAtmosphere — Persistent depth layer wrapping all screens.
 *
 * Replaces flat #0A0A0A with:
 *   1. Base fill (theme background)
 *   2. Subtle warm radial gradient (top-center)
 *   3. Ambient floating blobs (very low opacity)
 *   4. Grain noise overlay
 *
 * Performance: all overlays are position-absolute, pointerEvents='none',
 * wrapped in useMemo — never re-renders when screen content changes.
 *
 * Usage: wrap around navigation inside the provider tree.
 *   <AppAtmosphere>
 *     <RootNavigator />
 *   </AppAtmosphere>
 */
import React, { memo, useMemo } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { atmosphere } from '../../theme/spacing';
import { screenBg } from '../../theme/colors';
import { AmbientBlobs } from '../../assets/atmosphere';

type AtmosphereIntensity = 'subtle' | 'warm' | 'none';

export interface AppAtmosphereProps {
  children: React.ReactNode;
  /** Control atmosphere visibility per-screen — default 'subtle' */
  intensity?: AtmosphereIntensity;
}

const AppAtmosphere: React.FC<AppAtmosphereProps> = memo(({
  children,
  intensity = 'subtle',
}) => {
  const { colors } = useTheme();

  const gradientLayer = useMemo(() => {
    if (intensity === 'none') return null;

    const gradientOpacity = intensity === 'warm' ? 0.08 : 0.04;

    return (
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Svg width="100%" height="60%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <RadialGradient id="warmGlow" cx="50%" cy="0%" r="80%">
              <Stop offset="0%" stopColor={colors.tomoOrange} stopOpacity={gradientOpacity} />
              <Stop offset="100%" stopColor={colors.tomoOrange} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#warmGlow)" />
        </Svg>
      </View>
    );
  }, [intensity, colors.tomoOrange]);

  const blobLayer = useMemo(() => {
    if (intensity === 'none') return null;
    const blobOpacity = intensity === 'warm' ? 0.06 : 0.035;
    return (
      <AmbientBlobs
        warmColor={colors.tomoOrange}
        coolColor={colors.tomoTeal}
        opacity={blobOpacity}
      />
    );
  }, [intensity, colors.tomoOrange, colors.tomoTeal]);

  // Grain overlay — SVG feTurbulence doesn't work on all RN platforms,
  // so we use a simple semi-transparent noise pattern via opacity dots.
  // On web, the full SVG filter works.
  const grainLayer = useMemo(() => {
    if (intensity === 'none') return null;
    if (Platform.OS === 'web') {
      // Web: use inline SVG noise filter
      return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Svg width="100%" height="100%" style={{ opacity: atmosphere.grain.opacity }}>
            <Defs>
              {/* @ts-ignore — feTurbulence works in web SVG */}
              <filter id="grainFilter" x="0" y="0" width="100%" height="100%">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency={atmosphere.grain.frequency}
                  numOctaves={3}
                  stitchTiles="stitch"
                />
              </filter>
            </Defs>
            <Rect
              x="0" y="0" width="100%" height="100%"
              fill="transparent"
              filter="url(#grainFilter)"
            />
          </Svg>
        </View>
      );
    }
    // Native: skip grain (feTurbulence not supported in react-native-svg).
    // The ambient blobs + gradient provide enough atmosphere on native.
    return null;
  }, [intensity]);

  // On web, screenBg is transparent so the body's injected starfield
  // background shows through; colors.background (#12141F) is retained on native.
  const rootBg = Platform.OS === 'web' ? screenBg : colors.background;

  return (
    <View style={[styles.root, { backgroundColor: rootBg }]}>
      {gradientLayer}
      {blobLayer}
      {grainLayer}
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

AppAtmosphere.displayName = 'AppAtmosphere';

export default AppAtmosphere;
