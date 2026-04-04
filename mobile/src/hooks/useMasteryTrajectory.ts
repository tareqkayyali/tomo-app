/**
 * useMasteryTrajectory — Fetches test score trajectories for the Progress section.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getMasteryTrajectory, type TrajectoryResponse } from '../services/api';

export function useMasteryTrajectory(months = 6, targetPlayerId?: string) {
  const [data, setData] = useState<TrajectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getMasteryTrajectory(months, targetPlayerId);
      if (isMounted.current) {
        setData(result);
      }
    } catch (err: any) {
      if (isMounted.current) {
        setError(err?.message || 'Failed to load trajectory data');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [months, targetPlayerId]);

  useEffect(() => {
    isMounted.current = true;
    fetch();
    return () => {
      isMounted.current = false;
    };
  }, [fetch]);

  return { data, loading, error, refresh: fetch };
}
