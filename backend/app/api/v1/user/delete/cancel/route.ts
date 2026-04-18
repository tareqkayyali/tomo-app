/**
 * POST /api/v1/user/delete/cancel
 *
 * Cancels a pending GDPR Art. 17 deletion request for the authenticated
 * user. The trigger on deletion_requests clears the deletion_* stamps
 * on public.users, which unlocks the write-gate and flips the account
 * back to normal.
 *
 * Body (optional): { reason?: string }
 *
 * Responses:
 *   200 { request: {...}, message: "Deletion cancelled" }
 *   401 Unauthorized
 *   404 No pending request to cancel
 *   500 Internal error
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
  cancelDeletion,
  DeletionError,
} from '@/services/deletion/deletionService';

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ('error' in auth) return auth.error;

  let reason: string | undefined;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.reason === 'string' && body.reason.trim().length > 0) {
      reason = body.reason.trim().slice(0, 500);
    }
  } catch {
    // empty body fine
  }

  try {
    const updated = await cancelDeletion({
      userId: auth.user.id,
      reason,
    });

    return NextResponse.json({
      request: {
        id: updated.id,
        status: updated.status,
        cancelledAt: updated.cancelled_at,
      },
      message: 'Deletion cancelled. Your account is active.',
    });
  } catch (err) {
    if (err instanceof DeletionError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus }
      );
    }
    logger.error('POST /api/v1/user/delete/cancel: unexpected error', {
      userId: auth.user.id,
      error: (err as Error)?.message,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
