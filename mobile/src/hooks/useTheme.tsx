/**
 * Tomo 友 Theme — Dark only, local palette, no CMS overrides.
 */

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { darkColors, type ThemeColors } from '../theme/colors';
import { createTypography } from '../theme/typography';
import type { TextStyle } from 'react-native';

interface ThemeContextType {
  mode: 'dark';
  colors: ThemeColors;
  typography: Record<string, TextStyle>;
  isDark: true;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useMemo<ThemeContextType>(() => ({
    mode: 'dark',
    colors: darkColors,
    typography: createTypography(darkColors),
    isDark: true,
    toggle: () => {},
  }), []);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
