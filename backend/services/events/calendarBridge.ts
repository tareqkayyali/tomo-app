/**
 * Calendar Bridge — converts calendar events into Layer 1 events for the Athlete Data Fabric.
 *
 * Two modes:
 * 1. **Live bridge** (`bridgeCalendarToEventStream`) — fires immediately when a calendar
 *    event is created/updated/deleted. Emits events with `scheduled: true` in payload so
 *    handlers know this is projected load, not actual completed load.
 *
 * 2. **Daily bridge** (`bridgeCompletedCalendarEvents`) — runs on a cron to convert
 *    past calendar events into actual SESSION_LOG / STUDY_SESSION_LOG events.
 *
 * Deduplication: `payload.calendar_event_id` prevents double-counting across both modes.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { emitEventSafe } from './eventEmitter';
import { EVENT_TYPES, SOURCE_TYPES } from './constants';
import type { EventType } from './constants';
import { estimateLoad } from './computations/loadEstimator';

// ---------------------------------------------------------------------------
// Calendar type → Layer 1 event type mapping
// ---------------------------------------------------------------------------

function calendarTypeToEventType(calType: string): EventType | null {
  switch (calType) {
    case 'training':
    case 'match':
    case 'recovery':
      return EVENT_TYPES.SESSION_LOG;
    case 'study':
      return EVENT_TYPES.STUDY_SESSION_LOG;
    case 'exam':
      return EVENT_TYPES.ACADEMIC_EVENT;
    default:
      return null; // 'other' type — skip
  }
}

function isAcademicType(calType: string): boolean {
  return calType === 'study' || calType === 'exam';
}

// ---------------------------------------------------------------------------
// Shared load computation
// ---------------------------------------------------------------------------

function computeLoadSplit(
  calendarEvent: { event_type: string; estimated_load_au: number | null; start_at: string; end_at: string | null; intensity: string | null }
): { trainingLoadAu: number; academicLoadAu: number; durationMin: number | null } {
  const academic = isAcademicType(calendarEvent.event_type);
  let trainingLoadAu = 0;
  let academicLoadAu = 0;

  const durationMin = calendarEvent.end_at
    ? (new Date(calendarEvent.end_at).getTime() - new Date(calendarEvent.start_at).getTime()) / 60000
    : null;

  if (calendarEvent.estimated_load_au != null) {
    if (academic) {
      academicLoadAu = calendarEvent.estimated_load_au;
    } else {
      trainingLoadAu = calendarEvent.estimated_load_au;
    }
  } else if (durationMin != null) {
    const load = estimateLoad({
      event_type: calendarEvent.event_type,
      intensity: calendarEvent.intensity ?? null,
      duration_min: durationMin,
    });
    trainingLoadAu = load.training_load_au;
    academicLoadAu = load.academic_load_au;
  }

  return { trainingLoadAu, academicLoadAu, durationMin };
}

// ---------------------------------------------------------------------------
// Live Bridge — fires on calendar CRUD
// ---------------------------------------------------------------------------

export interface CalendarEventData {
  id: string;
  title: string;
  event_type: string;
  start_at: string;
  end_at: string | null;
  intensity: string | null;
  estimated_load_au: number | null;
}

/**
 * Bridge a calendar event to the Layer 1 event stream in real-time.
 * Called from both REST API and chat timeline agent on create/update/delete.
 *
 * - CREATED: Emit a scheduled event so RIE fires immediately.
 * - UPDATED: Find existing scheduled event, supersede with corrected one.
 * - DELETED: Emit a zeroed-out correction event.
 */
export async function bridgeCalendarToEventStream(params: {
  athleteId: string;
  calendarEvent: CalendarEventData;
  action: 'CREATED' | 'UPDATED' | 'DELETED';
  createdBy: string;
}): Promise<void> {
  const { athleteId, calendarEvent, action, createdBy } = params;
  const db = supabaseAdmin();

  const fabricEventType = calendarTypeToEventType(calendarEvent.event_type);
  if (!fabricEventType) return; // skip 'other' type

  const { trainingLoadAu, academicLoadAu, durationMin } = computeLoadSplit(calendarEvent);

  // ── CREATED ─────────────────────────────────────────────────────────────
  if (action === 'CREATED') {
    await emitEventSafe({
      athleteId,
      eventType: fabricEventType,
      occurredAt: calendarEvent.start_at,
      source: SOURCE_TYPES.SYSTEM,
      createdBy: `calendar-bridge-live:${createdBy}`,
      payload: {
        calendar_event_id: calendarEvent.id,
        title: calendarEvent.title,
        event_type: calendarEvent.event_type,
        intensity: calendarEvent.intensity,
        duration_min: durationMin,
        training_load_au: trainingLoadAu,
        academic_load_au: academicLoadAu,
        scheduled: true,
        bridged: true,
      },
    });
    return;
  }

  // ── Shared: find existing scheduled event for this calendar_event_id ───
  const correctionOf = await findScheduledEventId(db, athleteId, calendarEvent.id);

  // ── UPDATED ─────────────────────────────────────────────────────────────
  if (action === 'UPDATED') {
    await emitEventSafe({
      athleteId,
      eventType: fabricEventType,
      occurredAt: calendarEvent.start_at,
      source: SOURCE_TYPES.SYSTEM,
      createdBy: `calendar-bridge-live:${createdBy}`,
      correctionOf,
      payload: {
        calendar_event_id: calendarEvent.id,
        title: calendarEvent.title,
        event_type: calendarEvent.event_type,
        intensity: calendarEvent.intensity,
        duration_min: durationMin,
        training_load_au: trainingLoadAu,
        academic_load_au: academicLoadAu,
        scheduled: true,
        bridged: true,
      },
    });
    return;
  }

  // ── DELETED ─────────────────────────────────────────────────────────────
  if (action === 'DELETED') {
    await emitEventSafe({
      athleteId,
      eventType: fabricEventType,
      occurredAt: calendarEvent.start_at,
      source: SOURCE_TYPES.SYSTEM,
      createdBy: `calendar-bridge-live:${createdBy}`,
      correctionOf,
      payload: {
        calendar_event_id: calendarEvent.id,
        event_type: calendarEvent.event_type,
        training_load_au: 0,
        academic_load_au: 0,
        scheduled: true,
        cancelled: true,
        bridged: true,
      },
    });
  }
}

/**
 * Find the most recent scheduled athlete_event for a given calendar_event_id.
 * Used by UPDATE/DELETE to set correctionOf for the superseding event.
 */
async function findScheduledEventId(
  db: ReturnType<typeof supabaseAdmin>,
  athleteId: string,
  calendarEventId: string,
): Promise<string | undefined> {
  // Use a JSONB containment query to find events with this calendar_event_id
  const { data } = await (db as any)
    .from('athlete_events')
    .select('event_id, payload')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!data) return undefined;

  const match = data.find(
    (e: any) =>
      e.payload?.calendar_event_id === calendarEventId &&
      e.payload?.scheduled === true
  );

  return match?.event_id ?? undefined;
}

// ---------------------------------------------------------------------------
// Daily Bridge — cron job for past/completed events
// ---------------------------------------------------------------------------

/**
 * Bridge completed calendar events for a single athlete on a given date.
 *
 * @param athleteId - The athlete's user ID
 * @param date - YYYY-MM-DD date to bridge (typically yesterday)
 * @returns Number of events bridged
 */
export async function bridgeCompletedCalendarEvents(
  athleteId: string,
  date: string,
): Promise<number> {
  const db = supabaseAdmin();

  // 1. Query past calendar events that are training/match/recovery/study/exam
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  const { data: calendarEvents, error: fetchErr } = await (db as any)
    .from('calendar_events')
    .select('id, title, event_type, start_at, end_at, intensity, estimated_load_au')
    .eq('user_id', athleteId)
    .gte('start_at', dayStart)
    .lte('start_at', dayEnd)
    .in('event_type', ['training', 'match', 'recovery', 'study', 'exam']);

  if (fetchErr || !calendarEvents || calendarEvents.length === 0) {
    return 0;
  }

  // 2. Check which calendar events already have corresponding non-scheduled athlete_events
  const { data: existingEvents } = await (db as any)
    .from('athlete_events')
    .select('payload')
    .eq('athlete_id', athleteId)
    .in('event_type', [EVENT_TYPES.SESSION_LOG, EVENT_TYPES.STUDY_SESSION_LOG, EVENT_TYPES.ACADEMIC_EVENT])
    .gte('occurred_at', dayStart)
    .lte('occurred_at', dayEnd);

  const bridgedIds = new Set<string>();
  if (existingEvents) {
    for (const evt of existingEvents) {
      const calEvtId = (evt.payload as any)?.calendar_event_id;
      const isScheduled = (evt.payload as any)?.scheduled === true;
      // Only skip if there's already a non-scheduled (actual) event for this calendar ID
      if (calEvtId && !isScheduled) bridgedIds.add(calEvtId);
    }
  }

  // 3. Emit events for unbridged calendar events
  let bridgedCount = 0;

  for (const calEvt of calendarEvents) {
    if (bridgedIds.has(calEvt.id)) continue; // Already has an actual event

    const fabricEventType = calendarTypeToEventType(calEvt.event_type);
    if (!fabricEventType) continue;

    const { trainingLoadAu, academicLoadAu, durationMin } = computeLoadSplit(calEvt);

    // Find any existing scheduled event to supersede with the actual one
    const correctionOf = await findScheduledEventId(db, athleteId, calEvt.id);

    await emitEventSafe({
      athleteId,
      eventType: fabricEventType,
      occurredAt: calEvt.start_at,
      source: SOURCE_TYPES.SYSTEM,
      createdBy: 'calendar-bridge-daily',
      correctionOf,
      payload: {
        calendar_event_id: calEvt.id,
        title: calEvt.title,
        event_type: calEvt.event_type,
        intensity: calEvt.intensity,
        duration_min: durationMin,
        training_load_au: trainingLoadAu,
        academic_load_au: academicLoadAu,
        bridged: true,
        // Note: no `scheduled: true` — this is the actual/completed event
      },
    });

    bridgedCount++;
  }

  return bridgedCount;
}
