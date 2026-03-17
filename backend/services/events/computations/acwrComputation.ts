/**
 * ACWR Computation — Acute:Chronic Workload Ratio
 *
 * Uses pre-aggregated athlete_daily_load table for fast computation.
 * Reads 28 rows max per athlete (one per day) instead of scanning all session events.
 *
 * Safe zone: 0.8–1.3. Above 1.5 = high injury risk.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { ACWR_SAFE_LOW, ACWR_SAFE_HIGH, ACWR_DANGER_HIGH } from '../constants';

export interface ACWRResult {
  acwr: number;
  atl_7day: number;          // Acute Training Load (7-day sum / 7)
  ctl_28day: number;         // Chronic Training Load (28-day sum / 28)
  athletic_load_7day: number; // Raw 7-day sum
  injury_risk_flag: 'GREEN' | 'AMBER' | 'RED';
}

/**
 * Recompute ACWR from the athlete_daily_load pre-aggregation table.
 * Updates the snapshot with ACWR, ATL, CTL, and injury risk flag.
 */
export async function recomputeACWR(athleteId: string): Promise<ACWRResult> {
  const db = supabaseAdmin();

  const twentyEightDaysAgo = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);

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

  // Acute: last 7 days
  const acuteLoads = dailyLoads.filter((d: any) => d.load_date >= sevenDaysAgo);
  const acuteSum = acuteLoads.reduce((sum: number, d: any) => sum + (d.training_load_au || 0), 0);
  const atl = acuteSum / 7;

  // Chronic: last 28 days
  const chronicSum = dailyLoads.reduce((sum: number, d: any) => sum + (d.training_load_au || 0), 0);
  const ctl = chronicSum / 28;

  // ACWR ratio
  const acwr = ctl > 0 ? Math.round((atl / ctl) * 100) / 100 : 0;

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
    athletic_load_7day: Math.round(acuteSum * 10) / 10,
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
