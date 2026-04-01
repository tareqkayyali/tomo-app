/**
 * SmartIcon — Drop-in replacement for <Ionicons>.
 * Same prop API: name, size, color.
 * Renders Phosphor via TomoIcon when a mapping exists, falls back to Ionicons.
 */

import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import TomoIcon from './tomo-ui/TomoIcon';
import { IONICONS_TO_PHOSPHOR } from './Icon';

interface SmartIconProps {
  name: keyof typeof Ionicons.glyphMap | string;
  size?: number;
  color?: string;
  style?: any;
}

function phosphorWeight(ioniconsName: string): 'regular' | 'fill' {
  return ioniconsName.endsWith('-outline') ? 'regular' : 'fill';
}

export function SmartIcon({ name, size = 24, color, style }: SmartIconProps) {
  const phosphorName = IONICONS_TO_PHOSPHOR[name as string];

  if (phosphorName) {
    return (
      <TomoIcon
        name={phosphorName}
        size={size}
        color={color}
        weight={phosphorWeight(name as string)}
      />
    );
  }

  // Fallback to Ionicons (brand logos, unmapped icons)
  return (
    <Ionicons
      name={name as keyof typeof Ionicons.glyphMap}
      size={size}
      color={color}
      style={style}
    />
  );
}

export default SmartIcon;
