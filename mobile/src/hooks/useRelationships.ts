/**
 * useRelationships — fetch and manage linked users
 */

import { useState, useEffect, useCallback } from 'react';
import { getRelationships } from '../services/api';
import type { Relationship } from '../types';

export function useRelationships() {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRelationships = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getRelationships();
      setRelationships(res.relationships || []);
    } catch (e) {
      console.warn('[useRelationships] fetch error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      await fetchRelationships();
    })();
    return () => { isMounted = false; };
  }, [fetchRelationships]);

  return {
    relationships,
    isLoading,
    refresh: fetchRelationships,
  };
}
