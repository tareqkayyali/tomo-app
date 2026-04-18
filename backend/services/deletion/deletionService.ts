/**
 * Deletion service — request / cancel / status / purge orchestration.
 *
 * Sits between the HTTP layer (backend/app/api/v1/user/delete/*) and
 * the DB (deletion_requests + SQL functions from migration 064). All
 * I/O lives here; the pure planner in purgePlanner.ts has zero I/O.
 *
 * Every public function logs a structured event; no silent failures.
 * Callers get either a result or a thrown `DeletionError` with a stable
 * `code` string that the route handlers translate into HTTP status.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import {
  buildPurgePlan,
  gracePeriodFor,
  type Jurisdiction,
  type DeletionMethod,
  type PurgePlan,
} from './purgePlanner';

// The generated database.ts types haven't yet been regenerated against
// migration 064 (deletion_requests / deletion_tombstones / deletion_
// purge_log) because that requires running `supabase gen types` after
// `supabase db reset`. Until then we cast through `any` for the new
// tables — matches the existing pattern in outputAgent.ts line 1104.
// Once types are regenerated this whole indirection can be deleted.
type DbAny = { from: (t: string) => any; rpc: (f: string, a?: unknown) => any };
function db(): DbAny {
  return supabaseAdmin() as unknown as DbAny;
}

// ─── error type ────────────────────────────────────────────────────

export type DeletionErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'ALREADY_PENDING'
  | 'ALREADY_PURGED'
  | 'NOT_CANCELLABLE'
  | 'INVALID_INPUT'
  | 'INTERNAL';

export class DeletionError extends Error {
  readonly code: DeletionErrorCode;
  readonly httpStatus: number;

  constructor(code: DeletionErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.name = 'DeletionError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// ─── shape types ───────────────────────────────────────────────────

export interface DeletionRequestRow {
  id: string;
  user_id: string;
  requested_at: string;
  jurisdiction: Jurisdiction;
  grace_period_days: number;
  scheduled_purge_at: string;
  status: 'pending' | 'cancelled' | 'purging' | 'purged' | 'failed';
  method: DeletionMethod;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  cancelled_by_user_id: string | null;
  purge_started_at: string | null;
  purge_completed_at: string | null;
  failure_reason: string | null;
  failure_count: number;
  requested_by_user_id: string | null;
  reminder_7d_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeletionStatus {
  status: 'none' | DeletionRequestRow['status'];
  requestId: string | null;
  jurisdiction: Jurisdiction | null;
  requestedAt: string | null;
  scheduledPurgeAt: string | null;
  gracePeriodDays: number | null;
  daysRemaining: number | null;
  canCancel: boolean;
  method: DeletionMethod | null;
}

// ─── request deletion ──────────────────────────────────────────────

export interface RequestDeletionArgs {
  userId: string;
  jurisdiction?: Jurisdiction;
  method?: DeletionMethod;
  customGraceDays?: number;
  /**
   * For admin_forced / parent_revocation / regulator_request flows —
   * the acting principal's id. Logged on the request row for audit.
   * Omit for user_self_service (defaults to userId).
   */
  requestedByUserId?: string;
}

export async function requestDeletion(
  args: RequestDeletionArgs
): Promise<DeletionRequestRow> {
  const {
    userId,
    jurisdiction = 'GDPR',
    method = 'user_self_service',
    customGraceDays,
    requestedByUserId,
  } = args;

  if (!userId) {
    throw new DeletionError('INVALID_INPUT', 'userId required');
  }

  // Plan is computed up-front so (a) the admin preview can show counts
  // before the request is submitted, and (b) we fail fast on invalid
  // inputs (NIL sentinel etc.) before touching the DB.
  const plan = buildPurgePlan(userId, { jurisdiction, method, customGraceDays });

  const client = db();

  // Any pending request short-circuits — we treat this as idempotent
  // rather than error. Mobile clients retry on network errors, so
  // surfacing "already pending" as success avoids duplicate accounts
  // in a weird limbo state.
  const { data: existing, error: existingErr } = await client
    .from('deletion_requests')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingErr) {
    logger.error('deletionService.requestDeletion: select pending failed', {
      userId,
      error: existingErr.message,
    });
    throw new DeletionError('INTERNAL', 'failed to check existing request', 500);
  }

  if (existing) {
    logger.info('deletionService.requestDeletion: request already pending', {
      userId,
      requestId: existing.id,
    });
    return existing as DeletionRequestRow;
  }

  const requestedAt = new Date();
  const scheduledPurgeAt = new Date(
    requestedAt.getTime() + plan.gracePeriodDays * 24 * 60 * 60 * 1000
  );

  const { data: inserted, error: insertErr } = await client
    .from('deletion_requests')
    .insert({
      user_id: userId,
      jurisdiction,
      method,
      grace_period_days: plan.gracePeriodDays,
      scheduled_purge_at: scheduledPurgeAt.toISOString(),
      requested_at: requestedAt.toISOString(),
      requested_by_user_id: requestedByUserId ?? userId,
    })
    .select('*')
    .single();

  if (insertErr || !inserted) {
    logger.error('deletionService.requestDeletion: insert failed', {
      userId,
      jurisdiction,
      method,
      error: insertErr?.message,
    });
    throw new DeletionError('INTERNAL', 'failed to create deletion request', 500);
  }

  logger.info('deletionService.requestDeletion: created', {
    userId,
    requestId: (inserted as DeletionRequestRow).id,
    jurisdiction,
    method,
    gracePeriodDays: plan.gracePeriodDays,
    scheduledPurgeAt: scheduledPurgeAt.toISOString(),
    anonymiseCount: plan.counts.anonymise,
    cascadeCount: plan.counts.cascadeDelete,
  });

  return inserted as DeletionRequestRow;
}

// ─── cancel ────────────────────────────────────────────────────────

export interface CancelDeletionArgs {
  userId: string;
  reason?: string;
  cancelledByUserId?: string;
}

export async function cancelDeletion(
  args: CancelDeletionArgs
): Promise<DeletionRequestRow> {
  const { userId, reason, cancelledByUserId } = args;

  if (!userId) {
    throw new DeletionError('INVALID_INPUT', 'userId required');
  }

  const client = db();

  const { data: pending, error: pendingErr } = await client
    .from('deletion_requests')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .maybeSingle();

  if (pendingErr) {
    logger.error('deletionService.cancelDeletion: select pending failed', {
      userId,
      error: pendingErr.message,
    });
    throw new DeletionError('INTERNAL', 'failed to look up deletion request', 500);
  }

  if (!pending) {
    throw new DeletionError(
      'NOT_FOUND',
      'no pending deletion request to cancel',
      404
    );
  }

  const { data: updated, error: updErr } = await client
    .from('deletion_requests')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_reason: reason ?? null,
      cancelled_by_user_id: cancelledByUserId ?? userId,
    })
    .eq('id', (pending as DeletionRequestRow).id)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (updErr || !updated) {
    logger.error('deletionService.cancelDeletion: update failed', {
      userId,
      requestId: (pending as DeletionRequestRow).id,
      error: updErr?.message,
    });
    throw new DeletionError('INTERNAL', 'failed to cancel deletion request', 500);
  }

  logger.info('deletionService.cancelDeletion: cancelled', {
    userId,
    requestId: (updated as DeletionRequestRow).id,
    reason: reason ?? '(none)',
  });

  return updated as DeletionRequestRow;
}

// ─── status ────────────────────────────────────────────────────────

export async function getDeletionStatus(userId: string): Promise<DeletionStatus> {
  if (!userId) {
    throw new DeletionError('INVALID_INPUT', 'userId required');
  }

  const client = db();

  // Most recent non-cancelled first; fall through to any cancelled if
  // that's all we have, so the client can show "previously cancelled".
  const { data: rows, error } = await client
    .from('deletion_requests')
    .select('*')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })
    .limit(1);

  if (error) {
    logger.error('deletionService.getDeletionStatus: query failed', {
      userId,
      error: error.message,
    });
    throw new DeletionError('INTERNAL', 'failed to read deletion status', 500);
  }

  const latest = (rows?.[0] ?? null) as DeletionRequestRow | null;

  if (!latest) {
    return {
      status: 'none',
      requestId: null,
      jurisdiction: null,
      requestedAt: null,
      scheduledPurgeAt: null,
      gracePeriodDays: null,
      daysRemaining: null,
      canCancel: false,
      method: null,
    };
  }

  const daysRemaining =
    latest.status === 'pending'
      ? Math.max(
          0,
          Math.ceil(
            (new Date(latest.scheduled_purge_at).getTime() - Date.now()) /
              (24 * 60 * 60 * 1000)
          )
        )
      : null;

  return {
    status: latest.status,
    requestId: latest.id,
    jurisdiction: latest.jurisdiction,
    requestedAt: latest.requested_at,
    scheduledPurgeAt: latest.scheduled_purge_at,
    gracePeriodDays: latest.grace_period_days,
    daysRemaining,
    canCancel: latest.status === 'pending',
    method: latest.method,
  };
}

// ─── admin: force-purge now (for regulator/forensic flows) ─────────
// Backed by the SQL function tomo_purge_user() so failure semantics
// match the cron path. Admin-only — the route handler enforces.

export async function forcePurgeNow(requestId: string): Promise<{ tombstoneId: string }> {
  if (!requestId) {
    throw new DeletionError('INVALID_INPUT', 'requestId required');
  }

  const client = db();

  // tomo_purge_user returns the tombstone uuid. RPC on Supabase.
  const { data, error } = await client.rpc('tomo_purge_user', {
    p_request_id: requestId,
  });

  if (error) {
    logger.error('deletionService.forcePurgeNow: rpc failed', {
      requestId,
      error: error.message,
    });
    throw new DeletionError('INTERNAL', `purge failed: ${error.message}`, 500);
  }

  const tombstoneId = String(data ?? '');
  logger.info('deletionService.forcePurgeNow: ok', { requestId, tombstoneId });
  return { tombstoneId };
}

// ─── admin: list all requests for review surface ───────────────────

export interface ListDeletionRequestsArgs {
  status?: DeletionRequestRow['status'];
  limit?: number;
  offset?: number;
}

export async function listDeletionRequests(
  args: ListDeletionRequestsArgs = {}
): Promise<DeletionRequestRow[]> {
  const { status, limit = 50, offset = 0 } = args;
  const client = db();

  let query = client
    .from('deletion_requests')
    .select('*')
    .order('requested_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    logger.error('deletionService.listDeletionRequests: query failed', {
      error: error.message,
    });
    throw new DeletionError('INTERNAL', 'failed to list deletion requests', 500);
  }

  return (data ?? []) as DeletionRequestRow[];
}

// ─── re-exports so routes can import from one place ────────────────

export { buildPurgePlan, gracePeriodFor };
export type { PurgePlan, Jurisdiction, DeletionMethod };
