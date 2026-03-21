/**
 * useUIConfig — Fetches UI config (e.g. DNA Card tier config) from the
 * public content API. Uses AsyncStorage cache for instant load, then
 * syncs fresh data in the background.
 *
 * Falls back to hardcoded defaults if fetch fails or hasn't loaded yet.
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../services/apiConfig';
import { colors } from '../theme/colors';

// ── Default DNA card tier config (matches original hardcoded values) ──

export interface TierVisual {
  gradient: [string, string];
  text: string;
  icon: string;
  label: string;
  minRating: number;
}

export interface DNATierConfig {
  tiers: Record<string, TierVisual>;
}

export const DEFAULT_DNA_TIER_CONFIG: DNATierConfig = {
  tiers: {
    bronze: {
      gradient: [colors.tierBronze, colors.tierBronzeDark],
      text: colors.textPrimary,
      icon: 'shield',
      label: 'Bronze',
      minRating: 0,
    },
    silver: {
      gradient: [colors.tierSilver, colors.tierSilverDark],
      text: colors.textPrimary,
      icon: 'shield',
      label: 'Silver',
      minRating: 30,
    },
    gold: {
      gradient: [colors.accent, colors.info],
      text: colors.textPrimary,
      icon: 'star',
      label: 'Gold',
      minRating: 60,
    },
    diamond: {
      gradient: [colors.warning, colors.warning],
      text: colors.textPrimary,
      icon: 'diamond',
      label: 'Diamond',
      minRating: 85,
    },
  },
};

const CACHE_KEY = 'ui_config_dna_card_tiers';

/**
 * Hook to load DNA Card tier config from CMS.
 * Returns the tier config and a loading flag.
 */
export function useDNATierConfig(): {
  tierConfig: DNATierConfig;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const [tierConfig, setTierConfig] = useState<DNATierConfig>(DEFAULT_DNA_TIER_CONFIG);
  const [isLoading, setIsLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/content/ui-config?key=dna_card_tiers`,
        { method: 'GET' }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.tiers) {
          setTierConfig(data);
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
        }
      }
    } catch {
      // Network error — keep existing config (cache or defaults)
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // 1. Load from cache instantly
    AsyncStorage.getItem(CACHE_KEY)
      .then((cached) => {
        if (mounted && cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed?.tiers) {
              setTierConfig(parsed);
            }
          } catch {
            // Invalid cache — ignore
          }
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    // 2. Fetch fresh in background
    fetchConfig();

    return () => {
      mounted = false;
    };
  }, [fetchConfig]);

  return { tierConfig, isLoading, refresh: fetchConfig };
}
