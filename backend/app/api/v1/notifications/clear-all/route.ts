import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * POST /api/v1/notifications/clear-all
 * Deletes ALL notifications for a given athlete. Testing only.
 * Body: { athlete_id?: string } — defaults to first athlete with push token.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const db = supabaseAdmin() as any;

    let athleteId = body.athlete_id;
    if (!athleteId) {
      const { data } = await db.from('player_push_tokens').select('user_id').limit(1).single();
      athleteId = data?.user_id;
    }

    if (!athleteId) {
      return NextResponse.json({ error: 'No athlete found' }, { status: 404 });
    }

    const { count, error } = await db
      .from('athlete_notifications')
      .delete()
      .eq('athlete_id', athleteId)
      .select('id', { count: 'exact', head: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: count, athlete_id: athleteId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
