/**
 * Admin Protocols API — Audit Log
 *
 * GET /api/v1/admin/protocols/audit    — Query protocol activation history
 *
 * Filter by athlete_id, protocol_id, date range.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const url = new URL(req.url);

    const athleteId = url.searchParams.get('athlete_id');
    const protocolId = url.searchParams.get('protocol_id');
    const fromDate = url.searchParams.get('from');
    const toDate = url.searchParams.get('to');
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);

    let query = (db as any)
      .from('pd_protocol_audit')
      .select(`
        *,
        pd_protocols!inner (name, category, priority, safety_critical)
      `)
      .order('triggered_at', { ascending: false })
      .limit(Math.min(limit, 200));

    if (athleteId) query = query.eq('athlete_id', athleteId);
    if (protocolId) query = query.eq('protocol_id', protocolId);
    if (fromDate) query = query.gte('triggered_at', fromDate);
    if (toDate) query = query.lte('triggered_at', toDate);

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      audit_entries: data ?? [],
      count: data?.length ?? 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
