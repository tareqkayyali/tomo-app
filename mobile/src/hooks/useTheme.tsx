/**
 * Tomo Theme Context
 * Provides dark/light mode toggle with persisted preference.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY_THEME_MODE } from '../constants/storageKeys';
import { darkColors, lightColors, type ThemeColors } from '../theme/colors';
import { createTypography } from '../theme/typography';
import { useConfig } from './useConfigProvider';
import type { TextStyle } from 'react-native';

type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
  mode: ThemeMode;
  colors: ThemeColors;
  typography: Record<string, TextStyle>;
  isDark: boolean;
  toggle: () => void;
}

const THEME_STORAGE_KEY = STORAGE_KEY_THEME_MODE;

/**
 * Deep-merge CMS color overrides onto hardcoded colors.
 * Only replaces keys that exist in the override — safe for partial themes.
 */
function mergeColors(base: ThemeColors, overrides: Record<string, unknown> | null | undefined): ThemeColors {
  if (!overrides || Object.keys(overrides).length === 0) return base;

  const merged = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    if (value != null && key in base) {
      merged[key] = value;
    }
  }
  return merged as ThemeColors;
}

/**
 * Merge CMS typography overrides onto generated typography.
 * Override shape: { styleName: { fontSize?, fontWeight?, letterSpacing? } }
 */
function mergeTypography(
  base: Record<string, TextStyle>,
  overrides: Record<string, unknown> | null | undefined
): Record<string, TextStyle> {
  if (!overrides || Object.keys(overrides).length === 0) return base;

  const merged = { ...base };
  for (const [styleName, styleOverride] of Object.entries(overrides)) {
    if (styleName in merged && styleOverride && typeof styleOverride === 'object') {
      merged[styleName] = { ...merged[styleName], ...(styleOverride as TextStyle) };
    }
  }
  return merged;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');
  const { config } = useConfig();

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') setMode(stored);
    });
  }, []);

  const toggle = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    AsyncStorage.setItem(THEME_STORAGE_KEY, next);
  };

  const value = useMemo<ThemeContextType>(() => {
    const baseColors = mode === 'dark' ? darkColors : lightColors;

    // Apply CMS theme overrides if an active theme exists
    const cmsTheme = config?.theme;
    const colorOverrides = mode === 'dark' ? cmsTheme?.colors_dark : cmsTheme?.colors_light;
    const colors = mergeColors(baseColors, colorOverrides as Record<string, unknown> | undefined);

    const baseTypography = createTypography(colors);
    const typography = mergeTypography(baseTypography, cmsTheme?.typography as Record<string, unknown> | undefined);

    return {
      mode,
      colors,
      typography,
      isDark: mode === 'dark',
      toggle,
    };
  }, [mode, config?.theme]);

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
