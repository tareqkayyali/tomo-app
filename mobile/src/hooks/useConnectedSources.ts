/**
 * useConnectedSources — returns a list of connected wearable provider names.
 * Also triggers auto-sync for providers that haven't synced in over 1 hour.
 */

import { useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { getIntegrationStatus, syncWhoop } from '../services/api';
import type { IntegrationStatus } from '../services/api';

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes — vitals should stay fresh

export function useConnectedSources(): { sources: string[]; loading: boolean } {
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const hasSynced = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function loadAndSync() {
      try {
        const { integrations } = await getIntegrationStatus();
        const connected = integrations
          .filter((i: IntegrationStatus) => i.connected)
          .map((i: IntegrationStatus) => i.provider);

        if (mounted) {
          setSources(connected);
          setLoading(false);
        }

        // Auto-sync WHOOP if connected and last sync > 1 hour ago
        if (!hasSynced.current) {
          const whoop = integrations.find(
            (i: IntegrationStatus) => i.provider === 'whoop' && i.connected
          );
          if (whoop) {
            const lastSync = whoop.last_sync_at
              ? new Date(whoop.last_sync_at).getTime()
              : 0;
            if (Date.now() - lastSync > SYNC_INTERVAL_MS) {
              hasSynced.current = true;
              syncWhoop().catch((e) =>
                console.warn('[useConnectedSources] Auto-sync failed:', e)
              );
            }
          }
        }
      } catch (e) {
        console.warn('[useConnectedSources] Failed to load:', e);
        if (mounted) setLoading(false);
      }
    }

    loadAndSync();

    // Re-check when app comes to foreground
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        hasSynced.current = false;
        loadAndSync();
      }
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return { sources, loading };
}
