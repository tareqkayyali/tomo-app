/**
 * POST /api/v1/events/process
 *
 * Webhook receiver for the Supabase Database Webhook.
 * Called on every INSERT into athlete_events. Delegates to the event processor.
 *
 * Auth: Verified via shared webhook secret (not Bearer token).
 * This route is called by Supabase infrastructure, not by clients.
 */

import { NextRequest, NextResponse } from 'next/server';
import { processEvent } from '@/services/events/eventProcessor';
import type { AthleteEvent } from '@/services/events/types';

// Shared secret for webhook verification
// Set in Supabase Dashboard > Database > Webhooks > HTTP Headers
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  // ── Verify webhook authenticity ──
  const authHeader = req.headers.get('authorization') || '';
  const webhookSecret = req.headers.get('x-webhook-secret') || '';

  const isAuthorized =
    (authHeader === `Bearer ${WEBHOOK_SECRET}`) ||
    (webhookSecret === WEBHOOK_SECRET) ||
    // Fallback: accept service role key as bearer token
    (authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`);

  if (!isAuthorized) {
    console.error('[events/process] Unauthorized webhook call');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Supabase Database Webhooks send the row in different formats depending on config.
  // Handle both:
  //   1. Direct row: { event_id, athlete_id, ... }
  //   2. Wrapped format: { type: 'INSERT', record: { event_id, ... } }
  //   3. Wrapped format: { type: 'INSERT', table: 'athlete_events', record: { ... } }
  let eventRow: Record<string, unknown>;

  if (body.record && typeof body.record === 'object') {
    eventRow = body.record as Record<string, unknown>;
  } else if (body.event_id) {
    eventRow = body;
  } else {
    console.error('[events/process] Unrecognized payload shape:', Object.keys(body));
    return NextResponse.json({ error: 'Unrecognized payload format' }, { status: 400 });
  }

  // Validate minimum required fields
  if (!eventRow.event_id || !eventRow.athlete_id || !eventRow.event_type) {
    console.error('[events/process] Missing required fields:', {
      event_id: !!eventRow.event_id,
      athlete_id: !!eventRow.athlete_id,
      event_type: !!eventRow.event_type,
    });
    return NextResponse.json({ error: 'Missing required event fields' }, { status: 400 });
  }

  // Process the event (handlers + snapshot write)
  // processEvent catches its own errors and logs them — always returns void.
  await processEvent(eventRow as unknown as AthleteEvent);

  // Always return 200 to avoid Supabase retrying on permanent failures.
  // Transient failures are monitored via console.error logs.
  return NextResponse.json({ processed: true, event_id: eventRow.event_id });
}
