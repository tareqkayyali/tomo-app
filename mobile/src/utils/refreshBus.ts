/**
 * Lightweight event bus for cross-screen data refresh.
 *
 * When AI Chat logs a test, creates an event, or updates data,
 * the chat handler emits a refresh target. Data hooks (useOutputData,
 * etc.) subscribe and refetch automatically.
 *
 * Usage:
 *   // In chat handler (after AI response):
 *   emitRefresh('metrics');
 *
 *   // In data hook:
 *   useRefreshListener('metrics', () => fetchData());
 */

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

/** Emit a refresh event for a target (e.g. 'metrics', 'calendar', 'readiness') */
export function emitRefresh(target: string) {
  const set = listeners.get(target);
  if (set) {
    set.forEach((fn) => {
      try { fn(); } catch {}
    });
  }
  // Also emit wildcard listeners
  const wildcardSet = listeners.get('*');
  if (wildcardSet) {
    wildcardSet.forEach((fn) => {
      try { fn(); } catch {}
    });
  }
}

/** Subscribe to refresh events. Returns unsubscribe function. */
export function onRefresh(target: string, listener: Listener): () => void {
  if (!listeners.has(target)) {
    listeners.set(target, new Set());
  }
  listeners.get(target)!.add(listener);
  return () => {
    listeners.get(target)?.delete(listener);
  };
}
