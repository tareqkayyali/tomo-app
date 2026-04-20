/**
 * GET /api/v1/admin/config
 *
 * Returns the registry-defined list of domains, merged with any DB
 * override rows. A domain missing a row means the hardcoded DEFAULT is
 * serving traffic — that's an explicit state in the UI, not an oversight.
 *
 * Auth: requireAdmin (institutional_pd or super_admin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/apiAuth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { CONFIG_REGISTRY } from '@/services/config/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const db = supabaseAdmin();
  const { data, error } = await (db as any)
    .from('system_config')
    .select('config_key, schema_version, rollout_percentage, sport_filter, enabled, updated_at, updated_by, change_reason')
    .order('config_key', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: 'Failed to load system_config index', detail: error.message },
      { status: 500 },
    );
  }

  const rowsByKey = new Map<string, any>(
    (data ?? []).map((r: any) => [r.config_key, r]),
  );

  // Registry-defined domains, merged with their DB row (if any).
  const merged = CONFIG_REGISTRY.map((entry) => {
    const row = rowsByKey.get(entry.key);
    return {
      config_key:         entry.key,
      label:              entry.label,
      category:           entry.category,
      summary:            entry.summary,
      schema_version:     row?.schema_version ?? 1,
      rollout_percentage: row?.rollout_percentage ?? null,
      sport_filter:       row?.sport_filter ?? null,
      enabled:            row?.enabled ?? null,
      updated_at:         row?.updated_at ?? null,
      updated_by:         row?.updated_by ?? null,
      change_reason:      row?.change_reason ?? null,
      has_row:            row != null,
    };
  });

  // Flag any DB row whose key is not in the registry — usually means
  // code has dropped a consumer and the row should be retired.
  const orphans = (data ?? [])
    .filter((r: any) => !CONFIG_REGISTRY.some((e) => e.key === r.config_key))
    .map((r: any) => ({
      ...r,
      label:    r.config_key,
      category: 'unknown' as const,
      summary:  'Orphan row — no schema registered in code. Safe to delete or archive.',
      has_row:  true,
    }));

  return NextResponse.json({ configs: [...merged, ...orphans] });
}
