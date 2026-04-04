/**
 * Dual-Load Adaptation Engine (DLAE) — wraps the existing dual load computation
 * with period detection and training intensity recommendations.
 *
 * Reads from athlete_snapshots (dual_load_index, academic/athletic loads)
 * and calendar_events (exam proximity) to determine the athlete's current
 * load period and recommend intensity adjustments.
 *
 * Zero AI cost — fully deterministic.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export type LoadPeriod = "exam" | "league" | "normal";

export interface DualLoadAdaptation {
  /** Dual Load Index: 0-100 (athletic 0-50 + academic 0-50) */
  dli: number;
  /** Current period type */
  period: LoadPeriod;
  /** Training intensity modifier (0.5-1.0) */
  intensityModifier: number;
  /** Whether an exam is within 7 days */
  examProximityFlag: boolean;
  /** 7-day athletic load in AU */
  athleticLoad7day: number;
  /** 7-day academic load in AU */
  academicLoad7day: number;
  /** Human-readable recommendation for system prompt */
  recommendation: string;
}

/** DLI thresholds for intensity reduction */
const DLI_HIGH = 65;
const DLI_CRITICAL = 80;

/**
 * Get the dual-load adaptation state for an athlete.
 * Reads from snapshot (pre-computed) + calendar for exam proximity.
 */
export async function getDualLoadAdaptation(
  athleteId: string,
  timezone?: string
): Promise<DualLoadAdaptation | null> {
  const db = supabaseAdmin();

  // Read snapshot (dual load already computed by dualLoadComputation.ts)
  const { data: snapshot } = await db
    .from("athlete_snapshots")
    .select("dual_load_index, academic_load_7day, athletic_load_7day")
    .eq("athlete_id", athleteId)
    .single();

  if (!snapshot) return null;

  const dli = (snapshot.dual_load_index as number) ?? 0;
  const academicLoad = (snapshot.academic_load_7day as number) ?? 0;
  const athleticLoad = (snapshot.athletic_load_7day as number) ?? 0;

  // Check exam proximity (7 days ahead)
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400000);
  const { data: exams } = await db
    .from("calendar_events")
    .select("id")
    .eq("athlete_id", athleteId)
    .eq("event_type", "exam")
    .gte("start_time", now.toISOString())
    .lte("start_time", weekAhead.toISOString())
    .limit(1);

  const examProximityFlag = (exams?.length ?? 0) > 0;

  // Determine period
  let period: LoadPeriod = "normal";
  if (examProximityFlag || academicLoad > 200) {
    period = "exam";
  }
  // League detection: high athletic load without exam pressure
  if (!examProximityFlag && athleticLoad > 400) {
    period = "league";
  }

  // Compute intensity modifier
  let intensityModifier = 1.0;
  let recommendation = "Normal training load — proceed as planned.";

  if (dli >= DLI_CRITICAL) {
    intensityModifier = period === "exam" ? 0.5 : 0.6;
    recommendation = period === "exam"
      ? "Critical dual-load — exam period. Reduce training to recovery/movement only."
      : "Critical dual-load — prioritize recovery. Reduce volume by 40%.";
  } else if (dli >= DLI_HIGH) {
    intensityModifier = period === "exam" ? 0.65 : 0.75;
    recommendation = period === "exam"
      ? "High dual-load during exam period. Reduce intensity, keep sessions short."
      : "Elevated dual-load — reduce training volume by 25%.";
  } else if (examProximityFlag) {
    intensityModifier = 0.85;
    recommendation = "Exam approaching — slightly reduce training load to preserve cognitive energy.";
  }

  return {
    dli,
    period,
    intensityModifier,
    examProximityFlag,
    athleticLoad7day: athleticLoad,
    academicLoad7day: academicLoad,
    recommendation,
  };
}
