/**
 * /api/v1/admin/config/[key]
 *
 *   GET   — current row + last 20 history entries + registry metadata
 *           (schema + default payload for the admin form).
 *   PUT   — upsert a new payload. Zod-validates against the registered
 *           schema; rejects if invalid. Writes change_reason to the row,
 *           trigger appends to system_config_history.
 *   DELETE — removes the row (history trigger captures DELETE). Equivalent
 *           to "revert to hardcoded DEFAULT" — loader will then return DEFAULT.
 *
 * Auth: requireAdmin (institutional_pd or super_admin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/apiAuth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRegistryEntry } from '@/services/config/registry';
import { invalidateConfigCache } from '@/services/config/configLoader';
import { configEnvelopeMetadataSchema } from '@/services/config/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY_PATTERN = /^[a-z][a-z0-9_]*_v[0-9]+$/;

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { key } = await ctx.params;
  if (!KEY_PATTERN.test(key)) {
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

  const registry = getRegistryEntry(key);

  return NextResponse.json({
    config:   current ?? null,
    history:  history ?? [],
    registry: registry
      ? {
          key:      registry.key,
          label:    registry.label,
          category: registry.category,
          summary:  registry.summary,
          default:  registry.default,
        }
      : null,
  });
}

// ── PUT (upsert) ───────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { key } = await ctx.params;
  if (!KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: 'Invalid config_key format.' }, { status: 400 });
  }

  const registry = getRegistryEntry(key);
  if (!registry) {
    return NextResponse.json(
      { error: `Config key "${key}" is not registered in code. Add a schema to services/config/registry.ts before editing.` },
      { status: 404 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // Validate envelope fields (rollout, sport_filter, enabled, change_reason).
  const envelopeParse = configEnvelopeMetadataSchema.safeParse({
    config_key:         key,
    schema_version:     body.schema_version ?? 1,
    rollout_percentage: body.rollout_percentage ?? 100,
    sport_filter:       body.sport_filter ?? null,
    enabled:            body.enabled ?? true,
    change_reason:      body.change_reason,
  });
  if (!envelopeParse.success) {
    return NextResponse.json(
      { error: 'Envelope validation failed', detail: envelopeParse.error.flatten() },
      { status: 400 },
    );
  }

  // Validate payload against the domain's Zod schema.
  const payloadParse = registry.schema.safeParse(body.payload);
  if (!payloadParse.success) {
    return NextResponse.json(
      { error: `Payload failed validation against ${key} schema`, detail: payloadParse.error.flatten() },
      { status: 422 },
    );
  }

  const db = supabaseAdmin();
  const { error: upsertErr } = await (db as any)
    .from('system_config')
    .upsert(
      {
        config_key:         key,
        payload:            body.payload,
        schema_version:     envelopeParse.data.schema_version,
        rollout_percentage: envelopeParse.data.rollout_percentage,
        sport_filter:       envelopeParse.data.sport_filter,
        enabled:            envelopeParse.data.enabled,
        updated_at:         new Date().toISOString(),
        updated_by:         auth.user.id,
        change_reason:      envelopeParse.data.change_reason,
      },
      { onConflict: 'config_key' },
    );

  if (upsertErr) {
    return NextResponse.json(
      { error: 'Failed to persist config', detail: upsertErr.message },
      { status: 500 },
    );
  }

  // Hot-reload: drop the cached envelope so the next read hits DB.
  invalidateConfigCache(key);

  return NextResponse.json({ ok: true });
}

// ── DELETE (revert to DEFAULT) ─────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { key } = await ctx.params;
  if (!KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: 'Invalid config_key format.' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await (db as any).from('system_config').delete().eq('config_key', key);
  if (error) {
    return NextResponse.json(
      { error: 'Failed to delete config', detail: error.message },
      { status: 500 },
    );
  }

  invalidateConfigCache(key);
  return NextResponse.json({ ok: true });
}
