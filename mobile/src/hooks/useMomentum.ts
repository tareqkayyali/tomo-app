/**
 * useMomentum — Fetches momentum/velocity indicators (consistency, streak, rating delta).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getMomentum, type MomentumResponse } from '../services/api';

export function useMomentum(days = 30, targetPlayerId?: string) {
  const [data, setData] = useState<MomentumResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getMomentum(days, targetPlayerId);
      if (isMounted.current) {
        setData(result);
      }
    } catch (err: any) {
      if (isMounted.current) {
        setError(err?.message || 'Failed to load momentum data');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [days, targetPlayerId]);

  useEffect(() => {
    isMounted.current = true;
    fetch();
    return () => {
      isMounted.current = false;
    };
  }, [fetch]);

  return { data, loading, error, refresh: fetch };
}
