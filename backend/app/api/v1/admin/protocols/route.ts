/**
 * Admin Protocols API — List + Create
 *
 * GET  /api/v1/admin/protocols          — List all protocols (filter by category, enabled)
 * POST /api/v1/admin/protocols          — Create a new protocol
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { clearProtocolCache } from '@/services/pdil';

export async function GET(req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const url = new URL(req.url);
    const category = url.searchParams.get('category');
    const enabled = url.searchParams.get('enabled');

    let query = (db as any)
      .from('pd_protocols')
      .select('*')
      .order('priority', { ascending: true });

    if (category) query = query.eq('category', category);
    if (enabled === 'true') query = query.eq('is_enabled', true);
    if (enabled === 'false') query = query.eq('is_enabled', false);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ protocols: data, count: data?.length ?? 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const body = await req.json();

    // Validate required fields
    if (!body.name || !body.category || !body.conditions) {
      return NextResponse.json(
        { error: 'name, category, and conditions are required' },
        { status: 400 },
      );
    }

    // Validate category
    const validCategories = ['safety', 'development', 'recovery', 'performance', 'academic'];
    if (!validCategories.includes(body.category)) {
      return NextResponse.json(
        { error: `category must be one of: ${validCategories.join(', ')}` },
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
      .from('pd_protocols')
      .insert({
        name:                     body.name,
        description:              body.description ?? null,
        category:                 body.category,
        conditions:               body.conditions,
        priority:                 body.priority ?? 100,
        load_multiplier:          body.load_multiplier ?? null,
        intensity_cap:            body.intensity_cap ?? null,
        contraindications:        body.contraindications ?? null,
        required_elements:        body.required_elements ?? null,
        session_cap_minutes:      body.session_cap_minutes ?? null,
        blocked_rec_categories:   body.blocked_rec_categories ?? null,
        mandatory_rec_categories: body.mandatory_rec_categories ?? null,
        priority_override:        body.priority_override ?? null,
        override_message:         body.override_message ?? null,
        forced_rag_domains:       body.forced_rag_domains ?? null,
        blocked_rag_domains:      body.blocked_rag_domains ?? null,
        rag_condition_tags:       body.rag_condition_tags ?? null,
        ai_system_injection:      body.ai_system_injection ?? null,
        safety_critical:          body.safety_critical ?? false,
        sport_filter:             body.sport_filter ?? null,
        phv_filter:               body.phv_filter ?? null,
        age_band_filter:          body.age_band_filter ?? null,
        position_filter:          body.position_filter ?? null,
        is_built_in:              false,
        is_enabled:               body.is_enabled ?? true,
        evidence_source:          body.evidence_source ?? null,
        evidence_grade:           body.evidence_grade ?? null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Invalidate cache so the new protocol is picked up immediately
    clearProtocolCache();

    return NextResponse.json({ protocol: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
