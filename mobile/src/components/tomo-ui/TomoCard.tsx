/**
 * TomoCard — Coach-personality card with sketch corners and grain texture.
 *
 * Variants:
 *   default — surface bg, sketch corners, grain overlay
 *   coach   — + 3px orange left border + signature area
 *   alert   — + 3px red left border + warm glow
 */
import React, { memo, useMemo } from 'react';
import { StyleSheet, View, Pressable, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  FadeIn,
  SlideInDown,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { borderRadius, animation } from '../../theme/spacing';
// SketchCorners removed — v0 design uses clean cards

type CardVariant = 'default' | 'coach' | 'alert';

export interface TomoCardProps {
  variant?: CardVariant;
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Stagger index for entrance animation — multiplied by stagger.default */
  enterIndex?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TomoCard: React.FC<TomoCardProps> = memo(({
  variant = 'default',
  children,
  onPress,
  style,
  enterIndex = 0,
}) => {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (onPress) {
      scale.value = withSpring(animation.press.card, animation.spring.snappy);
    }
  };

  const handlePressOut = () => {
    if (onPress) {
      scale.value = withSpring(1, animation.spring.snappy);
    }
  };

  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const variantStyle = useMemo((): ViewStyle => {
    const base: ViewStyle = {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.chalkGhost,
      borderRadius: borderRadius.lg,
      padding: 18,
      overflow: 'hidden',
    };

    if (variant === 'coach') {
      return {
        ...base,
        borderLeftWidth: 3,
        borderLeftColor: colors.coachNoteBorder,
      };
    }
    if (variant === 'alert') {
      return {
        ...base,
        borderLeftWidth: 3,
        borderLeftColor: colors.error,
      };
    }
    return base;
  }, [variant, colors]);

  const enterDelay = enterIndex * animation.stagger.default;

  const Container = onPress ? AnimatedPressable : Animated.View;
  const containerProps = onPress
    ? { onPress: handlePress, onPressIn: handlePressIn, onPressOut: handlePressOut }
    : {};

  return (
    <Container
      entering={FadeIn.delay(enterDelay).duration(animation.duration.normal)}
      style={[variantStyle, pressStyle, style]}
      {...containerProps}
    >
      {children}
    </Container>
  );
});

TomoCard.displayName = 'TomoCard';

export default TomoCard;
