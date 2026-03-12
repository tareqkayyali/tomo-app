/**
 * usePadelProgress — React hook that fetches padel shot history
 * from Supabase and computes shot mastery data client-side.
 */

import { useState, useEffect, useCallback } from 'react';
import { getPadelShotHistory } from '../services/api';
import { computePadelShotRatings } from '../services/padelProgressCalculator';
import type { ShotRatingsData } from '../types/padel';

export function usePadelProgress() {
  const [shotRatings, setShotRatings] = useState<ShotRatingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const { results } = await getPadelShotHistory(100);
      if (results.length === 0) {
        setShotRatings(null);
        return;
      }

      // Map snake_case DB rows to camelCase
      const mapped = results.map((r: any) => ({
        id: r.id,
        userId: r.user_id ?? r.userId ?? '',
        date: r.date,
        shotType: r.shot_type ?? r.shotType ?? '',
        subMetrics: r.sub_metrics ?? r.subMetrics ?? {},
        overall: r.overall,
        sessionType: r.session_type ?? r.sessionType ?? 'training',
        notes: r.notes ?? '',
        createdAt: r.created_at ?? r.createdAt ?? '',
      }));

      const computed = computePadelShotRatings(mapped);
      setShotRatings(computed);
    } catch (err) {
      console.warn('[usePadelProgress]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refetch = useCallback(() => {
    setIsLoading(true);
    loadData();
  }, [loadData]);

  return {
    shotRatings,
    isLoading,
    hasData: !!shotRatings,
    refetch,
  };
}
