/**
 * useMasteryData — Fetches mastery snapshot for the Progress/Mastery screen.
 *
 * Returns { data, loading, error, refresh } for easy pull-to-refresh integration.
 * Supports optional targetPlayerId for coach/parent read-only views.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getMasterySnapshot, type MasterySnapshot } from '../services/api';

export function useMasteryData(targetPlayerId?: string) {
  const [data, setData] = useState<MasterySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const snapshot = await getMasterySnapshot(targetPlayerId);
      if (isMounted.current) {
        setData(snapshot);
      }
    } catch (err: any) {
      if (isMounted.current) {
        setError(err?.message || 'Failed to load mastery data');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [targetPlayerId]);

  useEffect(() => {
    isMounted.current = true;
    fetch();
    return () => {
      isMounted.current = false;
    };
  }, [fetch]);

  return { data, loading, error, refresh: fetch };
}
