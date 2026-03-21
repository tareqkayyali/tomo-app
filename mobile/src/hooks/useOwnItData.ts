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

const SNAPSHOT_CACHE_KEY = 'tomo_ownit_snapshot';
const RECS_CACHE_KEY = 'tomo_ownit_recs';

const SPORTS_TYPES = ['READINESS', 'LOAD_WARNING', 'RECOVERY', 'DEVELOPMENT', 'MOTIVATION'];
const STUDY_TYPES = ['ACADEMIC'];
const UPDATE_TYPES = ['CV_OPPORTUNITY', 'TRIANGLE_ALERT'];

function groupRecs(recs: RIERecommendation[]) {
  const sports: RIERecommendation[] = [];
  const study: RIERecommendation[] = [];
  const updates: RIERecommendation[] = [];

  for (const r of recs) {
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
  useEffect(() => {
    let isMounted = true;
    (async () => {
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
      // Then trigger deep refresh (Claude analysis) — force on initial mount
      triggerDeepRefresh(true);
    })();
    return () => { isMounted = false; };
  }, []);

  // Refresh on screen focus (after initial load) — with 5-minute cooldown on deep refresh
  useEffect(() => {
    if (isFocused && hasFetchedOnce) {
      fetchData();
      const now = Date.now();
      const DEEP_REFRESH_COOLDOWN = 300_000; // 5 minutes
      if (now - lastDeepRefreshRef.current >= DEEP_REFRESH_COOLDOWN) {
        lastDeepRefreshRef.current = now;
        triggerDeepRefresh(true);
      }
    }
  }, [isFocused, hasFetchedOnce, fetchData, triggerDeepRefresh]);

  const onRefresh = useCallback(async () => {
    await fetchData(true);
    // Force deep refresh on pull-to-refresh
    triggerDeepRefresh(true);
  }, [fetchData, triggerDeepRefresh]);

  const grouped = useMemo(() => groupRecs(recs), [recs]);

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
