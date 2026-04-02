/**
 * ACWR Computation — Acute:Chronic Workload Ratio
 *
 * Uses pre-aggregated athlete_daily_load table for fast computation.
 * Reads 28 rows max per athlete (one per day) instead of scanning all session events.
 *
 * Combined load = training_load_au + (academic_load_au × ACADEMIC_WEIGHT)
 * Academic stress contributes 40% of its AU value to total athlete load.
 * This reflects that study/exams add to total stress but at lower physical impact.
 *
 * Safe zone: 0.8–1.3. Above 1.5 = high injury risk.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { ACWR_SAFE_LOW, ACWR_SAFE_HIGH, ACWR_DANGER_HIGH } from '../constants';

/**
 * Academic load weight factor for ACWR.
 * 1 hour study = 10 AU × 0.4 = 4 AU towards ACWR.
 * Training load always counts at full weight (1.0).
 */
const ACADEMIC_WEIGHT = 0.4;

export interface ACWRResult {
  acwr: number;
  atl_7day: number;          // Acute Training Load (7-day avg)
  ctl_28day: number;         // Chronic Training Load (28-day avg)
  athletic_load_7day: number; // Raw 7-day training sum (no academic)
  injury_risk_flag: 'GREEN' | 'AMBER' | 'RED';
}

/**
 * Recompute ACWR from the athlete_daily_load pre-aggregation table.
 * Combines training load (full weight) + academic load (40% weight).
 * Updates the snapshot with ACWR, ATL, CTL, and injury risk flag.
 */
export async function recomputeACWR(athleteId: string): Promise<ACWRResult> {
  const db = supabaseAdmin();

  const twentyEightDaysAgo = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);

  // Read BOTH training and academic load columns
  const { data: dailyLoads } = await db
    .from('athlete_daily_load')
    .select('load_date, training_load_au, academic_load_au')
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

  // Combined load per day = training + (academic × weight)
  const combinedLoad = (d: any): number =>
    (d.training_load_au || 0) + (d.academic_load_au || 0) * ACADEMIC_WEIGHT;

  // Acute: last 7 days
  const acuteLoads = dailyLoads.filter((d: any) => d.load_date >= sevenDaysAgo);
  const acuteSum = acuteLoads.reduce((sum: number, d: any) => sum + combinedLoad(d), 0);
  const atl = acuteSum / 7;

  // Chronic: last 28 days
  const chronicSum = dailyLoads.reduce((sum: number, d: any) => sum + combinedLoad(d), 0);
  const ctl = chronicSum / 28;

  // ACWR ratio
  const acwr = ctl > 0 ? Math.round((atl / ctl) * 100) / 100 : 0;

  // Raw athletic-only sum (for display purposes)
  const athleticOnly7d = acuteLoads.reduce((sum: number, d: any) => sum + (d.training_load_au || 0), 0);

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
