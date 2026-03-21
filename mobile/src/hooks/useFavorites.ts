/**
 * useFavorites — Persisted user-selected quick access favorites.
 *
 * Stores up to 2 favorite screen shortcuts in AsyncStorage.
 * Re-reads on screen focus so all tabs stay in sync after changes.
 */

import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Ionicons } from '@expo/vector-icons';
import { STORAGE_KEY_FAVORITES } from '../constants/storageKeys';

// ── Favorite option shape ────────────────────────────────────────────
export interface FavoriteOption {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Stack screen route name */
  route?: string;
  /** Tab route (for navigating to a specific tab + sub-tab) */
  tabRoute?: { tab: string; params?: Record<string, unknown> };
}

// ── Available favorites the user can pick from ───────────────────────
export const FAVORITE_OPTIONS: FavoriteOption[] = [
  { key: 'AddEvent',       label: 'Add Event',     icon: 'add-circle-outline',    route: 'AddEvent' },
  { key: 'MyRules',        label: 'My Rules',       icon: 'options-outline',       route: 'MyRules' },
  { key: 'MyMetricsNav',   label: 'Tests',          icon: 'fitness-outline',       tabRoute: { tab: 'Test', params: { initialTab: 'metrics' } } },
  { key: 'Settings',       label: 'Settings',       icon: 'settings-outline',      route: 'Settings' },
  { key: 'Checkin',        label: 'Check-in',       icon: 'heart-outline',         route: 'Checkin' },
  { key: 'Notifications',  label: 'Notifications',  icon: 'notifications-outline', route: 'Notifications' },
  { key: 'StudyPlanPreview', label: 'Study Plan',   icon: 'school-outline',        route: 'StudyPlanPreview' },
  { key: 'MyVitals',       label: 'My Vitals',      icon: 'pulse-outline',         tabRoute: { tab: 'Test', params: { initialTab: 'vitals' } } },
  { key: 'MyMetrics',      label: 'My Metrics',     icon: 'stats-chart-outline',   tabRoute: { tab: 'Test', params: { initialTab: 'metrics' } } },
];

const MAX_FAVORITES = 2;

export function useFavorites() {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Re-read from storage every time the screen gains focus
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(STORAGE_KEY_FAVORITES);
          if (raw) {
            const parsed = JSON.parse(raw) as string[];
            setSelectedKeys(parsed.slice(0, MAX_FAVORITES));
          }
        } catch {
          // Corrupted — ignore
        } finally {
          setIsLoaded(true);
        }
      })();
    }, []),
  );

  const setFavorites = useCallback(async (keys: string[]) => {
    const trimmed = keys.slice(0, MAX_FAVORITES);
    setSelectedKeys(trimmed);
    await AsyncStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(trimmed));
  }, []);

  // Resolve keys → full FavoriteOption objects (preserving selection order)
  const selectedOptions = selectedKeys
    .map((k) => FAVORITE_OPTIONS.find((o) => o.key === k))
    .filter(Boolean) as FavoriteOption[];

  return { selectedKeys, selectedOptions, setFavorites, isLoaded };
}
