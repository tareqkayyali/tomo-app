/**
 * useOutputData — fetches unified Output snapshot from backend.
 *
 * Enhanced with cache-then-fetch + deep AI program refresh pattern.
 * Supports targetPlayerId for coach/parent viewing a player's data.
 *
 * Flow:
 *   1. Load cached snapshot from AsyncStorage (instant render) — own data only
 *   2. Fetch fresh snapshot from API (vitals + metrics always fresh)
 *   3. If cached programs are AI-generated, preserve them over hardcoded API response
 *   4. Trigger background AI program refresh if needed (own data only)
 *   5. When refresh completes, merge AI programs directly into state
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getOutputSnapshot,
  refreshProgramRecommendations,
  type OutputSnapshot,
} from '../services/api';
import { useAuth } from './useAuth';
import { useRefreshListener } from './useRefreshListener';

const CACHE_KEY_PREFIX = '@tomo_output_snapshot_v3_'; // v3: per-user cache

export function useOutputData(targetPlayerId?: string) {
  const { user } = useAuth();
  const CACHE_KEY = `${CACHE_KEY_PREFIX}${user?.uid || 'anon'}`;
  const [data, setData] = useState<OutputSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeepRefreshing, setIsDeepRefreshing] = useState(false);
  const deepRefreshInFlight = useRef(false);
  // Track if we have AI programs cached so we don't overwrite them
  const cachedAiPrograms = useRef<OutputSnapshot['programs'] | null>(null);

  // When viewing another player's data, skip caching and AI refresh
  const isViewingOther = !!targetPlayerId;

  // ── Load from cache (own data only) ──────────────────────────────
  const loadCache = useCallback(async () => {
    if (isViewingOther) return; // Don't load own cache for other players
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as OutputSnapshot;
        setData(parsed);
        // Remember AI programs from cache
        if (parsed.programs?.isAiGenerated) {
          cachedAiPrograms.current = parsed.programs;
        }
      }
    } catch {
      // Cache miss is fine
    }
  }, [isViewingOther]);

  // ── Fetch fresh data from API ──────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const snapshot = await getOutputSnapshot(targetPlayerId);

      // Smart merge: if API returned non-AI programs (generating state)
      // but we have cached AI programs from a previous refresh, use the cached ones
      if (
        !isViewingOther &&
        !snapshot.programs?.isAiGenerated &&
        cachedAiPrograms.current
      ) {
        // Extract coach-assigned programs from the fresh API response
        const freshCoachPrograms = (snapshot.programs?.recommendations || [])
          .filter((p: any) => p.programId?.startsWith('coach_') || p.coachId);
        // Get AI programs from cache (non-coach ones)
        const cachedAiRecs = (cachedAiPrograms.current.recommendations || [])
          .filter((p: any) => !p.programId?.startsWith('coach_') && !p.coachId);
        // Merge: coach programs first, then AI programs
        snapshot.programs = {
          ...cachedAiPrograms.current,
          recommendations: [...freshCoachPrograms, ...cachedAiRecs],
        };
      }

      setData(snapshot);
      // Cache for next time (own data only)
      if (!isViewingOther) {
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)).catch(() => {});
      }
      return snapshot;
    } catch (err: any) {
      setError(err?.message || 'Failed to load data');
      return null;
    } finally {
      setLoading(false);
    }
  }, [targetPlayerId, isViewingOther]);

  // ── Deep program refresh (Claude AI) — own data only ────────────
  const triggerDeepRefresh = useCallback(async (force = false) => {
    if (isViewingOther) return; // Don't trigger AI refresh for other players
    if (deepRefreshInFlight.current) return;
    deepRefreshInFlight.current = true;
    setIsDeepRefreshing(true);

    try {
      const result = await refreshProgramRecommendations(force);

      // If we got programs back (either freshly generated or cached), merge them
      const aiData = result.programs as any;
      const aiRecs = aiData?.recommendations ?? aiData?.programs;
      if (aiData && aiRecs?.length > 0) {
        setData((prev) => {
          if (!prev) return prev;

          // Preserve coach-assigned programs from current state
          const existingCoachPrograms = (prev.programs?.recommendations || [])
            .filter((p: any) => p.programId?.startsWith('coach_') || p.coachId);

          // Filter AI recs to exclude any coach programs (avoid dupes)
          const pureAiRecs = aiRecs.filter((p: any) => !p.programId?.startsWith('coach_') && !p.coachId);

          const mergedPrograms = {
            recommendations: [...existingCoachPrograms, ...pureAiRecs],
            weeklyPlanSuggestion: aiData.weeklyPlanSuggestion,
            weeklyStructure: aiData.weeklyStructure,
            playerProfile: aiData.playerProfile,
            isAiGenerated: true as const,
            generatedAt: aiData.generatedAt ?? new Date().toISOString(),
          };

          // Store in ref so fetchData doesn't overwrite
          cachedAiPrograms.current = mergedPrograms as any;

          const updated = {
            ...prev,
            programs: {
              ...prev.programs,
              ...mergedPrograms,
            },
          };
          // Cache the merged version
          AsyncStorage.setItem(CACHE_KEY, JSON.stringify(updated)).catch(() => {});
          return updated;
        });
      }
    } catch {
      // Non-fatal — hardcoded programs still showing
    } finally {
      deepRefreshInFlight.current = false;
      setIsDeepRefreshing(false);
    }
  }, [isViewingOther]);

  // ── Initial mount: cache → fetch (no auto deep refresh) ───────────
  useEffect(() => {
    let isMounted = true;
    (async () => {
      await loadCache();
      if (!isMounted) return;
      await fetchData();
    })();
    return () => { isMounted = false; };
  }, [targetPlayerId]);

  // Auto-refresh removed — user uses manual refresh button in toolbar

  // ── Manual refresh (pull-to-refresh) ───────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchData();
    // Also trigger program re-generation on pull-to-refresh
    if (!isViewingOther) {
      triggerDeepRefresh(true);
    }
  }, [fetchData, isViewingOther, triggerDeepRefresh]);

  // ── Force refresh programs (manual button) ─────────────────────────
  const forceRefreshPrograms = useCallback(async () => {
    await triggerDeepRefresh(true);
  }, [triggerDeepRefresh]);

  // ── Listen for cross-screen refresh events (e.g. test logged in chat) ──
  useRefreshListener('metrics', fetchData);
  useRefreshListener('programs', fetchData);

  return {
    data,
    setData,
    loading,
    error,
    refresh,
    isDeepRefreshing,
    forceRefreshPrograms,
  };
}
