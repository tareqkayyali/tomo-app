/**
 * GET /api/v1/recommendations
 *
 * Returns active recommendations for the authenticated athlete.
 * For coaches/parents: pass ?targetPlayerId=xxx to read a linked athlete's recs.
 *
 * Query params:
 *   targetPlayerId (optional) — target athlete ID (required for coach/parent)
 *   limit          (optional) — max results (default 10)
 *   recTypes       (optional) — comma-separated filter (e.g., "READINESS,LOAD_WARNING")
 *   includeExpired (optional) — "true" to include expired recs
 *
 * Response:
 *   200: { recommendations: Recommendation[], generated_at: string }
 *   401: { error: "Unauthorized" }
 *   403: { error: "Not authorized..." }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRecommendations } from '@/services/recommendations/getRecommendations';
import type { RecType } from '@/services/recommendations/types';

export async function GET(request: NextRequest) {
  // Auth is handled by proxy.ts — userId comes from the verified token
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetPlayerId = searchParams.get('targetPlayerId') || userId;
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const recTypesParam = searchParams.get('recTypes');
  const recTypes = recTypesParam
    ? (recTypesParam.split(',').filter(Boolean) as RecType[])
    : undefined;
  const includeExpired = searchParams.get('includeExpired') === 'true';

  // Determine role
  let role: 'ATHLETE' | 'COACH' | 'PARENT' = 'ATHLETE';

  if (targetPlayerId !== userId) {
    // Requesting another user's recommendations — check relationship
    const db = supabaseAdmin();
    const { data: rel } = await db
      .from('relationships')
      .select('relationship_type')
      .eq('guardian_id', userId)
      .eq('player_id', targetPlayerId)
      .eq('status', 'accepted')
      .single();

    if (!rel) {
      return NextResponse.json(
        { error: "Not authorized to view this athlete's recommendations" },
        { status: 403 }
      );
    }

    role = rel.relationship_type === 'coach' ? 'COACH' : 'PARENT';
  }

  const recommendations = await getRecommendations(targetPlayerId, {
    role,
    recTypes,
    limit,
    includeExpired,
  });

  return NextResponse.json({
    recommendations,
    generated_at: new Date().toISOString(),
  });
}
