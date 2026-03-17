/**
 * useOwnItData — Fetches snapshot + RIE recommendations for the Own It screen.
 * Parallel fetch with cache-then-fetch (stale-while-revalidate).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAthleteSnapshot,
  getRecommendations,
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

  // Load cache on mount
  useEffect(() => {
    (async () => {
      try {
        const [cachedSnap, cachedRecs] = await Promise.all([
          AsyncStorage.getItem(SNAPSHOT_CACHE_KEY),
          AsyncStorage.getItem(RECS_CACHE_KEY),
        ]);
        if (cachedSnap) setSnapshot(JSON.parse(cachedSnap));
        if (cachedRecs) setRecs(JSON.parse(cachedRecs));
      } catch {}
      // Then fetch fresh
      fetchData();
    })();
  }, []);

  // Refresh on screen focus (after initial load)
  useEffect(() => {
    if (isFocused && hasFetchedOnce) {
      fetchData();
    }
  }, [isFocused]);

  const onRefresh = useCallback(() => fetchData(true), [fetchData]);

  const grouped = useMemo(() => groupRecs(recs), [recs]);

  return {
    snapshot,
    sportsRecs: grouped.sports,
    studyRecs: grouped.study,
    updateRecs: grouped.updates,
    isLoading,
    error,
    refreshing,
    onRefresh,
  };
}
