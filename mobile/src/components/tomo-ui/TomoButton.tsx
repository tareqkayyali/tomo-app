/**
 * TomoButton — v0 GlossyButton style. Gradient + glass highlight + inner border.
 *
 * Variants:
 *   primary (green) — Electric Green glossy gradient, dark text
 *   orange           — Warm Orange glossy gradient, dark text
 *   secondary        — transparent, border, accent text
 *   ghost            — no border, accent text only
 */
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Loader } from '../Loader';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { borderRadius, animation } from '../../theme/spacing';
import TomoIcon from './TomoIcon';

import { colors } from '../../theme/colors';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ButtonVariant = 'primary' | 'orange' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface TomoButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string;
  onPress: () => void;
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
}

const SIZE_STYLES: Record<ButtonSize, { height: number; paddingH: number; fontSize: number }> = {
  sm: { height: 36, paddingH: 18, fontSize: 12 },
  md: { height: 44, paddingH: 24, fontSize: 14 },
  lg: { height: 52, paddingH: 32, fontSize: 15 },
};

const TomoButton: React.FC<TomoButtonProps> = memo(({
  variant = 'primary',
  size = 'md',
  label,
  onPress,
  icon,
  loading = false,
  disabled = false,
}) => {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const handlePressIn = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(0.98, animation.spring.snappy);
      translateY.value = withSpring(1, animation.spring.snappy);
    }
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, animation.spring.snappy);
    translateY.value = withSpring(0, animation.spring.snappy);
  };
  const handlePress = () => {
    if (!disabled && !loading) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onPress();
    }
  };

  const isGlossy = variant === 'primary' || variant === 'orange';
  const isGhost = variant === 'ghost';
  const sizeStyle = SIZE_STYLES[size];
  const opacity = disabled ? 0.4 : 1;

  // Glossy variants use dark text on bright bg
  const textColor = isGlossy ? colors.cream : colors.electricGreen;
  const iconColor = isGlossy ? colors.cream : colors.electricGreen;

  // Gradient colors per variant
  const gradientColors: [string, string, string, string] = variant === 'orange'
    ? [colors.tomoOrange, '#D89052', '#C67933', colors.accent]
    : ['#C8DCC3', '#9AB896', '#7A9B76', '#4F6B4C'];

  const content = (
    <View style={styles.inner}>
      {loading ? (
        <Loader size="sm" />
      ) : (
        <>
          {icon && <TomoIcon name={icon} size={sizeStyle.fontSize + 4} color={iconColor} />}
          <Text style={[styles.label, { color: textColor, fontSize: sizeStyle.fontSize }]}>{label}</Text>
        </>
      )}
    </View>
  );

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[pressStyle, { opacity }]}
    >
      {isGlossy ? (
        <View style={[styles.glossyWrap, { height: sizeStyle.height, paddingHorizontal: sizeStyle.paddingH }]}>
          {/* Base gradient */}
          <LinearGradient
            colors={gradientColors}
            locations={[0, 0.35, 0.7, 1]}
            start={{ x: 0.3, y: 0.2 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: 22 }]}
          />
          {/* Subtle top sheen */}
          <LinearGradient
            colors={['rgba(245,243,237,0.18)', 'rgba(245,243,237,0.05)', 'transparent']}
            locations={[0, 0.32, 0.65]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: 22 }]}
          />
          {/* Inner border highlight */}
          <View style={styles.innerBorder} />
          {content}
        </View>
      ) : (
        <View
          style={[
            styles.flatBase,
            { height: sizeStyle.height, paddingHorizontal: sizeStyle.paddingH },
            !isGhost && { borderWidth: 1, borderColor: colors.electricGreenDim },
          ]}
        >
          {content}
        </View>
      )}
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  glossyWrap: {
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#7A9B76',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 7,
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.22)',
  },
  flatBase: {
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 1,
  },
  label: {
    fontFamily: fontFamily.bold,
    letterSpacing: 0.2,
  },
});

TomoButton.displayName = 'TomoButton';

export default TomoButton;
