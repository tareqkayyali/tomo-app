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
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRelationships();
  }, [fetchRelationships]);

  return {
    relationships,
    isLoading,
    refresh: fetchRelationships,
  };
}
