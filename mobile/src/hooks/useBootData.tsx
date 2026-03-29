/**
 * Boot Data Context — Pre-fetches athlete state during app loading screen.
 *
 * Fires GET /api/v1/boot as soon as auth completes (during AnimatedSplashScreen).
 * Caches in AsyncStorage for instant hydration on next launch.
 * Consumed by: ProactiveDashboard (Chat), useOwnItData, useOutputData.
 *
 * Listens to refreshBus('*') to auto-refresh when data changes (checkin, test, event).
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './useAuth';
import { getBootData, type BootData } from '../services/api';
import { onRefresh } from '../utils/refreshBus';

const CACHE_KEY_PREFIX = '@tomo_boot_v1_';

interface BootContextValue {
  bootData: BootData | null;
  isBootLoading: boolean;
  refreshBoot: () => Promise<void>;
}

const BootContext = createContext<BootContextValue>({
  bootData: null,
  isBootLoading: true,
  refreshBoot: async () => {},
});

export function useBootData(): BootContextValue {
  return useContext(BootContext);
}

export function BootProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [bootData, setBootData] = useState<BootData | null>(null);
  const [isBootLoading, setIsBootLoading] = useState(true);
  const fetchingRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

  const cacheKey = user ? `${CACHE_KEY_PREFIX}${user.uid}` : null;

  // Load from cache immediately
  useEffect(() => {
    if (!cacheKey) return;
    AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        if (raw) {
          try {
            const cached = JSON.parse(raw) as BootData;
            // Only use cache if less than 1 hour old
            const age = Date.now() - new Date(cached.fetchedAt).getTime();
            if (age < 60 * 60 * 1000) {
              setBootData(cached);
            }
          } catch {}
        }
      })
      .catch(() => {});
  }, [cacheKey]);

  // Fetch fresh data
  const fetchBoot = useCallback(async () => {
    if (fetchingRef.current || !user) return;
    fetchingRef.current = true;

    try {
      const data = await getBootData();
      setBootData(data);
      setIsBootLoading(false);

      // Cache for next launch
      if (cacheKey) {
        AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
      }
    } catch (err) {
      console.warn('[boot] fetch failed:', err);
      setIsBootLoading(false);
      // On failure, keep any cached data — graceful degradation
    } finally {
      fetchingRef.current = false;
    }
  }, [user, cacheKey]);

  // Trigger boot fetch when user becomes available
  useEffect(() => {
    if (!user) {
      setBootData(null);
      setIsBootLoading(true);
      userIdRef.current = null;
      return;
    }

    // Only fetch once per user session (unless refreshed)
    if (userIdRef.current !== user.uid) {
      userIdRef.current = user.uid;
      fetchBoot();
    }
  }, [user, fetchBoot]);

  // Listen to refreshBus — re-fetch when data changes
  useEffect(() => {
    if (!user) return;
    return onRefresh('*', () => {
      fetchBoot();
    });
  }, [user, fetchBoot]);

  const refreshBoot = useCallback(async () => {
    await fetchBoot();
  }, [fetchBoot]);

  const value = React.useMemo(
    () => ({ bootData, isBootLoading, refreshBoot }),
    [bootData, isBootLoading, refreshBoot]
  );

  return (
    <BootContext.Provider value={value}>
      {children}
    </BootContext.Provider>
  );
}
