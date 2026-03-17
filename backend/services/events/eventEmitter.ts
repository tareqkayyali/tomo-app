/**
 * Event Emitter — writes immutable events to Layer 1 (athlete_events table).
 *
 * This is the sole entry point for creating events in the Athlete Data Fabric.
 * All event creation flows through here to ensure consistent validation and logging.
 *
 * Usage from API routes:
 *   import { emitEvent } from '@/services/events/eventEmitter';
 *   await emitEvent({ athleteId, eventType: 'WELLNESS_CHECKIN', ... });
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';
import { VALID_EVENT_TYPES, VALID_SOURCES } from './constants';
import type { EmitEventParams, AthleteEvent } from './types';

/**
 * Insert an immutable event into the athlete_events stream.
 *
 * @returns The created event row (including server-generated event_id and created_at).
 * @throws Error if validation fails or DB insert fails.
 */
export async function emitEvent(params: EmitEventParams): Promise<AthleteEvent> {
  const {
    athleteId,
    eventType,
    occurredAt,
    source,
    payload,
    createdBy,
    correctionOf,
  } = params;

  // ── Validation ──
  if (!athleteId) throw new Error('emitEvent: athleteId is required');
  if (!eventType) throw new Error('emitEvent: eventType is required');
  if (!VALID_EVENT_TYPES.has(eventType)) {
    throw new Error(`emitEvent: unknown event_type "${eventType}"`);
  }
  if (!VALID_SOURCES.has(source)) {
    throw new Error(`emitEvent: unknown source "${source}"`);
  }

  const db = supabaseAdmin();

  const row = {
    athlete_id: athleteId,
    event_type: eventType,
    occurred_at: occurredAt || new Date().toISOString(),
    source,
    payload: payload as unknown as Json,
    created_by: createdBy,
    ...(correctionOf ? { correction_of: correctionOf } : {}),
  };

  const { data, error } = await db
    .from('athlete_events')
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error('[EventEmitter] Insert failed:', error.message, { eventType, athleteId });
    throw new Error(`emitEvent: ${error.message}`);
  }

  return data as AthleteEvent;
}

/**
 * Safe wrapper for dual-write scenarios. Catches and logs errors without
 * failing the caller's primary operation.
 *
 * Usage in existing API routes:
 *   await emitEventSafe({ ... }); // never throws
 */
export async function emitEventSafe(params: EmitEventParams): Promise<AthleteEvent | null> {
  try {
    return await emitEvent(params);
  } catch (err) {
    console.error('[EventEmitter] Safe emit failed (non-fatal):', (err as Error).message);
    return null;
  }
}
