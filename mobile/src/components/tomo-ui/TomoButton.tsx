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
import { StyleSheet, Text, ActivityIndicator, View } from 'react-native';
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
  sm: { height: 36, paddingH: 16, fontSize: 12 },
  md: { height: 44, paddingH: 24, fontSize: 13 },
  lg: { height: 52, paddingH: 32, fontSize: 14 },
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
  const textColor = isGlossy ? colors.background : colors.electricGreen;
  const iconColor = isGlossy ? colors.background : colors.electricGreen;

  // Gradient colors per variant
  const gradientColors: [string, string] = variant === 'orange'
    ? [colors.tomoOrange, colors.accent]
    : [colors.electricGreen, colors.electricGreenMuted];

  const content = (
    <View style={styles.inner}>
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
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
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: borderRadius.lg }]}
          />
          {/* Glass shine overlay */}
          <LinearGradient
            colors={['rgba(245,243,237,0.35)', colors.creamSoft, 'transparent']}
            locations={[0, 0.3, 0.6]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: borderRadius.lg }]}
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
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderTopColor: colors.creamOverlay,
    borderLeftColor: colors.creamOverlay,
    borderRightColor: colors.creamOverlay,
    borderBottomColor: 'rgba(0,0,0,0.1)',
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
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});

TomoButton.displayName = 'TomoButton';

export default TomoButton;
