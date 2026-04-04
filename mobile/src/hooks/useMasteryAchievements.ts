/**
 * useMasteryAchievements — Fetches milestones, personal bests, and next milestone.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getMasteryAchievements, type AchievementsResponse } from '../services/api';

export function useMasteryAchievements(limit = 20, targetPlayerId?: string) {
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getMasteryAchievements(limit, targetPlayerId);
      if (isMounted.current) {
        setData(result);
      }
    } catch (err: any) {
      if (isMounted.current) {
        setError(err?.message || 'Failed to load achievements');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [limit, targetPlayerId]);

  useEffect(() => {
    isMounted.current = true;
    fetch();
    return () => {
      isMounted.current = false;
    };
  }, [fetch]);

  return { data, loading, error, refresh: fetch };
}
