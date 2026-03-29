import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getJournalHistory } from '@/services/journal/journalService';

// ─── GET /api/v1/journal?limit=20&offset=0 ────────────────────────────────
// Returns paginated journal history for the authenticated athlete.

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ('error' in auth) return auth.error;

  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 50);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0);

    const { journals, total } = await getJournalHistory(auth.user.id, limit, offset);

    return NextResponse.json({
      journals,
      total,
      limit,
      offset,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
