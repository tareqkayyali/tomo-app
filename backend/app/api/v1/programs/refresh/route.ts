/**
 * Program Refresh API
 *
 * POST /api/v1/programs/refresh
 *
 * Triggers a deep AI-powered program refresh using the athlete's full context.
 * Returns the AI-generated programs directly so the frontend can use them
 * immediately without a second fetch.
 *
 * Query params:
 *   ?force=true — bypass staleness check
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  deepProgramRefresh,
  isDeepProgramStale,
  getCachedProgramRecommendations,
} from '@/services/programs/deepProgramRefresh';

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ('error' in auth) return auth.error;

  const athleteId = auth.user.id;
  const force = req.nextUrl.searchParams.get('force') === 'true';

  // Extract timezone from request body if provided
  let timezone: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    timezone = body.timezone;
  } catch {
    // No body — fine
  }

  // Check staleness (unless forced)
  if (!force) {
    const stale = await isDeepProgramStale(athleteId);
    if (!stale) {
      // Return cached programs if available
      const cached = await getCachedProgramRecommendations(athleteId);
      return NextResponse.json(
        { refreshed: false, reason: 'Programs are fresh (< 12h old)', programs: cached },
        { headers: { 'api-version': 'v1' } }
      );
    }
  }

  // Run the deep refresh
  const result = await deepProgramRefresh(athleteId, timezone);

  if (result.error) {
    return NextResponse.json(
      { refreshed: false, count: 0, error: result.error },
      { status: 500, headers: { 'api-version': 'v1' } }
    );
  }

  return NextResponse.json(
    { refreshed: true, count: result.count, programs: result.result },
    { headers: { 'api-version': 'v1' } }
  );
}
