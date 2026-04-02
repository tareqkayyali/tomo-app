import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * POST /api/v1/notifications/test-push
 *
 * Direct push test — bypasses notification engine, preferences, quiet hours.
 * Sends a push directly to the athlete's registered Expo token.
 *
 * Body: { athlete_id: string } or uses the first token in the table.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const db = supabaseAdmin() as any;

    // Get push token
    let query = db.from('player_push_tokens').select('user_id, expo_push_token, platform');
    if (body.athlete_id) {
      query = query.eq('user_id', body.athlete_id);
    }
    const { data: tokens, error: tokenErr } = await query.limit(5);

    if (tokenErr || !tokens || tokens.length === 0) {
      return NextResponse.json({ error: 'No push tokens found', detail: tokenErr?.message });
    }

    const results = [];
    for (const tokenRow of tokens) {
      const payload = {
        to: tokenRow.expo_push_token,
        title: 'Tomo Push Test',
        body: 'If you see this, push notifications are working!',
        data: { screen: 'NotificationCenter' },
        sound: 'default',
      };

      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseBody = await response.json();
      results.push({
        user_id: tokenRow.user_id,
        platform: tokenRow.platform,
        token_prefix: tokenRow.expo_push_token.slice(0, 30),
        expo_status: response.status,
        expo_response: responseBody,
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
