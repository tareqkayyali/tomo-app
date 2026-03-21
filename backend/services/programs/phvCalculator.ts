/**
 * PHV Calculator — Mirwald et al. (2002) Maturity Offset Equation
 *
 * Calculates Peak Height Velocity (PHV) stage from anthropometric measurements.
 * Used to modify training prescriptions for youth athletes undergoing growth spurts.
 *
 * Stages:
 *   pre_phv   (offset < -1.0)  → Focus on movement quality, coordination, fun
 *   mid_phv   (-1.0 to +1.0)   → Rapid growth — reduce load, avoid maximal efforts
 *   post_phv  (> +1.0)         → Gradual reintroduction of loading
 *   not_applicable (18+)        → Standard adult loading
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Types ───────────────────────────────────────────────────────────────

export interface PHVAssessment {
  standingHeightCm: number;
  sittingHeightCm: number;
  weightKg: number;
  ageDecimal: number;
  gender: "male" | "female";
}

export interface PHVResult {
  maturityOffset: number;
  phvStage: "pre_phv" | "mid_phv" | "post_phv" | "not_applicable";
  loadingMultiplier: number;
  trainingPriorities: string[];
  safetyWarnings: string[];
  trainingImplication: string;
  standingHeightCm?: number;
  sittingHeightCm?: number;
  weightKg?: number;
}

// ── Mirwald Equation ────────────────────────────────────────────────────

/**
 * Mirwald et al. (2002) maturity offset calculation.
 *
 * Male:
 *   Offset = -9.236 + 0.0002708*(Leg×SitHt) + (-0.001663)*(Age×Leg)
 *            + 0.007216*(Age×SitHt) + 0.02292*(Wt/Ht×100)
 *
 * Female:
 *   Offset = -9.376 + 0.0001882*(Leg×SitHt) + 0.0022*(Age×Leg)
 *            + 0.005841*(Age×SitHt) + (-0.002658)*(Age×Wt/Ht×100)
 *
 * Leg length = standing height - sitting height.
 * Weight/height ratio = (weight / standing height) * 100
 */
export function calculatePHV(assessment: PHVAssessment): PHVResult {
  const { standingHeightCm, sittingHeightCm, weightKg, ageDecimal, gender } =
    assessment;

  // Not applicable for adults
  if (ageDecimal >= 18) {
    return {
      maturityOffset: 99,
      phvStage: "not_applicable",
      loadingMultiplier: 1.0,
      trainingPriorities: [
        "Standard periodized training",
        "Progressive overload",
      ],
      safetyWarnings: [],
      trainingImplication:
        "Adult athlete — standard loading protocols apply. No PHV-related modifications needed.",
    };
  }

  const legLength = standingHeightCm - sittingHeightCm;
  const weightHeightRatio = (weightKg / standingHeightCm) * 100;

  let maturityOffset: number;

  if (gender === "male") {
    maturityOffset =
      -9.236 +
      0.0002708 * (legLength * sittingHeightCm) +
      -0.001663 * (ageDecimal * legLength) +
      0.007216 * (ageDecimal * sittingHeightCm) +
      0.02292 * weightHeightRatio;
  } else {
    maturityOffset =
      -9.376 +
      0.0001882 * (legLength * sittingHeightCm) +
      0.0022 * (ageDecimal * legLength) +
      0.005841 * (ageDecimal * sittingHeightCm) +
      -0.002658 * (ageDecimal * weightHeightRatio);
  }

  // Round to 2 decimal places
  maturityOffset = Math.round(maturityOffset * 100) / 100;

  // Determine stage
  return buildPHVResult(maturityOffset);
}

function buildPHVResult(maturityOffset: number): PHVResult {
  if (maturityOffset < -1.0) {
    return {
      maturityOffset,
      phvStage: "pre_phv",
      loadingMultiplier: 0.7,
      trainingPriorities: [
        "Movement quality and coordination",
        "Fundamental movement skills (FMS)",
        "Speed — neural development window",
        "Agility and change of direction",
        "Enjoyment and varied sport exposure",
      ],
      safetyWarnings: [
        "Avoid maximal strength loading (>85% 1RM)",
        "Limit repetitive impact (long-distance running)",
        "Monitor growth plate areas during resistance exercises",
      ],
      trainingImplication:
        "Pre-PHV: Prioritize movement quality, coordination, and speed development. " +
        "This is the ideal window for neural adaptations. Keep training fun and varied. " +
        "Resistance training should be bodyweight-focused with technique emphasis.",
    };
  }

  if (maturityOffset <= 1.0) {
    return {
      maturityOffset,
      phvStage: "mid_phv",
      loadingMultiplier: 0.6,
      trainingPriorities: [
        "Flexibility and mobility — critical during growth spurt",
        "Core stability and postural control",
        "Reduced plyometric volume",
        "Technique maintenance (not progression)",
        "Recovery and sleep optimization",
      ],
      safetyWarnings: [
        "NO maximal loading — risk of growth plate injury is elevated",
        "NO heavy barbell squats or deadlifts",
        "Reduce plyometric volume by 40%+",
        "Modified Nordic protocol only (partial range)",
        "Monitor for Osgood-Schlatter and Sever's disease symptoms",
        "Increased injury risk — reduced coordination during rapid growth",
        "Watch for knee/heel pain — stop immediately if present",
      ],
      trainingImplication:
        "Mid-PHV: CRITICAL GROWTH PHASE. Reduce all loading significantly. " +
        "Focus on flexibility, core stability, and maintaining technique. " +
        "No maximal efforts. This athlete is in their growth spurt — " +
        "bones are growing faster than muscles and tendons can adapt.",
    };
  }

  return {
    maturityOffset,
    phvStage: "post_phv",
    loadingMultiplier: 0.85,
    trainingPriorities: [
      "Gradual reintroduction of strength loading",
      "Hypertrophy window — muscle responds well to training",
      "Power development (force × velocity)",
      "Sport-specific conditioning",
      "Progressive plyometric loading",
    ],
    safetyWarnings: [
      "Progress load gradually — tendons still adapting",
      "Monitor training load closely (ACWR 0.8-1.3)",
      "Full range Nordic curls can resume with progression",
    ],
    trainingImplication:
      "Post-PHV: Gradual return to progressive loading. " +
      "This is an excellent window for strength and hypertrophy gains. " +
      "Introduce structured resistance training with controlled progression. " +
      "Monitor tendon adaptation — don't rush to adult loading protocols.",
  };
}

// ── Database Operations ─────────────────────────────────────────────────

/**
 * Get the latest PHV assessment for a player.
 */
export async function getPlayerPHVStage(
  userId: string
): Promise<PHVResult | null> {
  const db = supabaseAdmin();

  // Try player_phv_assessments table first (legacy)
  const { data } = await (db as any)
    .from("player_phv_assessments")
    .select(
      "maturity_offset, phv_stage, loading_multiplier, training_priorities, safety_warnings, standing_height_cm, sitting_height_cm, weight_kg"
    )
    .eq("user_id", userId)
    .order("assessment_date", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: any };

  if (data?.maturity_offset != null) {
    const result = buildPHVResult(data.maturity_offset);
    return {
      ...result,
      standingHeightCm: data.standing_height_cm,
      sittingHeightCm: data.sitting_height_cm,
      weightKg: data.weight_kg,
    };
  }

  // Fallback: read from athlete_snapshots (written by PHV_MEASUREMENT event)
  const { data: snapshot } = await (db as any)
    .from("athlete_snapshots")
    .select("phv_offset_years, phv_stage, height_cm, sitting_height_cm, weight_kg")
    .eq("athlete_id", userId)
    .maybeSingle() as { data: any };

  if (snapshot?.phv_offset_years != null) {
    const result = buildPHVResult(snapshot.phv_offset_years);
    return {
      ...result,
      standingHeightCm: snapshot.height_cm,
      sittingHeightCm: snapshot.sitting_height_cm,
      weightKg: snapshot.weight_kg,
    };
  }

  return null;
}

/**
 * Calculate PHV from measurements and store the assessment.
 */
export async function recordPHVAssessment(
  userId: string,
  assessment: PHVAssessment
): Promise<PHVResult> {
  const db = supabaseAdmin();

  const result = calculatePHV(assessment);

  await (db as any).from("player_phv_assessments").insert({
    user_id: userId,
    standing_height_cm: assessment.standingHeightCm,
    sitting_height_cm: assessment.sittingHeightCm,
    weight_kg: assessment.weightKg,
    age_decimal: assessment.ageDecimal,
    gender: assessment.gender,
    maturity_offset: result.maturityOffset,
    phv_stage: result.phvStage,
    loading_multiplier: result.loadingMultiplier,
    training_priorities: result.trainingPriorities,
    safety_warnings: result.safetyWarnings,
  });

  return result;
}
