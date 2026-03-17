/**
 * POST /api/v1/events/ingest
 *
 * Client-facing endpoint for submitting events to the Athlete Data Fabric.
 * Validates the event, inserts into athlete_events (Layer 1), and returns
 * the created event. The event processor (webhook) handles Layer 2 updates.
 *
 * Auth: Bearer token required (athlete, coach, or parent).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { emitEvent } from '@/services/events/eventEmitter';
import { VALID_EVENT_TYPES, VALID_SOURCES } from '@/services/events/constants';
import type { SourceType, EventType } from '@/services/events/constants';

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ('error' in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // ── Validate required fields ──
  const { event_type, occurred_at, source, payload, athlete_id, correction_of } = body;

  if (!event_type || typeof event_type !== 'string') {
    return NextResponse.json({ error: 'event_type is required (string)' }, { status: 400 });
  }
  if (!VALID_EVENT_TYPES.has(event_type)) {
    return NextResponse.json(
      { error: `Invalid event_type: ${event_type}`, valid: Array.from(VALID_EVENT_TYPES) },
      { status: 400 },
    );
  }

  const sourceStr = (source as string) || 'MANUAL';
  if (!VALID_SOURCES.has(sourceStr)) {
    return NextResponse.json(
      { error: `Invalid source: ${sourceStr}`, valid: Array.from(VALID_SOURCES) },
      { status: 400 },
    );
  }

  if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
    return NextResponse.json({ error: 'payload must be a JSON object' }, { status: 400 });
  }

  // Determine the target athlete:
  // - Players submit events for themselves (athlete_id = their own ID)
  // - Coaches/parents can submit for a linked athlete (athlete_id in body)
  const targetAthleteId = (athlete_id as string) || auth.user.id;

  try {
    const event = await emitEvent({
      athleteId: targetAthleteId,
      eventType: event_type as EventType,
      occurredAt: (occurred_at as string) || new Date().toISOString(),
      source: sourceStr as SourceType,
      payload: (payload as Record<string, unknown>) || {},
      createdBy: auth.user.id,
      correctionOf: (correction_of as string) || undefined,
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    console.error('[events/ingest] Error:', (err as Error).message);
    return NextResponse.json(
      { error: 'Failed to create event', details: (err as Error).message },
      { status: 500 },
    );
  }
}
