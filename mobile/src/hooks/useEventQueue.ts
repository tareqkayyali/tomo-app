/**
 * useEventQueue — Network-aware auto-flush hook for the offline event queue.
 *
 * Automatically flushes queued events when:
 * - App returns to foreground (AppState → active)
 * - Network connectivity is restored (NetInfo)
 *
 * Exposes queue size for optional UI badge.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
// NetInfo is optional — gracefully degrade if not installed
let NetInfo: { addEventListener?: (cb: (state: { isConnected: boolean | null }) => void) => () => void } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NetInfo = require('@react-native-community/netinfo').default;
} catch {
  // Package not installed — network-restore flush disabled
}
import { eventQueue } from '../services/eventQueue';

export function useEventQueue() {
  const [queueSize, setQueueSize] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);

  const refreshSize = useCallback(async () => {
    const size = await eventQueue.getQueueSize();
    setQueueSize(size);
  }, []);

  const flush = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const sent = await eventQueue.flush();
      if (sent > 0) {
        console.log(`[useEventQueue] Flushed ${sent} queued events`);
      }
    } catch {
      // silent — individual events handle their own retry logic
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      await refreshSize();
    }
  }, [refreshSize]);

  // Initial size check
  useEffect(() => {
    refreshSize();
  }, [refreshSize]);

  // Flush on app foreground
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        flush();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [flush]);

  // Flush on network connectivity restored (only if NetInfo is available)
  useEffect(() => {
    if (!NetInfo?.addEventListener) return;
    const unsubscribe = NetInfo.addEventListener((state: { isConnected: boolean | null; isInternetReachable?: boolean | null }) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        flush();
      }
    });
    return () => unsubscribe();
  }, [flush]);

  return { queueSize, isSyncing, flush };
}
