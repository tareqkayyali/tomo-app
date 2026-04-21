/**
 * useProgressMetrics — fetches the CMS-configured Progress tab metrics for
 * the authenticated athlete.
 *
 * Backend: GET /api/v1/progress/metrics?window=7|30|90
 * Returns resolved metrics with hasData:true only — the backend filters out
 * metrics the athlete has no data for.
 *
 * The hook supports the 7d / 30d / 90d toggle in the UI (Phase 3 exposes
 * 30/90 once the longer-window resolution lands; for now they return the same
 * shape but with wider aggregates). Window changes re-fetch.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../services/api';

export type ProgressMetricCategory =
  | 'readiness'
  | 'wellness'
  | 'academic'
  | 'performance'
  | 'engagement';

export type ProgressMetricDirection = 'higher_better' | 'lower_better' | 'neutral';

export interface ProgressMetric {
  key: string;
  displayName: string;
  displayUnit: string;
  category: ProgressMetricCategory;
  direction: ProgressMetricDirection;
  valueMin: number | null;
  valueMax: number | null;
  latest: number | null;
  avg: number | null;
  deltaPct: number | null;
  hasData: boolean;
}

export type ProgressWindow = 7 | 30 | 90;

interface ProgressMetricsResponse {
  window: ProgressWindow;
  metrics: ProgressMetric[];
}

interface UseProgressMetricsResult {
  metrics: ProgressMetric[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useProgressMetrics(window: ProgressWindow): UseProgressMetricsResult {
  const [metrics, setMetrics] = useState<ProgressMetric[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Version counter protects against out-of-order fetches: if the user flips
  // from 7d to 30d quickly, only the latest request's result applies.
  const versionRef = useRef(0);

  const fetchOnce = useCallback(async () => {
    const version = ++versionRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<ProgressMetricsResponse>(
        `/api/v1/progress/metrics?window=${window}`,
      );
      if (version !== versionRef.current) return;
      setMetrics(res.metrics);
    } catch (err: any) {
      if (version !== versionRef.current) return;
      setError(err?.message ?? 'Failed to load progress metrics');
      setMetrics((prev) => prev ?? []);
    } finally {
      if (version === versionRef.current) setLoading(false);
    }
  }, [window]);

  useEffect(() => {
    fetchOnce();
  }, [fetchOnce]);

  return { metrics, loading, error, refresh: fetchOnce };
}
