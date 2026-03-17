/**
 * Offline Event Queue — AsyncStorage-backed queue for resilient event delivery.
 *
 * When the primary API call to /api/v1/events/ingest fails (network error),
 * the event is queued locally and flushed when connectivity is restored.
 *
 * Max 3 retries per event before discard.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './api';

const STORAGE_KEY = '@tomo/event_queue';
const MAX_RETRIES = 3;

export interface QueuedEvent {
  id: string;
  athleteId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  queuedAt: string;
  retryCount: number;
}

// Simple unique ID generator (no uuid dependency needed)
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function readQueue(): Promise<QueuedEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedEvent[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

/**
 * Add an event to the offline queue.
 */
async function enqueue(
  event: Omit<QueuedEvent, 'id' | 'queuedAt' | 'retryCount'>,
): Promise<void> {
  const queue = await readQueue();
  queue.push({
    ...event,
    id: generateId(),
    queuedAt: new Date().toISOString(),
    retryCount: 0,
  });
  await writeQueue(queue);
}

/**
 * Attempt to flush all queued events to the backend.
 * Returns the number of successfully sent events.
 */
async function flush(): Promise<number> {
  const queue = await readQueue();
  if (queue.length === 0) return 0;

  let sent = 0;
  const remaining: QueuedEvent[] = [];

  for (const item of queue) {
    try {
      await apiRequest('/api/v1/events/ingest', {
        method: 'POST',
        body: JSON.stringify({
          athlete_id: item.athleteId,
          event_type: item.eventType,
          payload: item.payload,
          occurred_at: item.occurredAt,
        }),
      });
      sent++;
    } catch {
      // Network still down or server error
      const nextRetry = item.retryCount + 1;
      if (nextRetry < MAX_RETRIES) {
        remaining.push({ ...item, retryCount: nextRetry });
      } else {
        console.warn(
          `[EventQueue] Discarding event ${item.eventType} after ${MAX_RETRIES} retries`,
        );
      }
    }
  }

  await writeQueue(remaining);
  return sent;
}

/**
 * Get the number of events waiting in the queue.
 */
async function getQueueSize(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

/**
 * Clear all queued events (e.g. on logout).
 */
async function clear(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export const eventQueue = {
  enqueue,
  flush,
  getQueueSize,
  clear,
};
