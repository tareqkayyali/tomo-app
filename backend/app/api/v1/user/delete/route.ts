/**
 * DELETE /api/v1/user/delete
 *
 * GDPR data deletion endpoint. Deletes the authenticated user's account
 * and all associated data (CASCADE from users table).
 *
 * Auth: Required (handled by proxy.ts — route is under /api/v1/user/).
 *
 * Response:
 *   200: { success: true, message: "Account and all data deleted" }
 *   401: { error: "Unauthorized" }
 *   500: { error: "Deletion failed" | "Internal server error" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export async function DELETE(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = supabaseAdmin();

    // Delete user row — CASCADE will delete all related data
    // (checkins, plans, calendar_events, chat_messages, athlete_events, etc.)
    const { error } = await db.from('users').delete().eq('id', userId);

    if (error) {
      logger.error('GDPR deletion failed', { userId, error: error.message });
      return NextResponse.json({ error: 'Deletion failed' }, { status: 500 });
    }

    // Also delete from Supabase Auth
    const { error: authError } = await db.auth.admin.deleteUser(userId);
    if (authError) {
      logger.warn('Auth user deletion failed (data already deleted)', { userId, error: authError.message });
    }

    logger.info('GDPR deletion completed', { userId });
    return NextResponse.json({ success: true, message: 'Account and all data deleted' });
  } catch (err: any) {
    logger.error('GDPR deletion error', { error: err.message });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
