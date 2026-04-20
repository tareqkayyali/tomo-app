/**
 * GET /api/v1/admin/config
 *
 * Lists every system_config row with metadata for the admin config index
 * page. Payload itself is trimmed — the detail endpoint returns it in full.
 *
 * Auth: requireAdmin (institutional_pd or super_admin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/apiAuth';
import { supabaseAdmin } from '@/lib/supabase/admin';

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

  return NextResponse.json({ configs: data ?? [] });
}
