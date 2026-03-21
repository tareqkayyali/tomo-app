/**
 * usePageColors — Returns theme colors with per-page overrides applied.
 *
 * Usage:
 *   const { colors } = usePageColors('timeline_screen');
 *
 * If the page has color_overrides in its published config, those are
 * merged on top of the global theme colors. Otherwise returns the
 * global theme colors unchanged.
 */

import { useMemo } from 'react';
import { useTheme } from './useTheme';
import { useConfig } from './useConfigProvider';
import type { ThemeColors } from '../theme/colors';

export function usePageColors(screenKey: string): { colors: ThemeColors } {
  const { colors, isDark } = useTheme();
  const { config } = useConfig();

  const merged = useMemo(() => {
    if (!config?.pages) return colors;

    const page = config.pages.find((p) => p.screen_key === screenKey);
    if (!page?.is_published) return colors;

    const overrides = isDark ? page.color_overrides?.dark : page.color_overrides?.light;
    if (!overrides || Object.keys(overrides).length === 0) return colors;

    // Merge page-level color overrides on top of global theme colors
    const merged = { ...colors } as Record<string, unknown>;
    for (const [key, value] of Object.entries(overrides)) {
      if (value != null && key in colors) {
        merged[key] = value;
      }
    }
    return merged as ThemeColors;
  }, [colors, isDark, config, screenKey]);

  return { colors: merged };
}
