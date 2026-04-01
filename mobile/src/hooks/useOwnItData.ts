/**
 * useOwnItData — Fetches snapshot + RIE recommendations for the Own It screen.
 * Parallel fetch with cache-then-fetch (stale-while-revalidate).
 *
 * Deep Rec Refresh flow:
 *   1. Show cached recs immediately (instant load)
 *   2. Fetch current recs from DB (fast ~100ms)
 *   3. Call POST /recommendations/refresh (Claude analysis, 10-30s)
 *   4. If new recs generated, re-fetch and update UI
 *
 * forceRefresh() — manual trigger for the refresh button (bypasses staleness check)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAthleteSnapshot,
  getRecommendations,
  refreshRecommendations,
  type AthleteSnapshot,
  type RIERecommendation,
} from '../services/api';
import { useRefreshListener } from './useRefreshListener';
import { useBootData } from './useBootData';

const SNAPSHOT_CACHE_KEY = 'tomo_ownit_snapshot';
const RECS_CACHE_KEY = 'tomo_ownit_recs';

const SPORTS_TYPES = ['READINESS', 'LOAD_WARNING', 'RECOVERY', 'DEVELOPMENT', 'MOTIVATION', 'JOURNAL_NUDGE'];
const STUDY_TYPES = ['ACADEMIC'];
const UPDATE_TYPES = ['CV_OPPORTUNITY', 'TRIANGLE_ALERT'];

function deduplicateRecs(recs: RIERecommendation[]): RIERecommendation[] {
  // Deduplicate by (recType + title) — keep the most recent one per key
  const seen = new Map<string, RIERecommendation>();
  for (const r of recs) {
    const key = `${r.recType}::${r.title}`;
    const existing = seen.get(key);
    if (!existing || (r.createdAt && existing.createdAt && r.createdAt > existing.createdAt)) {
      seen.set(key, r);
    }
  }
  return Array.from(seen.values());
}

function groupRecs(recs: RIERecommendation[]) {
  // Deduplicate before grouping — prevents duplicate cards
  const unique = deduplicateRecs(recs);

  const sports: RIERecommendation[] = [];
  const study: RIERecommendation[] = [];
  const updates: RIERecommendation[] = [];

  for (const r of unique) {
    if (SPORTS_TYPES.includes(r.recType)) sports.push(r);
    else if (STUDY_TYPES.includes(r.recType)) study.push(r);
    else if (UPDATE_TYPES.includes(r.recType)) updates.push(r);
  }

  // Sort each group by priority (P1 first)
  const byPriority = (a: RIERecommendation, b: RIERecommendation) => a.priority - b.priority;
  sports.sort(byPriority);
  study.sort(byPriority);
  updates.sort(byPriority);

  return { sports, study, updates };
}

export function useOwnItData() {
  const isFocused = useIsFocused();
  const { bootData } = useBootData();
  const [snapshot, setSnapshot] = useState<AthleteSnapshot | null>(null);
  const [recs, setRecs] = useState<RIERecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [isDeepRefreshing, setIsDeepRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const deepRefreshInFlight = useRef(false);
  const lastDeepRefreshRef = useRef(0);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (!hasFetchedOnce) setIsLoading(true);

    try {
      const [snap, recommendations] = await Promise.all([
        getAthleteSnapshot(),
        getRecommendations(15),
      ]);

      setSnapshot(snap);
      setRecs(recommendations);
      setError(null);
      setHasFetchedOnce(true);

      // Cache both
      if (snap) AsyncStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snap)).catch(() => {});
      AsyncStorage.setItem(RECS_CACHE_KEY, JSON.stringify(recommendations)).catch(() => {});
    } catch (err: any) {
      setError(err?.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [hasFetchedOnce]);

  /**
   * Trigger deep refresh: calls Claude to generate fresh recs,
   * then re-fetches if new recs were created.
   * Deduped via ref to prevent concurrent calls.
   */
  const triggerDeepRefresh = useCallback(async (force = false) => {
    if (deepRefreshInFlight.current) return;
    deepRefreshInFlight.current = true;
    setIsDeepRefreshing(true);
    setRefreshError(null);

    try {
      const result = await refreshRecommendations(force ? { force: true } : undefined);

      // Check for API-level errors
      if (!result.refreshed && result.reason === 'api_error') {
        console.warn('[useOwnItData] Deep refresh API error');
        setRefreshError('Unable to generate recommendations. Try again later.');
      } else if (!result.refreshed && result.reason === 'network_error') {
        console.warn('[useOwnItData] Deep refresh network error');
        setRefreshError('Network error. Check your connection and try again.');
      }

      if (result.refreshed && (result.count ?? 0) > 0) {
        // New recs were generated — re-fetch to show them
        const freshRecs = await getRecommendations(15);
        setRecs(freshRecs);
        AsyncStorage.setItem(RECS_CACHE_KEY, JSON.stringify(freshRecs)).catch(() => {});
      } else if (!result.refreshed && result.reason === 'not_stale' && recs.length === 0) {
        // Recs were generated recently but we have none locally — try re-fetch
        const freshRecs = await getRecommendations(15);
        if (freshRecs.length > 0) {
          setRecs(freshRecs);
          AsyncStorage.setItem(RECS_CACHE_KEY, JSON.stringify(freshRecs)).catch(() => {});
        } else {
          // Truly empty — force a new refresh
          const forced = await refreshRecommendations({ force: true });
          if (forced.refreshed && (forced.count ?? 0) > 0) {
            const newest = await getRecommendations(15);
            setRecs(newest);
            AsyncStorage.setItem(RECS_CACHE_KEY, JSON.stringify(newest)).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('[useOwnItData] Deep refresh failed:', (err as Error).message);
      setRefreshError('Failed to refresh recommendations');
    } finally {
      setIsDeepRefreshing(false);
      deepRefreshInFlight.current = false;
    }
  }, [recs.length]);

  /**
   * Force refresh — triggered by the manual refresh button.
   * Bypasses staleness check and always calls Claude.
   */
  const forceRefresh = useCallback(async () => {
    await triggerDeepRefresh(true);
  }, [triggerDeepRefresh]);

  // Load cache on mount, then fetch, then deep refresh
  // Seed from boot data if available and fresh (< 60s old) to eliminate loading flash
  useEffect(() => {
    let isMounted = true;
    (async () => {
      // Try boot data first (already fetched during splash screen)
      const bootFresh = bootData?.fetchedAt
        && (Date.now() - new Date(bootData.fetchedAt).getTime()) < 60_000;
      if (bootFresh && bootData?.snapshot && !snapshot) {
        setSnapshot(bootData.snapshot as any);
        setIsLoading(false);
      }

      try {
        const [cachedSnap, cachedRecs] = await Promise.all([
          AsyncStorage.getItem(SNAPSHOT_CACHE_KEY),
          AsyncStorage.getItem(RECS_CACHE_KEY),
        ]);
        if (!isMounted) return;
        if (cachedSnap) setSnapshot(JSON.parse(cachedSnap));
        if (cachedRecs) setRecs(JSON.parse(cachedRecs));
      } catch (e) {
        console.warn('[useOwnItData] cache load error:', e);
      }
      if (!isMounted) return;
      // Fetch current data from DB
      await fetchData();
      if (!isMounted) return;
      // Only trigger deep refresh if recs are empty or stale
      // Trust the event pipeline — it pre-computes recs on data changes
      // This saves ~50% in API costs vs force=true on every mount
      triggerDeepRefresh(false); // respects backend staleness check (24h)
    })();
    return () => { isMounted = false; };
  }, []);

  // Refresh on screen focus (after initial load) — always re-fetch from DB,
  // only deep refresh if cooldown expired (and backend will check staleness)
  useEffect(() => {
    if (isFocused && hasFetchedOnce) {
      fetchData();
      const now = Date.now();
      const DEEP_REFRESH_COOLDOWN = 300_000; // 5 minutes
      if (now - lastDeepRefreshRef.current >= DEEP_REFRESH_COOLDOWN) {
        lastDeepRefreshRef.current = now;
        triggerDeepRefresh(false); // respect backend staleness — don't force
      }
    }
  }, [isFocused, hasFetchedOnce, fetchData, triggerDeepRefresh]);

  const onRefresh = useCallback(async () => {
    await fetchData(true);
    // Force deep refresh on pull-to-refresh
    triggerDeepRefresh(true);
  }, [fetchData, triggerDeepRefresh]);

  const grouped = useMemo(() => groupRecs(recs), [recs]);

  // ── Listen for cross-screen refresh events (e.g. check-in from chat) ──
  // On readiness change: re-fetch recs AND force deep refresh (bypass cooldown)
  const handleReadinessRefresh = useCallback(() => {
    fetchData();
    // Bypass the 5-minute cooldown — checkin changed readiness, recs are now stale
    lastDeepRefreshRef.current = 0;
    triggerDeepRefresh(true);
  }, [fetchData, triggerDeepRefresh]);

  useRefreshListener('readiness', handleReadinessRefresh);
  useRefreshListener('recommendations', fetchData);

  return {
    snapshot,
    sportsRecs: grouped.sports,
    studyRecs: grouped.study,
    updateRecs: grouped.updates,
    isLoading,
    error,
    refreshing,
    isDeepRefreshing,
    refreshError,
    onRefresh,
    forceRefresh,
  };
}
