/**
 * SmartIcon — Drop-in replacement for <Ionicons>.
 *
 * Same prop API as Ionicons (`name`, `size`, `color`). Routes every name
 * through the TomoIcon hybrid resolver: Bond sprite (108 icons) → Arc
 * custom set → Phosphor fallback. Unmapped names fall through to
 * TomoIcon's own escape hatch; Ionicons is never rendered at runtime.
 */

import React from 'react';
import type { Ionicons } from '@expo/vector-icons';
import TomoIcon from './tomo-ui/TomoIcon';
import { IONICONS_TO_TOMO } from './Icon';

interface SmartIconProps {
  name: keyof typeof Ionicons.glyphMap | string;
  size?: number;
  color?: string;
  /** Accepted for drop-in compatibility with legacy <Ionicons> sites.
   *  SmartIcon wraps TomoIcon (SvgXml) which styles the svg directly,
   *  so this prop is currently a no-op. */
  style?: unknown;
}

/** `-outline` suffix → outline variant, everything else → filled. */
function bondWeight(ioniconsName: string): 'regular' | 'fill' {
  return ioniconsName.endsWith('-outline') ? 'regular' : 'fill';
}

export function SmartIcon({ name, size = 24, color }: SmartIconProps) {
  const key = name as string;
  const tomoName = IONICONS_TO_TOMO[key] ?? key;
  return (
    <TomoIcon
      name={tomoName}
      size={size}
      color={color}
      weight={bondWeight(key)}
    />
  );
}

export default SmartIcon;
