/**
 * POST /api/v1/admin/deletion-requests/[id]/force-purge
 *
 * Admin-only bypass of the grace-period window for regulator / forensic
 * flows. Invokes the tomo_purge_user() RPC immediately. Force-purges are
 * rare + sensitive — every invocation writes a logger.warn so ops has an
 * audit trail independent of the DB.
 *
 * Success: 200 { tombstoneId, status: 'purged' }
 * Failure: 500 { error, failureReason?, failureCount? }
 *   — surfaces deletion_requests.failure_reason from the post-RPC row so
 *   the admin UI can show the underlying SQL error without another hop.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/apiAuth';
import { logger } from '@/lib/logger';
import {
  forcePurgeNow,
  getDeletionRequestById,
  DeletionError,
} from '@/services/deletion/deletionService';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  logger.warn('admin.forcePurge: initiated', {
    requestId: id,
    adminId: auth.user.id,
    adminEmail: auth.user.email,
  });

  try {
    const { tombstoneId } = await forcePurgeNow(id);
    logger.warn('admin.forcePurge: succeeded', {
      requestId: id,
      adminId: auth.user.id,
      tombstoneId,
    });
    return NextResponse.json({ tombstoneId, status: 'purged' });
  } catch (err) {
    // tomo_purge_user() stamps failure_reason on the request row before
    // re-raising. Re-read the row so we can surface that to the admin
    // instead of the generic RPC error string.
    let failureReason: string | null = null;
    let failureCount: number | null = null;
    try {
      const row = await getDeletionRequestById(id);
      failureReason = row?.failure_reason ?? null;
      failureCount = row?.failure_count ?? null;
    } catch {
      // Lookup errors are non-fatal here — the primary error is what
      // matters. Swallow and continue with null failure context.
    }

    const message =
      err instanceof DeletionError ? err.message : (err as Error)?.message ?? 'unknown';
    const httpStatus =
      err instanceof DeletionError ? err.httpStatus : 500;

    logger.error('admin.forcePurge: failed', {
      requestId: id,
      adminId: auth.user.id,
      error: message,
      failureReason,
      failureCount,
    });

    return NextResponse.json(
      {
        error: message,
        code: err instanceof DeletionError ? err.code : 'INTERNAL',
        failureReason,
        failureCount,
      },
      { status: httpStatus }
    );
  }
}
