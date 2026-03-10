/**
 * Tomo Theme Context
 * Provides dark/light mode toggle with persisted preference.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY_THEME_MODE } from '../constants/storageKeys';
import { darkColors, lightColors, type ThemeColors } from '../theme/colors';
import { createTypography } from '../theme/typography';
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

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');

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
    const c = mode === 'dark' ? darkColors : lightColors;
    return {
      mode,
      colors: c,
      typography: createTypography(c),
      isDark: mode === 'dark',
      toggle,
    };
  }, [mode]);

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
