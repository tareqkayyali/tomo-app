/**
 * ConfiguredSection — Wrapper that applies CMS visibility, spacing, and card variant
 * from page_configs. Falls back to hardcoded defaults when no config exists.
 */

import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useSectionConfig } from '../hooks/usePageConfig';
import type { SectionConfig } from '../services/configService';

interface ConfiguredSectionProps {
  screenKey: string;
  sectionId: string;
  defaults?: Partial<SectionConfig>;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function ConfiguredSection({
  screenKey,
  sectionId,
  defaults,
  children,
  style,
}: ConfiguredSectionProps) {
  const section = useSectionConfig(screenKey, sectionId, defaults);

  // Hidden by CMS config
  if (!section.visible) return null;

  const spacingStyle: ViewStyle = {};
  if (section.spacing?.marginTop) spacingStyle.marginTop = section.spacing.marginTop;
  if (section.spacing?.marginBottom) spacingStyle.marginBottom = section.spacing.marginBottom;
  if (section.spacing?.paddingHorizontal) spacingStyle.paddingHorizontal = section.spacing.paddingHorizontal;

  return (
    <View style={[spacingStyle, style]}>
      {children}
    </View>
  );
}
