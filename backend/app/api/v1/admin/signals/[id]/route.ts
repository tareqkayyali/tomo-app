/**
 * Admin Signals API — Update + Delete (single signal)
 *
 * PUT    /api/v1/admin/signals/:id    — Update a signal
 * DELETE /api/v1/admin/signals/:id    — Soft-delete (disable) a signal
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { clearSignalCache } from '@/services/signals';

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
      .from('pd_signals')
      .select('is_built_in')
      .eq('signal_id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Allow all field updates (built-in signals can be tuned but not disabled)
    const allowedFields = [
      'key', 'display_name', 'subtitle', 'conditions', 'priority',
      'color', 'hero_background', 'arc_opacity', 'pill_background',
      'bar_rgba', 'coaching_color', 'coaching_text', 'pill_config',
      'trigger_config', 'adapted_plan_name', 'adapted_plan_meta',
      'show_urgency_badge', 'urgency_label', 'is_enabled',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        // Built-in signals cannot be disabled
        if (existing.is_built_in && field === 'is_enabled' && body[field] === false) {
          return NextResponse.json(
            { error: 'Built-in signals cannot be disabled. You can tune thresholds, colors, and coaching text.' },
            { status: 403 },
          );
        }
        update[field] = body[field];
      }
    }

    const { data, error } = await (db as any)
      .from('pd_signals')
      .update(update)
      .eq('signal_id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    clearSignalCache();
    return NextResponse.json({ signal: data });
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

    const { data: existing } = await (db as any)
      .from('pd_signals')
      .select('is_built_in, display_name')
      .eq('signal_id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    }

    if (existing.is_built_in) {
      return NextResponse.json(
        { error: `"${existing.display_name}" is a built-in signal and cannot be deleted. You can tune its thresholds and coaching text from the edit page.` },
        { status: 403 },
      );
    }

    // Soft-delete: set is_enabled = false
    const { error } = await (db as any)
      .from('pd_signals')
      .update({ is_enabled: false, updated_at: new Date().toISOString() })
      .eq('signal_id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    clearSignalCache();
    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
