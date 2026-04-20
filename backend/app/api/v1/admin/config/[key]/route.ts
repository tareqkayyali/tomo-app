/**
 * GET /api/v1/admin/config/[key]
 *
 * Returns one system_config row plus the last 20 history entries so the
 * admin detail page can render a rollback-friendly audit log.
 *
 * Write (PUT/POST/DELETE) endpoints arrive in PR 2 — this PR is read-only
 * so ops can inspect the scaffold before anything live depends on it.
 *
 * Auth: requireAdmin (institutional_pd or super_admin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/apiAuth';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { key } = await ctx.params;
  if (!/^[a-z][a-z0-9_]*_v[0-9]+$/.test(key)) {
    return NextResponse.json(
      { error: 'Invalid config_key format. Expected lowercase_snake_case_v<N>.' },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  const [{ data: current, error: currentErr }, { data: history, error: historyErr }] =
    await Promise.all([
      (db as any).from('system_config').select('*').eq('config_key', key).maybeSingle(),
      (db as any)
        .from('system_config_history')
        .select('id, payload, schema_version, rollout_percentage, sport_filter, enabled, changed_at, changed_by, change_reason, operation')
        .eq('config_key', key)
        .order('changed_at', { ascending: false })
        .limit(20),
    ]);

  if (currentErr) {
    return NextResponse.json(
      { error: 'Failed to load system_config row', detail: currentErr.message },
      { status: 500 },
    );
  }
  if (historyErr) {
    return NextResponse.json(
      { error: 'Failed to load system_config history', detail: historyErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    config:  current ?? null,
    history: history ?? [],
  });
}
