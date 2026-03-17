/**
 * useOutputData — fetches unified Output snapshot from backend.
 */

import { useState, useCallback, useEffect } from 'react';
import { getOutputSnapshot, type OutputSnapshot } from '../services/api';

export function useOutputData() {
  const [data, setData] = useState<OutputSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setError(null);
      const snapshot = await getOutputSnapshot();
      setData(snapshot);
    } catch (err: any) {
      setError(err?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetch();
  }, [fetch]);

  return { data, loading, error, refresh };
}
