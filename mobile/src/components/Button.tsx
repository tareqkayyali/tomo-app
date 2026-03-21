/**
 * Button Component
 * Tomo Design System — matches UI Aesthetic Features doc
 *
 * Variants:
 *   primary  — orange→teal gradient fill, white text, shadow, 12px radius
 *   secondary — transparent, #2ECC71 border, orange text
 *   outline  — transparent, subtle white border (dark-bg friendly)
 *   ghost    — no background, orange text only
 *   gradient — orange→teal gradient (same as primary)
 *   icon     — 44px circle tap target, icon only
 */

import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { spacing, borderRadius, shadows, layout, fontFamily } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { useComponentStyle } from '../hooks/useComponentStyle';
import type { ThemeColors } from '../theme/colors';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'gradient' | 'icon';
type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  title?: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconSize?: number;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  icon,
  iconSize,
  style,
  textStyle,
}: ButtonProps) {
  const { colors, typography } = useTheme();
  const { getComponentStyle } = useComponentStyle();
  const themedVariants = React.useMemo(() => createVariantStyles(colors), [colors]);
  const sizeText = React.useMemo(() => createSizeTextStyles(typography), [typography]);
  const isDisabled = !!(disabled || loading);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = () => {
    scale.value = withTiming(0.96, { duration: 100 });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };
  const onPressOut = () => {
    scale.value = withTiming(1, { duration: 100 });
  };

  // ── Icon-only button ────────────────────────────────────────────
  if (variant === 'icon') {
    const resolvedIconSize = iconSize ?? (size === 'small' ? 20 : 24);
    return (
      <Animated.View style={[animatedStyle, style]}>
        <Pressable
          style={[styles.iconButton, isDisabled && styles.disabled]}
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={isDisabled}
          hitSlop={8}
        >
          {loading ? (
            <ActivityIndicator color={colors.accent1} size="small" />
          ) : icon ? (
            <Ionicons name={icon} size={resolvedIconSize} color={colors.accent1} />
          ) : null}
        </Pressable>
      </Animated.View>
    );
  }

  // ── Resolve text color per variant ──────────────────────────────
  // Gradient/primary always use white text (on colored background)
  const textColor =
    variant === 'outline' || variant === 'ghost' || variant === 'secondary'
      ? colors.accent1
      : colors.textOnAccent;

  const loaderColor =
    variant === 'primary' || variant === 'gradient'
      ? colors.textOnAccent
      : colors.accent1;

  const resolvedIcon = iconSize ?? (size === 'small' ? 16 : 18);

  const content = (
    <View style={styles.content}>
      {loading ? (
        <ActivityIndicator color={loaderColor} size="small" />
      ) : (
        <>
          {icon && (
            <Ionicons
              name={icon}
              size={resolvedIcon}
              color={textColor}
              style={title ? styles.iconGap : undefined}
            />
          )}
          {title ? (
            <Text
              style={[
                styles.text,
                sizeText[size],
                { color: textColor },
                getComponentStyle('button_label'),
                textStyle,
              ]}
            >
              {title}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );

  // ── Gradient / Primary variant ──────────────────────────────────
  if ((variant === 'gradient' || variant === 'primary') && !isDisabled) {
    return (
      <Animated.View style={[animatedStyle, style]}>
        <Pressable
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={isDisabled}
        >
          <LinearGradient
            colors={colors.gradientOrangeCyan}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.base, sizeStyles[size], styles.primaryShadow]}
          >
            {content}
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  }

  // ── Disabled gradient/primary fallback ─────────────────────────
  if ((variant === 'gradient' || variant === 'primary') && isDisabled) {
    return (
      <Animated.View style={[animatedStyle, styles.disabled, style]}>
        <Pressable disabled>
          <LinearGradient
            colors={colors.gradientOrangeCyan}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.base, sizeStyles[size], styles.primaryShadow]}
          >
            {content}
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  }

  // ── Standard variants (secondary, outline, ghost) ─────────────
  const vKey = variant as keyof ReturnType<typeof createVariantStyles>;
  return (
    <Animated.View style={[animatedStyle, isDisabled && styles.disabled, style]}>
      <Pressable
        style={[
          styles.base,
          themedVariants[vKey],
          sizeStyles[size],
        ]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={isDisabled}
      >
        {content}
      </Pressable>
    </Animated.View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md, // 12px
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGap: {
    marginRight: spacing.sm,
  },
  primaryShadow: {
    ...shadows.md,
  },
  iconButton: {
    width: layout.tapTarget,  // 44px
    height: layout.tapTarget,
    borderRadius: layout.tapTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    fontFamily: fontFamily.semiBold,
    letterSpacing: 0.2,
  },
});

function createVariantStyles(colors: ThemeColors) {
  return StyleSheet.create({
    secondary: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.accent1,
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
  });
}

const sizeStyles = StyleSheet.create({
  small: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 36,
  },
  medium: {
    paddingVertical: spacing.compact,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  large: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 56,
  },
});

function createSizeTextStyles(typography: Record<string, any>) {
  return StyleSheet.create({
    small: {
      ...typography.buttonSmall,
    },
    medium: {
      ...typography.button,
    },
    large: {
      ...typography.button,
      fontSize: 18,
    },
  });
}
