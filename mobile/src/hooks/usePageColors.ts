/**
 * usePageColors — Returns theme colors directly (no CMS overrides).
 * Tomo 友: local palette is the single source of truth.
 */

import { useTheme } from './useTheme';
import type { ThemeColors } from '../theme/colors';

export function usePageColors(_screenKey: string): { colors: ThemeColors } {
  const { colors } = useTheme();
  return { colors };
}
