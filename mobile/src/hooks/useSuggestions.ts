/**
 * useSuggestions — fetch and manage pending suggestions for the player
 */

import { useState, useEffect, useCallback } from 'react';
import { getSuggestions } from '../services/api';
import type { Suggestion } from '../types';

export function useSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getSuggestions('pending');
      setSuggestions(res.suggestions || []);
    } catch (e) {
      console.warn('[useSuggestions] fetch error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!isMounted) return;
      await fetchSuggestions();
    })();
    return () => { isMounted = false; };
  }, [fetchSuggestions]);

  const handleResolved = useCallback((id: string, _status: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return {
    suggestions,
    isLoading,
    refresh: fetchSuggestions,
    handleResolved,
    pendingCount: suggestions.length,
  };
}
