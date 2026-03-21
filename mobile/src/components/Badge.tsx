/**
 * Badge / Chip Component
 * Tomo Design System — rounded rectangle pill badges
 *
 * Variants:
 *   chip     — #ECECF1 bg, #2ECC71 text (suggestion chips)
 *   success  — green tint bg, green text
 *   warning  — yellow tint bg, yellow text
 *   error    — red tint bg, red text
 *   info     — cyan tint bg, cyan text
 *   outline  — transparent, white border, white text (on dark bg)
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../theme';
import { useComponentStyle } from '../hooks/useComponentStyle';

type BadgeVariant = 'chip' | 'success' | 'warning' | 'error' | 'info' | 'outline';
type BadgeSize = 'small' | 'medium';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const variantConfig: Record<BadgeVariant, { bg: string; text: string; border?: string }> = {
  chip: {
    bg: colors.chipBackground,    // #ECECF1
    text: colors.chipText,        // #2ECC71
  },
  success: {
    bg: colors.readinessGreenBg,
    text: colors.readinessGreen,
  },
  warning: {
    bg: colors.readinessYellowBg,
    text: colors.readinessYellow,
  },
  error: {
    bg: colors.readinessRedBg,
    text: colors.readinessRed,
  },
  info: {
    bg: colors.intensityLightBg,
    text: colors.accent2,
  },
  outline: {
    bg: 'transparent',
    text: colors.textOnDark,
    border: colors.borderLight,
  },
};

export function Badge({
  label,
  variant = 'chip',
  size = 'medium',
  icon,
  onPress,
  style,
  textStyle,
}: BadgeProps) {
  const config = variantConfig[variant];
  const { getComponentStyle } = useComponentStyle();
  const isSmall = size === 'small';

  const containerStyle: ViewStyle[] = [
    styles.base,
    {
      backgroundColor: config.bg,
      paddingVertical: isSmall ? spacing.xs : spacing.sm,
      paddingHorizontal: isSmall ? spacing.sm : spacing.compact,
    },
    config.border ? { borderWidth: 1, borderColor: config.border } : {},
    style as ViewStyle,
  ];

  const labelStyle: TextStyle[] = [
    isSmall ? styles.textSmall : styles.text,
    { color: config.text },
    getComponentStyle('badge_text') as TextStyle,
    textStyle as TextStyle,
  ];

  const iconSize = isSmall ? 12 : 14;

  const content = (
    <>
      {icon && (
        <Ionicons
          name={icon}
          size={iconSize}
          color={config.text}
          style={styles.icon}
        />
      )}
      <Text style={labelStyle}>{label}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          ...containerStyle,
          pressed && styles.pressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={containerStyle}>{content}</View>;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.full,  // pill shape
    alignSelf: 'flex-start',
  },
  text: {
    ...typography.label,
    fontFamily: typography.button.fontFamily,
  },
  textSmall: {
    ...typography.metadataSmall,
    fontFamily: typography.button.fontFamily,
  },
  icon: {
    marginRight: spacing.xs,
  },
  pressed: {
    opacity: 0.8,
  },
});
