/**
 * Admin Signals API — List + Create
 *
 * GET  /api/v1/admin/signals          — List all signals (filter by enabled)
 * POST /api/v1/admin/signals          — Create a new signal
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { clearSignalCache } from '@/services/signals';

export async function GET(req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const url = new URL(req.url);
    const enabled = url.searchParams.get('enabled');

    let query = (db as any)
      .from('pd_signals')
      .select('*')
      .order('priority', { ascending: true });

    if (enabled === 'true') query = query.eq('is_enabled', true);
    if (enabled === 'false') query = query.eq('is_enabled', false);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ signals: data, count: data?.length ?? 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const body = await req.json();

    // Validate required fields
    if (!body.key || !body.display_name || !body.conditions) {
      return NextResponse.json(
        { error: 'key, display_name, and conditions are required' },
        { status: 400 },
      );
    }

    // Validate conditions structure
    if (!body.conditions.match || !Array.isArray(body.conditions.conditions)) {
      return NextResponse.json(
        { error: 'conditions must have { match: "all"|"any", conditions: [...] }' },
        { status: 400 },
      );
    }

    const { data, error } = await (db as any)
      .from('pd_signals')
      .insert({
        key:                  body.key,
        display_name:         body.display_name,
        subtitle:             body.subtitle ?? '',
        conditions:           body.conditions,
        priority:             body.priority ?? 50,
        color:                body.color ?? '#7a9b76',
        hero_background:      body.hero_background ?? '#101C14',
        arc_opacity:          body.arc_opacity ?? { large: 1.0, medium: 1.0, small: 1.0 },
        pill_background:      body.pill_background ?? 'rgba(122,155,118,0.12)',
        bar_rgba:             body.bar_rgba ?? 'rgba(122,155,118,0.5)',
        coaching_color:       body.coaching_color ?? '#567A5C',
        coaching_text:        body.coaching_text ?? '',
        pill_config:          body.pill_config ?? [],
        trigger_config:       body.trigger_config ?? [],
        adapted_plan_name:    body.adapted_plan_name ?? null,
        adapted_plan_meta:    body.adapted_plan_meta ?? null,
        show_urgency_badge:   body.show_urgency_badge ?? false,
        urgency_label:        body.urgency_label ?? null,
        is_built_in:          false,
        is_enabled:           body.is_enabled ?? true,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    clearSignalCache();
    return NextResponse.json({ signal: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
