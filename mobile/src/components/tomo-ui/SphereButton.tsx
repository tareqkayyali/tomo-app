import React from 'react';
import { Pressable, View, Text, StyleSheet, ViewStyle, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Loader } from '../Loader';
import { fontFamily } from '../../theme/typography';

/**
 * SphereButton — Tomo's canonical primary action button.
 * Pill shape: transparent background, 1px cream border.
 * Sphere orb always anchored to the LEFT at x=24 from the left edge.
 * Three states: default, pressed (scale + faint fill), disabled (dim).
 */

export interface SphereButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

const SPRING = { damping: 18, stiffness: 320, mass: 0.8 };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SphereButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  style,
}: SphereButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (disabled || loading) return;
    scale.value = withSpring(0.97, SPRING);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, SPRING);
  };

  const handlePress = () => {
    if (disabled || loading) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onPress();
  };

  return (
    // backgroundColor: 'transparent' at the end ensures no external style bleeds through
    <Animated.View style={[animatedStyle, style, disabled && styles.dimmed, { backgroundColor: 'transparent' }]}>
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={styles.pill}
      >
        {/* Press fill overlay */}
        <View style={styles.pressFill} pointerEvents="none" />

        {/* Content: orb pinned left at x=14, text follows */}
        <View style={styles.content}>
          {loading ? (
            <View style={styles.loaderWrap}>
              <Loader size="sm" />
            </View>
          ) : (
            <>
              {/* Sphere orb */}
              <View style={styles.orbZone}>
                <View style={styles.orbHalo} />
                <LinearGradient
                  colors={['#C8DCC3', '#9AB896', '#7A9B76', '#4F6B4C']}
                  locations={[0, 0.35, 0.7, 1]}
                  start={{ x: 0.38, y: 0.32 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.orbSphere}
                />
                <View style={styles.orbHighlight} />
              </View>

              <Text style={styles.label} numberOfLines={1}>
                {label}
              </Text>
            </>
          )}
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.14)',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    // Row layout so content can fill the width with flex:1
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245,243,237,0.05)',
    borderRadius: 22,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    // Orb left edge at 14px → center at 24px, matching SVG spec
    paddingLeft: 14,
    paddingRight: 20,
    gap: 10,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
  },
  orbZone: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#9AB896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 7,
    elevation: 4,
  },
  orbHalo: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(154,184,150,0.28)',
  },
  orbSphere: {
    width: 12,
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  orbHighlight: {
    position: 'absolute',
    width: 2.8,
    height: 2.8,
    borderRadius: 1.4,
    backgroundColor: 'rgba(255,255,255,0.55)',
    top: 4.6,
    left: 5.1,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: 'rgba(245,243,237,0.82)',
    letterSpacing: 0.15,
  },
  dimmed: {
    opacity: 0.42,
  },
});
