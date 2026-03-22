/**
 * POST /api/v1/user/phv — Save PHV assessment directly
 *
 * Synchronous save to both player_phv_assessments and athlete_snapshots.
 * Bypasses the async event pipeline for immediate data consistency.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      standing_height_cm,
      sitting_height_cm,
      weight_kg,
      maturity_offset,
      phv_stage,
      date_of_birth,
      sex,
      age_decimal,
    } = body;

    if (maturity_offset == null) {
      return NextResponse.json({ error: 'maturity_offset is required' }, { status: 400 });
    }

    const db = supabaseAdmin();

    // Map detailed category to simple PRE/CIRCA/POST
    let simpleStage = phv_stage;
    if (typeof phv_stage === 'string') {
      if (phv_stage.startsWith('pre-phv')) simpleStage = 'PRE';
      else if (phv_stage === 'at-phv') simpleStage = 'CIRCA';
      else if (phv_stage.startsWith('post-phv')) simpleStage = 'POST';
    }

    // 1. Write to player_phv_assessments (legacy table — getPlayerPHVStage reads from here first)
    const { error: assessmentErr } = await (db as any).from('player_phv_assessments').insert({
      user_id: userId,
      standing_height_cm,
      sitting_height_cm,
      weight_kg,
      age_decimal,
      gender: sex,
      maturity_offset,
      phv_stage: simpleStage,
      assessment_date: new Date().toISOString().split('T')[0],
    });
    if (assessmentErr) {
      console.error('[PHV Save] player_phv_assessments insert failed:', assessmentErr);
    }

    // 2. Update athlete_snapshots (Layer 2 — immediate read model)
    const snapshotUpdate: Record<string, any> = {
      athlete_id: userId,
      snapshot_at: new Date().toISOString(),
    };
    if (standing_height_cm) snapshotUpdate.height_cm = standing_height_cm;
    if (sitting_height_cm) snapshotUpdate.sitting_height_cm = sitting_height_cm;
    if (weight_kg) snapshotUpdate.weight_kg = weight_kg;
    if (maturity_offset != null) snapshotUpdate.phv_offset_years = maturity_offset;
    if (simpleStage) snapshotUpdate.phv_stage = simpleStage;

    const { error: snapshotErr } = await (db as any)
      .from('athlete_snapshots')
      .upsert(snapshotUpdate, { onConflict: 'athlete_id' });
    if (snapshotErr) {
      console.error('[PHV Save] athlete_snapshots upsert failed:', snapshotErr);
    }

    // 3. Update user profile (DOB, gender, height, weight — no sitting_height on users table)
    const profileUpdate: Record<string, any> = {};
    if (date_of_birth) profileUpdate.date_of_birth = date_of_birth;
    if (sex) profileUpdate.gender = sex;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileErr } = await (db as any)
        .from('users')
        .update(profileUpdate)
        .eq('id', userId);
      if (profileErr) {
        console.error('[PHV Save] users profile update failed:', profileErr);
      }
    }

    return NextResponse.json({
      saved: true,
      phv_stage: simpleStage,
      maturity_offset,
      standing_height_cm,
      sitting_height_cm,
      weight_kg,
      _debug: {
        assessmentError: assessmentErr?.message ?? null,
        snapshotError: snapshotErr?.message ?? null,
        userId,
      },
    });
  } catch (err: any) {
    console.error('[PHV Save] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
