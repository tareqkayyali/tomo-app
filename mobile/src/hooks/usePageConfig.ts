/**
 * usePageConfig — Returns the CMS page configuration for a specific screen.
 * Falls back to null if no config exists (screen uses hardcoded values).
 */

import { useMemo } from 'react';
import { useConfig } from './useConfigProvider';
import type { SectionConfig, PageMetadata, PageColorOverrides } from '../services/configService';

export interface PageConfig {
  sections: SectionConfig[];
  metadata: PageMetadata;
  colorOverrides: PageColorOverrides;
  isPublished: boolean;
}

export function usePageConfig(screenKey: string): PageConfig | null {
  const { config } = useConfig();

  return useMemo(() => {
    if (!config?.pages) return null;

    const page = config.pages.find((p) => p.screen_key === screenKey);
    if (!page || !page.is_published) return null;

    return {
      sections: [...page.sections].sort((a, b) => a.sortOrder - b.sortOrder),
      metadata: page.metadata,
      colorOverrides: page.color_overrides || {},
      isPublished: page.is_published,
    };
  }, [config, screenKey]);
}

/**
 * Get a section's config by ID, with fallback defaults.
 */
export function useSectionConfig(
  screenKey: string,
  sectionId: string,
  defaults?: Partial<SectionConfig>
): SectionConfig {
  const pageConfig = usePageConfig(screenKey);

  return useMemo(() => {
    const section = pageConfig?.sections.find((s) => s.sectionId === sectionId);
    return {
      sectionId,
      title: section?.title ?? defaults?.title ?? '',
      subtitle: section?.subtitle ?? defaults?.subtitle,
      visible: section?.visible ?? defaults?.visible ?? true,
      sortOrder: section?.sortOrder ?? defaults?.sortOrder ?? 0,
      cardVariant: section?.cardVariant ?? defaults?.cardVariant,
      spacing: section?.spacing ?? defaults?.spacing,
      style: section?.style ?? defaults?.style,
    };
  }, [pageConfig, sectionId, defaults]);
}
