/**
 * Admin Protocols API — Update + Delete (single protocol)
 *
 * PUT    /api/v1/admin/protocols/:id    — Update a protocol
 * DELETE /api/v1/admin/protocols/:id    — Soft-delete (disable) a protocol
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { clearProtocolCache } from '@/services/pdil';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const db = supabaseAdmin();
    const { id } = await params;
    const body = await req.json();

    // Fetch existing to check is_built_in
    const { data: existing } = await (db as any)
      .from('pd_protocols')
      .select('is_built_in, version')
      .eq('protocol_id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Protocol not found' }, { status: 404 });
    }

    // Built-in protocols: can tune thresholds but NOT disable or delete
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      version: (existing.version ?? 1) + 1,
    };

    // Allow all field updates
    const allowedFields = [
      'name', 'description', 'category', 'conditions', 'priority',
      'load_multiplier', 'intensity_cap', 'contraindications', 'required_elements',
      'session_cap_minutes', 'blocked_rec_categories', 'mandatory_rec_categories',
      'priority_override', 'override_message', 'forced_rag_domains', 'blocked_rag_domains',
      'rag_condition_tags', 'ai_system_injection', 'safety_critical',
      'sport_filter', 'phv_filter', 'age_band_filter', 'position_filter',
      'is_enabled', 'evidence_source', 'evidence_grade',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        // Built-in protocols cannot be disabled
        if (existing.is_built_in && field === 'is_enabled' && body[field] === false) {
          return NextResponse.json(
            { error: 'Built-in safety protocols cannot be disabled. You can tune thresholds but the protocol must remain active.' },
            { status: 403 },
          );
        }
        update[field] = body[field];
      }
    }

    const { data, error } = await (db as any)
      .from('pd_protocols')
      .update(update)
      .eq('protocol_id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    clearProtocolCache();
    return NextResponse.json({ protocol: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const db = supabaseAdmin();
    const { id } = await params;

    // Check if built-in
    const { data: existing } = await (db as any)
      .from('pd_protocols')
      .select('is_built_in, name')
      .eq('protocol_id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Protocol not found' }, { status: 404 });
    }

    if (existing.is_built_in) {
      return NextResponse.json(
        { error: `"${existing.name}" is a built-in safety protocol and cannot be deleted. You can tune its thresholds from the edit page.` },
        { status: 403 },
      );
    }

    // Soft-delete: set is_enabled = false
    const { error } = await (db as any)
      .from('pd_protocols')
      .update({ is_enabled: false, updated_at: new Date().toISOString() })
      .eq('protocol_id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    clearProtocolCache();
    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
