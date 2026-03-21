/**
 * useComponentStyle — Per-component typography overrides from CMS.
 *
 * Components call getComponentStyle('dna_card_overall_number') to get
 * CMS-managed font overrides, then merge onto hardcoded styles.
 */

import { useCallback } from 'react';
import type { TextStyle } from 'react-native';
import { useConfig } from './useConfigProvider';
import { fontFamily } from '../theme/typography';

/** Maps CMS fontWeight strings to Poppins family names */
const WEIGHT_MAP: Record<string, string> = {
  '300': fontFamily.light,
  '400': fontFamily.regular,
  '500': fontFamily.medium,
  '600': fontFamily.semiBold,
  '700': fontFamily.bold,
};

/**
 * Convert a CMS component style entry into a React Native TextStyle.
 * Translates fontWeight strings (e.g. "700") to the correct Poppins family.
 */
function toTextStyle(raw: Record<string, unknown>): TextStyle {
  const style: TextStyle = {};

  if (typeof raw.fontSize === 'number') {
    style.fontSize = raw.fontSize;
  }
  if (typeof raw.letterSpacing === 'number') {
    style.letterSpacing = raw.letterSpacing;
  }
  if (typeof raw.fontWeight === 'string' && WEIGHT_MAP[raw.fontWeight]) {
    style.fontFamily = WEIGHT_MAP[raw.fontWeight];
  }

  return style;
}

export function useComponentStyle() {
  const { config } = useConfig();

  const getComponentStyle = useCallback(
    (key: string): TextStyle | undefined => {
      const raw = config?.component_styles?.[key];
      if (!raw || typeof raw !== 'object') return undefined;
      return toTextStyle(raw as Record<string, unknown>);
    },
    [config?.component_styles],
  );

  return { getComponentStyle };
}
