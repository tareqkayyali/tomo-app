/**
 * Button Component
 * Tomo Design System — v0 glossy style for primary/gradient variants.
 *
 * Variants:
 *   primary  — Electric Green glossy gradient, dark text
 *   gradient — Same as primary (alias)
 *   secondary — transparent, green border, green text
 *   outline  — transparent, subtle border
 *   ghost    — no background, green text only
 *   icon     — 44px circle tap target, icon only
 */

import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  View,
  Platform,
} from 'react-native';
import { Loader } from './Loader';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { Ionicons } from '@expo/vector-icons';
import { spacing, borderRadius, shadows, layout, fontFamily } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { useComponentStyle } from '../hooks/useComponentStyle';
import type { ThemeColors } from '../theme/colors';
import { SmartIcon } from './SmartIcon';
import { SphereButton } from './tomo-ui/SphereButton';

import { colors } from '../theme/colors';

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
    scale.value = withTiming(0.98, { duration: 100 });
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
            <Loader size="sm" />
          ) : icon ? (
            <SmartIcon name={icon} size={resolvedIconSize} color={colors.electricGreen} />
          ) : null}
        </Pressable>
      </Animated.View>
    );
  }

  // ── Sphere button for primary / gradient ────────────────────────
  if (variant === 'primary' || variant === 'gradient') {
    return (
      <SphereButton
        label={title ?? ''}
        onPress={onPress}
        loading={loading}
        disabled={isDisabled}
        style={style}
      />
    );
  }

  // ── Resolve text color per variant ──────────────────────────────
  const textColor = colors.electricGreen;
  const loaderColor = colors.electricGreen;
  const resolvedIcon = iconSize ?? (size === 'small' ? 16 : 18);

  const content = (
    <View style={styles.content}>
      {loading ? (
        <Loader size="sm" />
      ) : (
        <>
          {icon && (
            <SmartIcon
              name={icon}
              size={resolvedIcon}
              color={textColor}
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
    borderRadius: borderRadius.lg,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    zIndex: 1,
  },
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
  iconButton: {
    width: layout.tapTarget,
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
    fontFamily: fontFamily.bold,
    letterSpacing: 0.2,
  },
});

function createVariantStyles(colors: ThemeColors) {
  return StyleSheet.create({
    secondary: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.electricGreen,
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
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
    minHeight: 44,
  },
  large: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 52,
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
