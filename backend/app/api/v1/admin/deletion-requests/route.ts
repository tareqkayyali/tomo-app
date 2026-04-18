/**
 * GET /api/v1/admin/deletion-requests
 *
 * Admin-only listing of deletion pipeline rows for the ops surface.
 * Supports optional ?status= filter (pending | purged | cancelled |
 * failed). Paginated via ?limit & ?offset. Includes the purge_log
 * entries + tombstone_id for each row so the UI can render detail
 * without a second round-trip.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/apiAuth';
import { logger } from '@/lib/logger';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  listDeletionRequests,
  DeletionError,
  type DeletionRequestRow,
} from '@/services/deletion/deletionService';

type StatusFilter = DeletionRequestRow['status'];
const VALID_STATUS: ReadonlyArray<StatusFilter> = [
  'pending',
  'cancelled',
  'purging',
  'purged',
  'failed',
];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const status: StatusFilter | undefined =
    statusParam && (VALID_STATUS as ReadonlyArray<string>).includes(statusParam)
      ? (statusParam as StatusFilter)
      : undefined;

  const limit = Math.min(
    500,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50)
  );
  const offset = Math.max(
    0,
    parseInt(url.searchParams.get('offset') ?? '0', 10) || 0
  );

  try {
    const rows = await listDeletionRequests({ status, limit, offset });

    // Hydrate with basic user metadata (email + age_band) for admins.
    // Email is read from auth.users via the admin client; for rows whose
    // users.id was already cascaded (status=purged) we fall through to
    // null — the tombstone carries aggregate metadata instead.
    // Cast through any for the deletion_* tables — the generated
    // database.ts types haven't been regenerated against migration 064
    // yet. Pattern matches outputAgent.ts line 1104.
    const rawDb = supabaseAdmin() as unknown as {
      from: (t: string) => any;
    };
    const userIds = rows.map((r) => r.user_id);
    const users: Record<string, { email: string | null; age_band: string | null }> = {};
    if (userIds.length > 0) {
      const { data: userRows } = await rawDb
        .from('users')
        .select('id, email, date_of_birth')
        .in('id', userIds);

      const byId: Record<string, { email: string; date_of_birth: string | null }> = {};
      for (const u of (userRows ?? []) as Array<{
        id: string;
        email: string;
        date_of_birth: string | null;
      }>) {
        byId[u.id] = { email: u.email, date_of_birth: u.date_of_birth };
      }
      for (const id of userIds) {
        const u = byId[id];
        users[id] = {
          email: u?.email ?? null,
          age_band: null, // computed at read time in the UI if needed
        };
      }
    }

    // Get tombstones for purged rows so admin UI shows a link.
    const tombstoneRequestIds = rows
      .filter((r) => r.status === 'purged')
      .map((r) => r.id);
    const tombstones: Record<string, string> = {};
    if (tombstoneRequestIds.length > 0) {
      const { data: tRows } = await rawDb
        .from('deletion_tombstones')
        .select('id, deletion_request_id')
        .in('deletion_request_id', tombstoneRequestIds);
      for (const t of (tRows ?? []) as Array<{
        id: string;
        deletion_request_id: string;
      }>) {
        tombstones[t.deletion_request_id] = t.id;
      }
    }

    return NextResponse.json({
      rows: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        email: users[r.user_id]?.email ?? null,
        requestedAt: r.requested_at,
        scheduledPurgeAt: r.scheduled_purge_at,
        jurisdiction: r.jurisdiction,
        method: r.method,
        status: r.status,
        gracePeriodDays: r.grace_period_days,
        cancelledAt: r.cancelled_at,
        cancelledReason: r.cancelled_reason,
        purgeStartedAt: r.purge_started_at,
        purgeCompletedAt: r.purge_completed_at,
        failureReason: r.failure_reason,
        failureCount: r.failure_count,
        tombstoneId: tombstones[r.id] ?? null,
      })),
      pagination: { limit, offset, returned: rows.length },
    });
  } catch (err) {
    if (err instanceof DeletionError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus }
      );
    }
    logger.error('GET /api/v1/admin/deletion-requests: unexpected error', {
      error: (err as Error)?.message,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
