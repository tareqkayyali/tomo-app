/**
 * POST /api/v1/user/delete
 *
 * GDPR Art. 17 deletion REQUEST. Does NOT delete immediately — creates
 * a deletion_request row with a grace period (30 days for GDPR, 45 for
 * CCPA, 90 for PDPL). During the grace period all writes are blocked
 * and the account is unusable. Users can cancel via
 * POST /api/v1/user/delete/cancel before the scheduled_purge_at.
 *
 * Idempotent: re-requesting when a pending request exists returns the
 * existing request (200 OK, not a 409) so mobile retries don't explode.
 *
 * Body (all optional):
 *   {
 *     jurisdiction?: 'GDPR' | 'CCPA' | 'PDPL',
 *     // customGraceDays only honoured when caller is service_role
 *     reason?: string,
 *   }
 *
 * Responses:
 *   200 { request: {...}, message: "Deletion scheduled" }
 *   401 Unauthorized
 *   400 Invalid input
 *   500 Internal error
 *
 * Historical DELETE handler (immediate nuke) replaced by this
 * request-based flow as of migration 064. See the PR description for
 * the migration playbook.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
  requestDeletion,
  DeletionError,
  type Jurisdiction,
} from '@/services/deletion/deletionService';

const VALID_JURISDICTIONS: ReadonlyArray<Jurisdiction> = ['GDPR', 'CCPA', 'PDPL'];

function parseJurisdiction(input: unknown): Jurisdiction {
  if (typeof input !== 'string') return 'GDPR';
  const up = input.toUpperCase();
  return (VALID_JURISDICTIONS as ReadonlyArray<string>).includes(up)
    ? (up as Jurisdiction)
    : 'GDPR';
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ('error' in auth) return auth.error;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // Empty body is fine — caller is accepting defaults.
  }

  const jurisdiction = parseJurisdiction(body.jurisdiction);

  try {
    const request = await requestDeletion({
      userId: auth.user.id,
      jurisdiction,
      method: 'user_self_service',
    });

    return NextResponse.json({
      request: {
        id: request.id,
        status: request.status,
        jurisdiction: request.jurisdiction,
        requestedAt: request.requested_at,
        scheduledPurgeAt: request.scheduled_purge_at,
        gracePeriodDays: request.grace_period_days,
      },
      message: `Your account is scheduled for permanent deletion on ${new Date(
        request.scheduled_purge_at
      ).toUTCString()}. You can cancel any time before then.`,
    });
  } catch (err) {
    if (err instanceof DeletionError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus }
      );
    }
    logger.error('POST /api/v1/user/delete: unexpected error', {
      userId: auth.user.id,
      error: (err as Error)?.message,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/user/delete
 *
 * Legacy verb — identical semantics to POST for backwards compat with
 * mobile clients that already use DELETE against this path. Still
 * routes through the request-based pipeline; it never purges inline.
 */
export async function DELETE(req: NextRequest) {
  return POST(req);
}
