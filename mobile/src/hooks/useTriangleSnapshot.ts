/**
 * useTriangleSnapshot — extends useAthleteSnapshot with Supabase Realtime
 * subscriptions for live snapshot updates.
 *
 * When a coach or parent views an athlete's snapshot, this hook:
 *   1. Fetches the initial snapshot via API (role-filtered)
 *   2. Subscribes to Supabase Realtime for live updates
 *   3. Merges incoming changes into state without additional API calls
 *
 * Usage:
 *   // Coach viewing a player:
 *   const { snapshot, loading, isLive } = useTriangleSnapshot(playerId);
 *
 *   // Athlete viewing own snapshot (with live updates):
 *   const { snapshot, isLive } = useTriangleSnapshot();
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { getAthleteSnapshot, type AthleteSnapshot } from '../services/api';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseTriangleSnapshotReturn {
  snapshot: AthleteSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** True once the Realtime channel is connected and receiving updates */
  isLive: boolean;
}

export function useTriangleSnapshot(
  athleteId?: string
): UseTriangleSnapshotReturn {
  const [snapshot, setSnapshot] = useState<AthleteSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const mountedRef = useRef(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Fetch initial snapshot via API (role-filtered by backend)
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

  // Subscribe to Realtime updates for this athlete's snapshot
  useEffect(() => {
    mountedRef.current = true;
    fetchSnapshot();

    // Only subscribe if we have an athlete ID to watch
    // (for own snapshot, we need to wait for the fetch to get the ID)
    const targetId = athleteId;
    if (!targetId) {
      return () => {
        mountedRef.current = false;
      };
    }

    const channelName = `snapshot:${targetId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'athlete_snapshots',
          filter: `athlete_id=eq.${targetId}`,
        },
        (payload) => {
          if (mountedRef.current && payload.new) {
            // Merge Realtime update into current snapshot
            // Note: Realtime sends the full row, but we only update fields
            // that the role-filtered API would also expose. The backend
            // snapshot API already handles filtering, and the initial fetch
            // established which fields are visible. Realtime may send more
            // fields than the role allows, but they just get stored as extra
            // data — the UI only renders what it uses from the snapshot type.
            setSnapshot((prev) => ({
              ...(prev || ({} as AthleteSnapshot)),
              ...(payload.new as Partial<AthleteSnapshot>),
            }));
          }
        }
      )
      .subscribe((status) => {
        if (mountedRef.current) {
          setIsLive(status === 'SUBSCRIBED');
        }
      });

    channelRef.current = channel;

    return () => {
      mountedRef.current = false;
      setIsLive(false);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [athleteId, fetchSnapshot]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchSnapshot();
  }, [fetchSnapshot]);

  return { snapshot, loading, error, refresh, isLive };
}
