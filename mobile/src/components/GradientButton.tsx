/**
 * GradientButton — Now delegates to TomoButton glossy style.
 * Prop interface preserved for all 13+ consumers.
 */

import React from 'react';
import { View, ViewStyle } from 'react-native';
import type { Ionicons } from '@expo/vector-icons';
import TomoButton from './tomo-ui/TomoButton';
import { IONICONS_TO_TOMO } from './Icon';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  /** Ionicons-style name (retained for API back-compat). Routed through the
   *  Bond hybrid resolver via TomoButton. */
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  small?: boolean;
}

export function GradientButton({
  title,
  onPress,
  icon,
  disabled,
  loading,
  style,
  small,
}: GradientButtonProps) {
  // Translate Ionicons name → Bond semantic name for TomoButton's TomoIcon.
  const bondIcon = icon ? (IONICONS_TO_TOMO[icon] ?? icon) : undefined;

  return (
    <View style={style}>
      <TomoButton
        label={title}
        onPress={onPress}
        icon={bondIcon}
        disabled={disabled}
        loading={loading}
        size={small ? 'sm' : 'md'}
        variant="primary"
      />
    </View>
  );
}
