/**
 * POST /api/v1/recommendations/refresh
 *
 * Triggers a deep recommendation refresh using Claude + full PlayerContext.
 * Called by the Own It page when recs are stale (>6h since last refresh).
 *
 * Body (optional):
 *   { timezone?: string }  — IANA timezone for context builder
 *
 * Query params (optional):
 *   force=true — bypass staleness check and force refresh
 *
 * Response:
 *   200: { refreshed: true, count: number }
 *   200: { refreshed: false, reason: "not_stale" }
 *   401: { error: "Unauthorized" }
 *   500: { error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { deepRecRefresh, isDeepRefreshStale } from '@/services/recommendations/deepRecRefresh';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  // Auth handled by proxy.ts
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit: 10 requests/5 minutes per user
  const { allowed } = checkRateLimit(userId, 10, 300000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === 'true';

  // Parse optional body
  let timezone: string | undefined;
  try {
    const body = await request.json();
    timezone = body?.timezone;
  } catch {
    // No body or invalid JSON — that's fine
  }

  // Check staleness unless forced
  if (!force) {
    const stale = await isDeepRefreshStale(userId);
    if (!stale) {
      return NextResponse.json({
        refreshed: false,
        reason: 'not_stale',
      });
    }
  }

  // Run deep refresh (blocking — mobile waits for it)
  const result = await deepRecRefresh(userId, timezone);

  if (result.error) {
    return NextResponse.json(
      { refreshed: false, error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    refreshed: true,
    count: result.count,
  });
}
