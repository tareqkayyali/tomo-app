/**
 * AmbientBlobs — Soft, animated background blobs for atmospheric depth.
 * Creates 3 large, blurred gradient circles that slowly float.
 * Positioned absolute behind all content.
 *
 * Usage: <AmbientBlobs /> inside AppAtmosphere wrapper.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Circle,
} from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';

interface AmbientBlobsProps {
  /** Primary warm color — default Tomo Orange at very low opacity */
  warmColor?: string;
  /** Secondary cool color — default Tomo Teal at very low opacity */
  coolColor?: string;
  /** Overall blob opacity — default 0.04 (barely visible) */
  opacity?: number;
}

const AnimatedView = Animated.createAnimatedComponent(View);

const BLOB_DURATION = 18000; // 18s full cycle — slow, ambient

const AmbientBlobs: React.FC<AmbientBlobsProps> = memo(({
  warmColor = '#7A9B76',
  coolColor = '#5A6B7C',
  opacity = 0.04,
}) => {
  const translateY1 = useSharedValue(0);
  const translateX1 = useSharedValue(0);
  const translateY2 = useSharedValue(0);
  const translateX2 = useSharedValue(0);
  const translateY3 = useSharedValue(0);
  const translateX3 = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);

    // Blob 1 — warm, top-right drift
    translateY1.value = withRepeat(
      withSequence(
        withTiming(-25, { duration: BLOB_DURATION, easing: ease }),
        withTiming(25, { duration: BLOB_DURATION, easing: ease }),
      ),
      -1, true,
    );
    translateX1.value = withRepeat(
      withDelay(2000, withSequence(
        withTiming(20, { duration: BLOB_DURATION * 0.8, easing: ease }),
        withTiming(-20, { duration: BLOB_DURATION * 0.8, easing: ease }),
      )),
      -1, true,
    );

    // Blob 2 — cool, bottom-left drift
    translateY2.value = withRepeat(
      withDelay(4000, withSequence(
        withTiming(20, { duration: BLOB_DURATION * 1.1, easing: ease }),
        withTiming(-20, { duration: BLOB_DURATION * 1.1, easing: ease }),
      )),
      -1, true,
    );
    translateX2.value = withRepeat(
      withDelay(6000, withSequence(
        withTiming(-25, { duration: BLOB_DURATION * 0.9, easing: ease }),
        withTiming(25, { duration: BLOB_DURATION * 0.9, easing: ease }),
      )),
      -1, true,
    );

    // Blob 3 — warm accent, center drift
    translateY3.value = withRepeat(
      withDelay(8000, withSequence(
        withTiming(15, { duration: BLOB_DURATION * 1.2, easing: ease }),
        withTiming(-15, { duration: BLOB_DURATION * 1.2, easing: ease }),
      )),
      -1, true,
    );
    translateX3.value = withRepeat(
      withSequence(
        withTiming(15, { duration: BLOB_DURATION, easing: ease }),
        withTiming(-15, { duration: BLOB_DURATION, easing: ease }),
      ),
      -1, true,
    );
  }, []);

  const blob1Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX1.value },
      { translateY: translateY1.value },
    ],
  }));

  const blob2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX2.value },
      { translateY: translateY2.value },
    ],
  }));

  const blob3Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX3.value },
      { translateY: translateY3.value },
    ],
  }));

  return (
    <View style={[StyleSheet.absoluteFillObject, { opacity }]} pointerEvents="none">
      {/* Blob 1 — Warm, top-right area */}
      <AnimatedView style={[styles.blobContainer, styles.blob1Pos, blob1Style]}>
        <Svg width={300} height={300}>
          <Defs>
            <RadialGradient id="warmBlob" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={warmColor} stopOpacity={1} />
              <Stop offset="100%" stopColor={warmColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={150} cy={150} r={150} fill="url(#warmBlob)" />
        </Svg>
      </AnimatedView>

      {/* Blob 2 — Cool, bottom-left area */}
      <AnimatedView style={[styles.blobContainer, styles.blob2Pos, blob2Style]}>
        <Svg width={250} height={250}>
          <Defs>
            <RadialGradient id="coolBlob" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={coolColor} stopOpacity={1} />
              <Stop offset="100%" stopColor={coolColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={125} cy={125} r={125} fill="url(#coolBlob)" />
        </Svg>
      </AnimatedView>

      {/* Blob 3 — Warm accent, center area */}
      <AnimatedView style={[styles.blobContainer, styles.blob3Pos, blob3Style]}>
        <Svg width={200} height={200}>
          <Defs>
            <RadialGradient id="accentBlob" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={warmColor} stopOpacity={0.6} />
              <Stop offset="100%" stopColor={warmColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={100} cy={100} r={100} fill="url(#accentBlob)" />
        </Svg>
      </AnimatedView>
    </View>
  );
});

const styles = StyleSheet.create({
  blobContainer: {
    position: 'absolute',
  },
  blob1Pos: {
    top: -80,
    right: -100,
  },
  blob2Pos: {
    bottom: 100,
    left: -80,
  },
  blob3Pos: {
    top: '40%' as unknown as number,
    left: '20%' as unknown as number,
  },
});

AmbientBlobs.displayName = 'AmbientBlobs';

export default AmbientBlobs;
