/**
 * Admin Program Rules API — List + Create
 *
 * GET  /api/v1/admin/program-rules — List all program rules (filter by category, enabled)
 * POST /api/v1/admin/program-rules — Create a new program rule
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { clearProgramRuleCache } from '@/services/programs/programRules';

const VALID_CATEGORIES = [
  'safety', 'development', 'recovery', 'performance',
  'injury_prevention', 'position_specific', 'load_management',
];

export async function GET(req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const url = new URL(req.url);
    const category = url.searchParams.get('category');
    const enabled = url.searchParams.get('enabled');

    let query = (db as any)
      .from('pd_program_rules')
      .select('*')
      .order('priority', { ascending: true });

    if (category) query = query.eq('category', category);
    if (enabled === 'true') query = query.eq('is_enabled', true);
    if (enabled === 'false') query = query.eq('is_enabled', false);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rules: data, count: data?.length ?? 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const body = await req.json();

    if (!body.name || !body.category || !body.conditions) {
      return NextResponse.json(
        { error: 'name, category, and conditions are required' },
        { status: 400 },
      );
    }

    if (!VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json(
        { error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 },
      );
    }

    if (!body.conditions.match || !Array.isArray(body.conditions.conditions)) {
      return NextResponse.json(
        { error: 'conditions must have { match: "all"|"any", conditions: [...] }' },
        { status: 400 },
      );
    }

    const row = {
      name:                   body.name,
      description:            body.description ?? null,
      category:               body.category,
      conditions:             body.conditions,
      priority:               body.priority ?? 100,
      mandatory_programs:     body.mandatory_programs ?? [],
      high_priority_programs: body.high_priority_programs ?? [],
      blocked_programs:       body.blocked_programs ?? [],
      prioritize_categories:  body.prioritize_categories ?? [],
      block_categories:       body.block_categories ?? [],
      load_multiplier:        body.load_multiplier ?? null,
      session_cap_minutes:    body.session_cap_minutes ?? null,
      frequency_cap:          body.frequency_cap ?? null,
      intensity_cap:          body.intensity_cap ?? null,
      ai_guidance_text:       body.ai_guidance_text ?? null,
      safety_critical:        body.safety_critical ?? false,
      sport_filter:           body.sport_filter ?? null,
      phv_filter:             body.phv_filter ?? null,
      age_band_filter:        body.age_band_filter ?? null,
      position_filter:        body.position_filter ?? null,
      is_enabled:             body.is_enabled ?? true,
      evidence_source:        body.evidence_source ?? null,
      evidence_grade:         body.evidence_grade ?? null,
    };

    const { data, error } = await (db as any)
      .from('pd_program_rules')
      .insert(row)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    clearProgramRuleCache();
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const body = await req.json();

    if (!body.rule_id) {
      return NextResponse.json({ error: 'rule_id is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = [
      'name', 'description', 'category', 'conditions', 'priority',
      'mandatory_programs', 'high_priority_programs', 'blocked_programs',
      'prioritize_categories', 'block_categories',
      'load_multiplier', 'session_cap_minutes', 'frequency_cap', 'intensity_cap',
      'ai_guidance_text', 'safety_critical',
      'sport_filter', 'phv_filter', 'age_band_filter', 'position_filter',
      'is_enabled', 'evidence_source', 'evidence_grade',
    ];

    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const { data, error } = await (db as any)
      .from('pd_program_rules')
      .update(updates)
      .eq('rule_id', body.rule_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    clearProgramRuleCache();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const url = new URL(req.url);
    const ruleId = url.searchParams.get('id');

    if (!ruleId) {
      return NextResponse.json({ error: 'id query param required' }, { status: 400 });
    }

    // Check if built-in (cannot delete)
    const { data: existing } = await (db as any)
      .from('pd_program_rules')
      .select('is_built_in')
      .eq('rule_id', ruleId)
      .single();

    if (existing?.is_built_in) {
      return NextResponse.json(
        { error: 'Cannot delete built-in rules. Disable them instead.' },
        { status: 403 },
      );
    }

    const { error } = await (db as any)
      .from('pd_program_rules')
      .delete()
      .eq('rule_id', ruleId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    clearProgramRuleCache();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
