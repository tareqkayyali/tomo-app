import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import { setPreSessionTarget } from '@/services/journal/journalService';
import { emitEventSafe } from '@/services/events/eventEmitter';
import { EVENT_TYPES, SOURCE_TYPES } from '@/services/events/constants';
import type { JournalPreSessionPayload } from '@/services/events/types';

const preSessionSchema = z.object({
  calendar_event_id: z.string().uuid(),
  pre_target: z.string().min(1).max(500),
  pre_mental_cue: z.string().max(100).optional(),
  pre_focus_tag: z.enum(['strength', 'speed', 'technique', 'tactical', 'fitness']).optional(),
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ('error' in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = preSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { calendar_event_id, pre_target, pre_mental_cue, pre_focus_tag } = parsed.data;

    // 1. Save via journal service
    const journal = await setPreSessionTarget(auth.user.id, {
      calendar_event_id,
      pre_target,
      pre_mental_cue,
      pre_focus_tag,
    });

    // 2. Emit event to Athlete Data Fabric
    const eventPayload: JournalPreSessionPayload = {
      calendar_event_id,
      journal_id: journal.id,
      training_category: journal.training_category,
      training_name: journal.training_name,
      pre_target,
      pre_mental_cue,
      pre_focus_tag,
      event_date: journal.event_date,
      journal_variant: journal.journal_variant,
    };

    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: EVENT_TYPES.JOURNAL_PRE_SESSION,
      source: SOURCE_TYPES.MANUAL,
      payload: eventPayload as unknown as Record<string, unknown>,
      createdBy: auth.user.id,
    });

    return NextResponse.json({
      journal_id: journal.id,
      journal_state: journal.journal_state,
      message: 'Target set. Good luck.',
    }, { status: 201 });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes('not found') || message.includes('Not authorized')
      ? 403 : message.includes('locked') ? 423 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
