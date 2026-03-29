import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getJournalForEvent } from '@/services/journal/journalService';

// ─── GET /api/v1/journal/:calendarEventId ─────────────────────────────────
// Returns the journal entry for a specific calendar event.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ calendarEventId: string }> }
) {
  const auth = requireAuth(req);
  if ('error' in auth) return auth.error;

  try {
    const { calendarEventId } = await params;

    if (!calendarEventId) {
      return NextResponse.json({ error: 'calendarEventId is required' }, { status: 400 });
    }

    const journal = await getJournalForEvent(auth.user.id, calendarEventId);

    if (!journal) {
      return NextResponse.json({ journal: null });
    }

    return NextResponse.json({ journal });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
