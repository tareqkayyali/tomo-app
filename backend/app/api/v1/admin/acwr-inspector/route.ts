import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ACWR_SAFE_LOW,
  ACWR_SAFE_HIGH,
  ACWR_DANGER_HIGH,
} from "@/services/events/constants";

/**
 * GET /api/v1/admin/acwr-inspector?athlete_id=UUID
 *
 * Returns the full ACWR calculation breakdown for an athlete:
 * - 28-day daily load table (training only — academic shown separately for context)
 * - 7-day acute window highlighted
 * - Intermediate sums and averages
 * - Final ACWR, ATL, CTL, risk flag
 * - Current snapshot values for comparison
 *
 * PHYSICAL-ONLY (April 2026). Mirrors `acwrComputation.ts` — the ratio is
 * computed from `training_load_au` only. `academic_load_au` is shown per-day
 * for debugging context but is NOT folded into the acute/chronic sums.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const athleteId = req.nextUrl.searchParams.get("athlete_id");
  if (!athleteId) {
    return NextResponse.json(
      { error: "athlete_id query parameter is required" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  // 1. Fetch athlete profile
  const { data: profile } = await (db as any)
    .from("users")
    .select("id, name, email, sport, position")
    .eq("id", athleteId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      { error: "Athlete not found. Check that the UUID exists in the users table." },
      { status: 404 }
    );
  }

  // 2. Fetch 28-day daily loads
  const twentyEightDaysAgo = new Date(Date.now() - 28 * 86400000)
    .toISOString()
    .slice(0, 10);

  const { data: dailyLoads } = await db
    .from("athlete_daily_load")
    .select("load_date, training_load_au, academic_load_au, session_count")
    .eq("athlete_id", athleteId)
    .gte("load_date", twentyEightDaysAgo)
    .order("load_date", { ascending: false });

  const rows = dailyLoads ?? [];

  // 3. Compute breakdown
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
    .toISOString()
    .slice(0, 10);

  const dailyBreakdown = rows.map((d: any) => {
    const training = Number(d.training_load_au) || 0;
    const academic = Number(d.academic_load_au) || 0;
    const isAcuteWindow = d.load_date >= sevenDaysAgo;

    return {
      date: d.load_date,
      training_au: Math.round(training * 10) / 10,
      academic_au: Math.round(academic * 10) / 10,
      // Kept for backward compatibility with the admin UI; ratio no longer
      // uses the blended value. Always equals training for clarity.
      combined_au: Math.round(training * 10) / 10,
      session_count: d.session_count ?? 0,
      is_acute_window: isAcuteWindow,
    };
  });

  // 4. Calculate sums — training only
  const acuteRows = dailyBreakdown.filter((d) => d.is_acute_window);
  const acuteSum = acuteRows.reduce((s, d) => s + d.training_au, 0);
  const chronicSum = dailyBreakdown.reduce((s, d) => s + d.training_au, 0);
  const trainingOnly7d = acuteSum;
  const academicOnly7d = acuteRows.reduce((s, d) => s + d.academic_au, 0);

  const atl = acuteSum / 7;
  const ctl = chronicSum / 28;
  const acwr = ctl > 0 ? Math.round((atl / ctl) * 100) / 100 : 0;

  let injuryRiskFlag: "GREEN" | "AMBER" | "RED" = "GREEN";
  if (acwr > ACWR_DANGER_HIGH) injuryRiskFlag = "RED";
  else if (acwr > ACWR_SAFE_HIGH || acwr < ACWR_SAFE_LOW)
    injuryRiskFlag = "AMBER";

  // 5. Read current snapshot for comparison
  const { data: snapshot } = await (db as any)
    .from("athlete_snapshots")
    .select(
      "acwr, atl_7day, ctl_28day, athletic_load_7day, injury_risk_flag, academic_load_7day, dual_load_index, athlete_mode, snapshot_at"
    )
    .eq("athlete_id", athleteId)
    .maybeSingle();

  return NextResponse.json({
    athlete: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      sport: profile.sport,
      position: profile.position,
    },
    computed: {
      acwr,
      atl_7day: Math.round(atl * 10) / 10,
      ctl_28day: Math.round(ctl * 10) / 10,
      athletic_load_7day: Math.round(trainingOnly7d * 10) / 10,
      academic_load_7day: Math.round(academicOnly7d * 10) / 10,
      injury_risk_flag: injuryRiskFlag,
    },
    intermediate: {
      acute_sum: Math.round(acuteSum * 10) / 10,
      chronic_sum: Math.round(chronicSum * 10) / 10,
      acute_days_with_data: acuteRows.length,
      chronic_days_with_data: dailyBreakdown.length,
      academic_weight: 0, // physical-only formula since April 2026
    },
    thresholds: {
      safe_low: ACWR_SAFE_LOW,
      safe_high: ACWR_SAFE_HIGH,
      danger_high: ACWR_DANGER_HIGH,
    },
    snapshot_current: snapshot ?? null,
    daily_breakdown: dailyBreakdown,
  });
}
