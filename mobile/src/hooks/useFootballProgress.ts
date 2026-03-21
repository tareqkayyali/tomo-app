/**
 * useFootballProgress — Fetches real test results from Supabase and
 * computes the full FootballCardData + history for the Progress screen.
 */

import { useState, useEffect, useCallback } from 'react';
import { getFootballTestHistory } from '../services/api';
import { computeFootballCard, computeFootballHistory } from '../services/footballProgressCalculator';
import type { FootballCardData } from '../types/football';
import type { FootballPosition } from '../types/football';
import type { FootballHistoryEntry } from '../types/football';

interface UseFootballProgressReturn {
  card: FootballCardData | null;
  history: FootballHistoryEntry[];
  isLoading: boolean;
  hasData: boolean;
  refetch: () => void;
}

export function useFootballProgress(
  userId: string,
  age: number,
  position: FootballPosition,
): UseFootballProgressReturn {
  const [card, setCard] = useState<FootballCardData | null>(null);
  const [history, setHistory] = useState<FootballHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAndCompute = useCallback(async () => {
    setIsLoading(true);
    try {
      const { results } = await getFootballTestHistory(50);
      if (results.length === 0) {
        setCard(null);
        setHistory([]);
        return;
      }
      const computed = computeFootballCard(results, userId, age, position);
      const hist = computeFootballHistory(results, position, age);
      // Attach history to card for components that read card.history
      computed.history = hist.map((h) => ({
        date: h.date,
        overall: h.overall,
        rating: h.pathwayRating,
      }));
      setCard(computed);
      setHistory(hist);
    } catch (err) {
      console.warn('[useFootballProgress] Failed to fetch:', err);
      setCard(null);
      setHistory([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId, age, position]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      await fetchAndCompute();
    })();
    return () => { isMounted = false; };
  }, [fetchAndCompute]);

  return {
    card,
    history,
    isLoading,
    hasData: !!card,
    refetch: fetchAndCompute,
  };
}
