/**
 * Boot Data Context — Pre-fetches athlete state during app loading screen.
 *
 * SECURITY: Boot data is strictly tied to the authenticated user.
 * - When user changes, ALL boot data is wiped IMMEDIATELY before any fetch
 * - Cache is NEVER loaded without verifying it belongs to the current user
 * - No stale data from a previous user can ever be displayed
 *
 * Fires GET /api/v1/boot as soon as auth completes (during AnimatedSplashScreen).
 * Consumed by: ProactiveDashboard (Chat), useOwnItData, useOutputData.
 * Listens to refreshBus('*') to auto-refresh when data changes.
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
  const currentUserIdRef = useRef<string | null>(null);

  // ── Core: wipe + re-fetch whenever user identity changes ────────────
  useEffect(() => {
    const newUid = user?.uid ?? null;
    const prevUid = currentUserIdRef.current;

    // User signed out or changed — IMMEDIATELY wipe all data
    if (prevUid !== newUid) {
      setBootData(null);
      setIsBootLoading(true);
      fetchingRef.current = false; // cancel any in-flight fetch for old user
      currentUserIdRef.current = newUid;
    }

    if (!user || !newUid) return;

    // Load from cache ONLY for the current user, and ONLY as a brief placeholder
    const cacheKey = `${CACHE_KEY_PREFIX}${newUid}`;
    AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        // Guard: if user changed while we were reading cache, discard
        if (currentUserIdRef.current !== newUid) return;
        if (raw) {
          try {
            const cached = JSON.parse(raw) as BootData;
            const age = Date.now() - new Date(cached.fetchedAt).getTime();
            if (age < 60 * 60 * 1000) {
              setBootData(cached);
            }
          } catch {}
        }
      })
      .catch(() => {});

    // Always fetch fresh data for the new user
    const fetchForUser = async () => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      try {
        const data = await getBootData();
        // Guard: if user changed while we were fetching, discard the result
        if (currentUserIdRef.current !== newUid) return;
        setBootData(data);
        setIsBootLoading(false);
        // Cache for next launch
        AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
      } catch (err) {
        if (currentUserIdRef.current !== newUid) return;
        console.warn('[boot] fetch failed:', err);
        setIsBootLoading(false);
      } finally {
        fetchingRef.current = false;
      }
    };

    fetchForUser();
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refresh on data changes (checkin, test logged, event created) ───
  const refreshBoot = useCallback(async () => {
    const uid = currentUserIdRef.current;
    if (!uid || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const data = await getBootData();
      if (currentUserIdRef.current !== uid) return; // user changed mid-fetch
      setBootData(data);
      const cacheKey = `${CACHE_KEY_PREFIX}${uid}`;
      AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
    } catch (err) {
      console.warn('[boot] refresh failed:', err);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // Listen to refreshBus
  useEffect(() => {
    if (!user) return;
    return onRefresh('*', () => {
      refreshBoot();
    });
  }, [user, refreshBoot]);

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
