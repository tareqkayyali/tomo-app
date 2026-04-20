/**
 * POST /api/v1/admin/config/[key]/rollback
 *
 * One-click rollback: pick a history_id and re-upsert that snapshot as
 * the current row. Writes a new history entry tagged with the original
 * history_id so the audit trail preserves the "was rolled back" context.
 *
 * Body:
 *   { history_id: number, change_reason?: string }
 *
 * Auth: requireAdmin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/apiAuth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRegistryEntry } from '@/services/config/registry';
import { invalidateConfigCache } from '@/services/config/configLoader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY_PATTERN = /^[a-z][a-z0-9_]*_v[0-9]+$/;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { key } = await ctx.params;
  if (!KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: 'Invalid config_key format.' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const historyId = Number(body.history_id);
  if (!Number.isFinite(historyId) || historyId <= 0) {
    return NextResponse.json({ error: 'history_id (positive integer) is required.' }, { status: 400 });
  }

  const registry = getRegistryEntry(key);
  if (!registry) {
    return NextResponse.json({ error: `Unknown config_key: ${key}` }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data: historyRow, error: historyErr } = await (db as any)
    .from('system_config_history')
    .select('*')
    .eq('id', historyId)
    .eq('config_key', key)
    .maybeSingle();

  if (historyErr) {
    return NextResponse.json({ error: 'Failed to load history row', detail: historyErr.message }, { status: 500 });
  }
  if (!historyRow) {
    return NextResponse.json({ error: `No history entry ${historyId} for ${key}` }, { status: 404 });
  }

  // Re-validate the historical payload in case schema evolved between
  // when it was recorded and now. If it no longer validates, refuse the
  // rollback — ops should understand they can't restore a shape that
  // current code can't consume.
  const parse = registry.schema.safeParse(historyRow.payload);
  if (!parse.success) {
    return NextResponse.json(
      {
        error: `History entry ${historyId} payload no longer matches ${key} schema. Rolling back to it would crash readers.`,
        detail: parse.error.flatten(),
      },
      { status: 422 },
    );
  }

  const reason = body.change_reason
    ? `${body.change_reason} (rolled back from history #${historyId})`
    : `rolled back to history #${historyId}`;

  const { error: upsertErr } = await (db as any)
    .from('system_config')
    .upsert(
      {
        config_key:         key,
        payload:            historyRow.payload,
        schema_version:     historyRow.schema_version,
        rollout_percentage: historyRow.rollout_percentage,
        sport_filter:       historyRow.sport_filter,
        enabled:            historyRow.enabled,
        updated_at:         new Date().toISOString(),
        updated_by:         auth.user.id,
        change_reason:      reason,
      },
      { onConflict: 'config_key' },
    );

  if (upsertErr) {
    return NextResponse.json(
      { error: 'Failed to apply rollback', detail: upsertErr.message },
      { status: 500 },
    );
  }

  invalidateConfigCache(key);
  return NextResponse.json({ ok: true, restored_from_history_id: historyId });
}
