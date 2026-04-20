/**
 * ACWR Computation — Acute:Chronic Workload Ratio
 *
 * Uses pre-aggregated athlete_daily_load table for fast computation.
 * Reads 28 rows max per athlete (one per day) instead of scanning all session events.
 *
 * PHYSICAL-ONLY (April 2026). ATL/CTL/ACWR are computed from training_load_au
 * exclusively. Academic load is preserved on `athlete_daily_load.academic_load_au`
 * and surfaced via the Dual Load Index, `academic_load_7day`, `exam_proximity_score`,
 * and the check-in `academic_stress` field — none of which contaminate this
 * sports-science ratio.
 *
 * Rationale: the prior blend (`training + academic × 0.4`) treated 1h of study
 * as 4 AU and "School Hours 8 AM–3 PM" as ~28 AU/school-day, which swamped
 * real training load and inflated ACWR into the caution/danger/blocked zones
 * during exam weeks for athletes who weren't physically overloaded.
 *
 * Safe zone: 0.8–1.3. Above 1.5 = elevated injury risk (reference:
 * Gabbett 2016; Bowen et al. 2020). >2.0 triggers the CCRS hard-cap.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { ACWR_SAFE_LOW, ACWR_SAFE_HIGH, ACWR_DANGER_HIGH } from '../constants';

export interface ACWRResult {
  acwr: number;
  atl_7day: number;          // Acute Training Load (7-day avg)
  ctl_28day: number;         // Chronic Training Load (28-day avg)
  athletic_load_7day: number; // Raw 7-day training sum (no academic)
  injury_risk_flag: 'GREEN' | 'AMBER' | 'RED';
}

/**
 * Recompute ACWR from the athlete_daily_load pre-aggregation table.
 * Uses `training_load_au` only — academic load is intentionally excluded
 * (see file header). Updates the snapshot with ACWR, ATL, CTL, and
 * injury risk flag.
 */
export async function recomputeACWR(athleteId: string): Promise<ACWRResult> {
  const db = supabaseAdmin();

  const twentyEightDaysAgo = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);

  // Read training_load_au only. academic_load_au still lives on the row
  // for Dual Load Index / analytics consumers, but is NOT fed to ATL/CTL.
  const { data: dailyLoads } = await db
    .from('athlete_daily_load')
    .select('load_date, training_load_au')
    .eq('athlete_id', athleteId)
    .gte('load_date', twentyEightDaysAgo)
    .order('load_date', { ascending: false });

  if (!dailyLoads || dailyLoads.length === 0) {
    const result: ACWRResult = {
      acwr: 0,
      atl_7day: 0,
      ctl_28day: 0,
      athletic_load_7day: 0,
      injury_risk_flag: 'GREEN',
    };
    await writeACWRToSnapshot(athleteId, result);
    return result;
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const physicalLoad = (d: any): number => d.training_load_au || 0;

  // Acute: last 7 days
  const acuteLoads = dailyLoads.filter((d: any) => d.load_date >= sevenDaysAgo);
  const acuteSum = acuteLoads.reduce((sum: number, d: any) => sum + physicalLoad(d), 0);
  const atl = acuteSum / 7;

  // Chronic: last 28 days
  const chronicSum = dailyLoads.reduce((sum: number, d: any) => sum + physicalLoad(d), 0);
  const ctl = chronicSum / 28;

  // ACWR ratio
  const acwr = ctl > 0 ? Math.round((atl / ctl) * 100) / 100 : 0;

  // Raw 7-day physical sum (same as acuteSum now, kept for the snapshot column)
  const athleticOnly7d = acuteSum;

  // Injury risk classification
  let injuryRiskFlag: 'GREEN' | 'AMBER' | 'RED' = 'GREEN';
  if (acwr > ACWR_DANGER_HIGH) {
    injuryRiskFlag = 'RED';
  } else if (acwr > ACWR_SAFE_HIGH || acwr < ACWR_SAFE_LOW) {
    injuryRiskFlag = 'AMBER';
  }

  const result: ACWRResult = {
    acwr,
    atl_7day: Math.round(atl * 10) / 10,
    ctl_28day: Math.round(ctl * 10) / 10,
    athletic_load_7day: Math.round(athleticOnly7d * 10) / 10,
    injury_risk_flag: injuryRiskFlag,
  };

  await writeACWRToSnapshot(athleteId, result);
  return result;
}

async function writeACWRToSnapshot(athleteId: string, result: ACWRResult): Promise<void> {
  const db = supabaseAdmin();
  await db
    .from('athlete_snapshots')
    .upsert({
      athlete_id: athleteId,
      acwr: result.acwr,
      atl_7day: result.atl_7day,
      ctl_28day: result.ctl_28day,
      athletic_load_7day: result.athletic_load_7day,
      injury_risk_flag: result.injury_risk_flag,
      snapshot_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' });
}
