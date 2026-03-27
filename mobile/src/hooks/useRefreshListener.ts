/**
 * useRefreshListener — subscribes to refresh events from the chat refresh bus.
 * Auto-unsubscribes on unmount.
 */
import { useEffect } from 'react';
import { onRefresh } from '../utils/refreshBus';

export function useRefreshListener(target: string, callback: () => void) {
  useEffect(() => {
    return onRefresh(target, callback);
  }, [target, callback]);
}
