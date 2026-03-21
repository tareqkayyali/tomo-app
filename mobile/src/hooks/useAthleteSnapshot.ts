/**
 * useAthleteSnapshot — fetches the pre-computed athlete snapshot (Layer 2)
 * from the Data Fabric. Provides O(1) access to readiness, ACWR, wellness
 * trends, CV metrics, and PHV data.
 *
 * Usage:
 *   const { snapshot, loading, error, refresh } = useAthleteSnapshot();
 *   // For coach viewing a player:
 *   const { snapshot } = useAthleteSnapshot(playerId);
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getAthleteSnapshot, type AthleteSnapshot } from '../services/api';
import { colors } from '../theme/colors';

interface UseAthleteSnapshotReturn {
  snapshot: AthleteSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAthleteSnapshot(
  athleteId?: string
): UseAthleteSnapshotReturn {
  const [snapshot, setSnapshot] = useState<AthleteSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchSnapshot = useCallback(async () => {
    try {
      setError(null);
      const data = await getAthleteSnapshot(athleteId);
      if (mountedRef.current) {
        setSnapshot(data);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err?.message || 'Failed to load athlete snapshot');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [athleteId]);

  useEffect(() => {
    mountedRef.current = true;
    fetchSnapshot();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchSnapshot]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchSnapshot();
  }, [fetchSnapshot]);

  return { snapshot, loading, error, refresh };
}

// ── Derived convenience getters ───────────────────────────────────────

/** Returns a simple traffic-light color from RAG string */
export function ragToColor(rag: string | null | undefined): string {
  switch (rag) {
    case 'GREEN':
      return colors.accent;
    case 'AMBER':
      return colors.warning;
    case 'RED':
      return colors.error;
    default:
      return colors.textSecondary;
  }
}

/** Returns human-readable ACWR risk label */
export function acwrRiskLabel(acwr: number | null | undefined): string {
  if (acwr == null) return 'No data';
  if (acwr < 0.8) return 'Under-trained';
  if (acwr <= 1.3) return 'Sweet spot';
  if (acwr <= 1.5) return 'Caution';
  return 'Danger zone';
}

/** Returns human-readable wellness trend */
export function wellnessTrendLabel(
  trend: string | null | undefined
): string {
  switch (trend) {
    case 'IMPROVING':
      return 'Trending up';
    case 'DECLINING':
      return 'Trending down';
    case 'STABLE':
      return 'Stable';
    default:
      return 'No data';
  }
}
