import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import { setPostSessionReflection } from '@/services/journal/journalService';
import { emitEventSafe } from '@/services/events/eventEmitter';
import { EVENT_TYPES, SOURCE_TYPES } from '@/services/events/constants';
import type { JournalPostSessionPayload } from '@/services/events/types';

const postSessionSchema = z.object({
  journal_id: z.string().uuid(),
  post_outcome: z.enum(['fell_short', 'hit_it', 'exceeded']),
  post_reflection: z.string().min(1).max(1000),
  post_next_focus: z.string().max(500).optional(),
  post_body_feel: z.number().int().min(1).max(10).optional(),
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ('error' in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = postSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { journal_id, post_outcome, post_reflection, post_next_focus, post_body_feel } = parsed.data;

    // 1. Save via journal service
    const journal = await setPostSessionReflection(auth.user.id, {
      journal_id,
      post_outcome,
      post_reflection,
      post_next_focus,
      post_body_feel,
    });

    // 2. Emit event to Athlete Data Fabric
    const eventPayload: JournalPostSessionPayload = {
      calendar_event_id: journal.calendar_event_id,
      journal_id: journal.id,
      training_category: journal.training_category,
      training_name: journal.training_name,
      post_outcome,
      post_reflection,
      post_next_focus,
      post_body_feel,
      event_date: journal.event_date,
      journal_variant: journal.journal_variant,
    };

    await emitEventSafe({
      athleteId: auth.user.id,
      eventType: EVENT_TYPES.JOURNAL_POST_SESSION,
      source: SOURCE_TYPES.MANUAL,
      payload: eventPayload as unknown as Record<string, unknown>,
      createdBy: auth.user.id,
    });

    return NextResponse.json({
      journal_id: journal.id,
      journal_state: journal.journal_state,
      ai_insight: journal.ai_insight,
      message: 'Reflection saved. Nice work.',
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes('not found') || message.includes('Not authorized')
      ? 403 : message.includes('locked') ? 423 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
