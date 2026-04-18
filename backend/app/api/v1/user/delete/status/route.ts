/**
 * GET /api/v1/user/delete/status
 *
 * Returns the authenticated user's current deletion-request state.
 * Shape is stable so the mobile DeleteAccountScreen can render the
 * correct CTA without needing to re-interpret enum values.
 *
 * Response 200:
 *   {
 *     status: 'none' | 'pending' | 'cancelled' | 'purging' | 'purged' | 'failed',
 *     requestId: string | null,
 *     jurisdiction: 'GDPR' | 'CCPA' | 'PDPL' | 'CUSTOM' | null,
 *     requestedAt: ISO8601 | null,
 *     scheduledPurgeAt: ISO8601 | null,
 *     gracePeriodDays: number | null,
 *     daysRemaining: number | null,
 *     canCancel: boolean,
 *     method: 'user_self_service' | 'admin_forced' | 'parent_revocation' | 'regulator_request' | null,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
  getDeletionStatus,
  DeletionError,
} from '@/services/deletion/deletionService';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ('error' in auth) return auth.error;

  try {
    const status = await getDeletionStatus(auth.user.id);
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof DeletionError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus }
      );
    }
    logger.error('GET /api/v1/user/delete/status: unexpected error', {
      userId: auth.user.id,
      error: (err as Error)?.message,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
