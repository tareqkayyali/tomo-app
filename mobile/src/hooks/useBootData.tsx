/**
 * Boot Data Context — Pre-fetches athlete state as soon as auth resolves.
 *
 * SECURITY: Boot data is strictly tied to the authenticated user.
 * - When user changes, ALL boot data is wiped IMMEDIATELY before any fetch
 * - Cache is NEVER loaded without verifying it belongs to the current user
 * - No stale data from a previous user can ever be displayed
 *
 * Loading phases:
 *   1. On user identity change: isBootLoading=true, bootData=null
 *   2. If a fresh-enough (<1h) AsyncStorage cache exists: bootData is set
 *      to the cached value while isBootLoading remains true (stale-while-
 *      revalidate). Consumers can render with cached data immediately.
 *   3. When the network fetch completes (success or failure): isBootLoading
 *      is set to false. On failure, bootData stays at its last value (cache
 *      or null if there was no cache).
 *
 * isBootLoading semantics: "network fetch not yet settled" — NOT "no data".
 * A consumer that needs to distinguish "loading with cached data" from "no
 * data at all" should check `isBootLoading && !bootData` (empty) vs
 * `isBootLoading && bootData` (showing cache while refreshing).
 *
 * Consumed by: SignalDashboardScreen, ProactiveDashboard (Chat).
 * Listens to refreshBus('*') to auto-refresh when any data changes.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './useAuth';
import { getBootData, type BootData } from '../services/api';
import { onRefresh } from '../utils/refreshBus';
import { Sentry } from '../services/sentry';

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
  const currentUserIdRef = useRef<string | null>(null);

  // Version counter — every fetch increments this. When a fetch completes,
  // it only applies its result if no newer fetch has started since.
  // This replaces the old fetchingRef mutex that silently dropped refreshes.
  const fetchVersionRef = useRef(0);

  // ── Core: wipe + re-fetch whenever user identity changes ────────────
  useEffect(() => {
    const newUid = user?.uid ?? null;
    const prevUid = currentUserIdRef.current;

    // User signed out or changed — IMMEDIATELY wipe all data
    if (prevUid !== newUid) {
      setBootData(null);
      setIsBootLoading(true);
      fetchVersionRef.current++; // invalidate any in-flight fetch for old user
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
              Sentry.addBreadcrumb({ category: 'boot', message: 'cache hit', level: 'info', data: { age_seconds: Math.floor(age / 1000) } });
            }
          } catch {}
        }
      })
      .catch(() => {});

    // Always fetch fresh data for the new user
    const version = ++fetchVersionRef.current;
    const fetchForUser = async () => {
      const fetchStart = Date.now();
      Sentry.addBreadcrumb({ category: 'boot', message: 'fetch start', level: 'info' });
      try {
        const data = await getBootData();
        // Guard: discard if user changed or a newer fetch superseded this one
        if (currentUserIdRef.current !== newUid) return;
        if (fetchVersionRef.current !== version) return;
        setBootData(data);
        setIsBootLoading(false);
        Sentry.addBreadcrumb({ category: 'boot', message: 'fetch complete', level: 'info', data: { duration_ms: Date.now() - fetchStart } });
        // Cache for next launch
        AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
      } catch (err) {
        if (currentUserIdRef.current !== newUid) return;
        if (fetchVersionRef.current !== version) return;
        console.warn('[boot] fetch failed:', err);
        Sentry.addBreadcrumb({ category: 'boot', message: 'fetch failed', level: 'warning', data: { duration_ms: Date.now() - fetchStart } });
        setIsBootLoading(false);
      }
    };

    fetchForUser();
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refresh on data changes (checkin, test logged, event created, mode change) ───
  // Never blocks — multiple concurrent calls are safe. Only the latest
  // fetch result is applied (stale responses from earlier calls are discarded).
  const refreshBoot = useCallback(async () => {
    const uid = currentUserIdRef.current;
    if (!uid) return;
    const version = ++fetchVersionRef.current;
    try {
      const data = await getBootData();
      // Only apply if user hasn't changed and no newer fetch has started
      if (currentUserIdRef.current !== uid) return;
      if (fetchVersionRef.current !== version) return;
      setBootData(data);
      const cacheKey = `${CACHE_KEY_PREFIX}${uid}`;
      AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
    } catch (err) {
      if (currentUserIdRef.current !== uid) return;
      if (fetchVersionRef.current !== version) return;
      console.warn('[boot] refresh failed:', err);
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
