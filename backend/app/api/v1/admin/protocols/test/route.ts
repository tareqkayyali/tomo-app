/**
 * Admin Protocols API — Test/Simulate
 *
 * POST /api/v1/admin/protocols/test    — Evaluate all protocols against an athlete
 *
 * The Performance Director can test any protocol against any athlete
 * to see exactly which protocols fire, what conditions matched, and
 * what the final PDContext would be.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { readSnapshot } from '@/services/events/snapshot/snapshotReader';
import { evaluatePDProtocols } from '@/services/pdil';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { athlete_id } = body;

    if (!athlete_id) {
      return NextResponse.json({ error: 'athlete_id is required' }, { status: 400 });
    }

    const db = supabaseAdmin();

    // Load athlete's current state
    const snapshot = await readSnapshot(athlete_id, 'ATHLETE');
    if (!snapshot) {
      return NextResponse.json({ error: 'Athlete snapshot not found' }, { status: 404 });
    }

    // Load today's events for calendar-derived fields
    const today = new Date().toISOString().split('T')[0];
    const { data: todayEvents } = await db
      .from('calendar_events')
      .select('*')
      .eq('athlete_id', athlete_id)
      .gte('start_at', `${today}T00:00:00`)
      .lte('start_at', `${today}T23:59:59`);

    // Load upcoming events (14 days)
    const forward = new Date();
    forward.setDate(forward.getDate() + 14);
    const { data: upcomingEvents } = await db
      .from('calendar_events')
      .select('*')
      .eq('athlete_id', athlete_id)
      .gte('start_at', `${today}T00:00:00`)
      .lte('start_at', forward.toISOString());

    // Load recent daily load (28 days)
    const loadFrom = new Date();
    loadFrom.setDate(loadFrom.getDate() - 28);
    const { data: dailyLoad } = await db
      .from('athlete_daily_load')
      .select('*')
      .eq('athlete_id', athlete_id)
      .gte('load_date', loadFrom.toISOString().split('T')[0]);

    // Load today's vitals if available
    const { data: todayVitals } = await (db as any)
      .from('athlete_daily_vitals')
      .select('*')
      .eq('athlete_id', athlete_id)
      .eq('vitals_date', today)
      .single();

    // Evaluate PDIL
    const pdContext = await evaluatePDProtocols({
      snapshot: snapshot as Record<string, unknown>,
      todayVitals: todayVitals ?? null,
      upcomingEvents: [...(todayEvents ?? []), ...(upcomingEvents ?? [])] as any[],
      recentDailyLoad: (dailyLoad ?? []) as any[],
      trigger: 'test',
    });

    return NextResponse.json({
      athlete_id,
      snapshot_summary: {
        sport:            (snapshot as any).sport,
        position:         (snapshot as any).position,
        phv_stage:        (snapshot as any).phv_stage,
        acwr:             (snapshot as any).acwr,
        readiness_rag:    (snapshot as any).readiness_rag,
        readiness_score:  (snapshot as any).readiness_score,
        dual_load_index:  (snapshot as any).dual_load_index,
        injury_risk_flag: (snapshot as any).injury_risk_flag,
        wellness_7day_avg: (snapshot as any).wellness_7day_avg,
      },
      pdContext,
      protocols_evaluated: pdContext.auditTrail.length,
      protocols_fired: pdContext.activeProtocols.map(p => ({
        name:            p.name,
        category:        p.category,
        priority:        p.priority,
        safety_critical: p.safety_critical,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
