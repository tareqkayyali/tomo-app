/**
 * GradientButton — Now delegates to TomoButton glossy style.
 * Prop interface preserved for all 13+ consumers.
 */

import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TomoButton from './tomo-ui/TomoButton';
import { IONICONS_TO_PHOSPHOR } from './Icon';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
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
  // Map Ionicons name → Phosphor name for the icon
  const phosphorIcon = icon ? (IONICONS_TO_PHOSPHOR[icon] ?? icon) : undefined;

  return (
    <View style={style}>
      <TomoButton
        label={title}
        onPress={onPress}
        icon={phosphorIcon}
        disabled={disabled}
        loading={loading}
        size={small ? 'sm' : 'md'}
        variant="primary"
      />
    </View>
  );
}
