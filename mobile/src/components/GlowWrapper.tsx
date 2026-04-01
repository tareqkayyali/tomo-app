/**
 * GlowWrapper — Now a no-op pass-through wrapper.
 * v0 design removes neon glows in favor of clean surfaces.
 * All props/types/exports preserved so consumers don't break.
 */

import React, { ReactNode } from 'react';
import { View, ViewStyle } from 'react-native';

export type GlowPreset = 'orange' | 'cyan' | 'ring' | 'subtle' | 'none';

interface GlowWrapperProps {
  children: ReactNode;
  glow?: GlowPreset;
  customShadow?: ViewStyle;
  style?: ViewStyle;
  animated?: boolean;
  breathing?: boolean;
}

export function GlowWrapper({
  children,
  style,
}: GlowWrapperProps) {
  return <View style={style}>{children}</View>;
}
