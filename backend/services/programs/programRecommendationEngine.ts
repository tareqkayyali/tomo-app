/**
 * Program Recommendation Engine
 *
 * Generates personalised multi-week training program recommendations
 * based on the player's age band, position, PHV stage, benchmark gaps,
 * and anthropometrics.
 *
 * Uses PlayerContext (from contextBuilder) — NOT PlayerMemory.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PlayerContext } from "../agents/contextBuilder";
import { getPlayerPHVStage, type PHVResult } from "./phvCalculator";
import {
  getAnthropometricModifications,
  type AnthropometricProfile,
  type LoadModification,
} from "./anthropometricLoadModifier";

// ── Types ───────────────────────────────────────────────────────────────

export interface ProgramPrescription {
  sets: number;
  reps: string;
  intensity: string;
  rpe: string;
  rest: string;
  frequency: string;
  coachingCues: string[];
}

export interface ProgramRecommendation {
  programId: string;
  name: string;
  category: string;
  type: string;
  priority: "mandatory" | "high" | "medium";
  weeklyFrequency: number;
  durationMin: number;
  prescription: ProgramPrescription;
  loadModification: LoadModification | null;
  phvWarnings: string[];
  positionNote: string;
  reason: string;
}

export interface ProgramRecommendationSet {
  mandatory: ProgramRecommendation[];
  highPriority: ProgramRecommendation[];
  technical: ProgramRecommendation[];
  injuryPrevention: ProgramRecommendation[];
  weeklyPlanSuggestion: string;
  playerProfile: {
    name: string;
    position: string;
    ageBand: string;
    phvStage: string;
    phvDetails: PHVResult | null;
  };
}

// ── Injury Prevention Categories ────────────────────────────────────────

const INJURY_PREVENTION_CATEGORIES = [
  "nordic",
  "hamstring",
  "acl_prevention",
  "ankle_stability",
  "hip_mobility",
  "groin",
];

const TECHNICAL_CATEGORIES = [
  "passing",
  "shooting",
  "dribbling",
  "first_touch",
  "crossing",
  "heading",
  "defensive",
  "goalkeeping",
  "set_piece",
  "tactical",
  "decision_making",
  "scanning",
  "combination_play",
];

// ── Main Engine ─────────────────────────────────────────────────────────

export async function generateProgramRecommendations(
  context: PlayerContext
): Promise<ProgramRecommendationSet> {
  const db = supabaseAdmin();

  const position = context.position ?? "ALL";
  const ageBand = context.ageBand ?? "SEN";

  // ── 1. Parallel data fetches ────────────────────────────────────────

  // Use (db as any) for tables not yet in generated types
  const anyDb = db as any;

  const [phvResult, matrixResult, programsResult, userResult] =
    await Promise.allSettled([
      getPlayerPHVStage(context.userId),
      anyDb
        .from("position_training_matrix")
        .select("*")
        .eq("position", position)
        .maybeSingle() as Promise<{ data: any }>,
      anyDb.from("football_training_programs").select("*") as Promise<{ data: any[] }>,
      anyDb
        .from("users")
        .select("height_cm, weight_kg, gender, position")
        .eq("id", context.userId)
        .single() as Promise<{ data: any }>,
    ]);

  const phv =
    phvResult.status === "fulfilled" ? phvResult.value : null;
  const positionMatrix: any =
    matrixResult.status === "fulfilled" ? (matrixResult.value as any).data : null;
  const allPrograms: any[] =
    programsResult.status === "fulfilled"
      ? ((programsResult.value as any).data ?? [])
      : [];
  const userProfile: any =
    userResult.status === "fulfilled" ? (userResult.value as any).data : null;

  // Also try "ALL" position matrix as fallback
  let fallbackMatrix: any = null;
  if (!positionMatrix && position !== "ALL") {
    const res = await anyDb
      .from("position_training_matrix")
      .select("*")
      .eq("position", "ALL")
      .maybeSingle();
    fallbackMatrix = res.data;
  }
  const matrix: any = positionMatrix || fallbackMatrix;

  // ── 2. Build anthropometric profile ─────────────────────────────────

  const anthropometricProfile: AnthropometricProfile = {
    heightCm: userProfile?.height_cm ?? null,
    weightKg: userProfile?.weight_kg ?? null,
    gender: userProfile?.gender ?? undefined,
  };

  // ── 3. Filter programs by position applicability ────────────────────

  const applicablePrograms = allPrograms.filter((p: any) => {
    const emphasis: string[] = p.position_emphasis ?? [];
    return (
      emphasis.length === 0 ||
      emphasis.includes("ALL") ||
      emphasis.includes(position)
    );
  });

  // ── 4. Get prescriptions for age band ───────────────────────────────

  const mandatory: ProgramRecommendation[] = [];
  const highPriority: ProgramRecommendation[] = [];
  const technical: ProgramRecommendation[] = [];
  const injuryPrevention: ProgramRecommendation[] = [];

  const mandatoryIds = new Set<string>(matrix?.mandatory_programs ?? []);
  const recommendedIds = new Set<string>(matrix?.recommended_programs ?? []);
  const gaps = context.benchmarkProfile?.gaps ?? [];
  const gapCategories = new Set(
    gaps.map((g: string) => g.toLowerCase().replace(/\s+/g, "_"))
  );

  for (const program of applicablePrograms) {
    const prescriptions = program.prescriptions as Record<string, any> | null;
    const prescription = prescriptions?.[ageBand] ?? prescriptions?.SEN ?? null;
    if (!prescription) continue;

    // PHV check
    const phvGuidance = program.phv_guidance as Record<string, any> | null;
    const phvWarnings: string[] = [];
    let skipProgram = false;

    if (phv && phv.phvStage !== "not_applicable" && phvGuidance) {
      const stageGuidance = phvGuidance[phv.phvStage];
      if (stageGuidance) {
        if (stageGuidance.contraindicated) {
          skipProgram = true;
          continue;
        }
        if (stageGuidance.warnings) {
          phvWarnings.push(...stageGuidance.warnings);
        }
        if (stageGuidance.modifiedPrescription) {
          Object.assign(prescription, stageGuidance.modifiedPrescription);
        }
      }
    }

    if (skipProgram) continue;

    // Apply anthropometric modifications
    const loadMod = getAnthropometricModifications(
      anthropometricProfile,
      program.category
    );

    // Apply PHV loading multiplier
    if (phv && phv.loadingMultiplier < 1.0) {
      loadMod.setsMultiplier *= phv.loadingMultiplier;
      loadMod.intensityMultiplier *= phv.loadingMultiplier;
    }

    const category = (program.category ?? "").toLowerCase();
    const isInjuryPrev = INJURY_PREVENTION_CATEGORIES.includes(category);
    const isTechnical =
      TECHNICAL_CATEGORIES.includes(category) || program.type === "technical";
    const isMandatory = mandatoryIds.has(program.id);
    const isRecommended = recommendedIds.has(program.id);
    const targetsGap = gapCategories.has(category);

    const priority: "mandatory" | "high" | "medium" = isMandatory
      ? "mandatory"
      : isRecommended || targetsGap
        ? "high"
        : "medium";

    const positionNote = matrix
      ? `${position} position: ${isMandatory ? "mandatory" : isRecommended ? "recommended" : "supplementary"} program`
      : "";

    const reasons: string[] = [];
    if (isMandatory) reasons.push(`Mandatory for ${position} position`);
    if (targetsGap) reasons.push(`Targets identified gap: ${category}`);
    if (isRecommended)
      reasons.push(`Recommended for ${position} position matrix`);

    const rec: ProgramRecommendation = {
      programId: program.id,
      name: program.name,
      category: program.category,
      type: program.type,
      priority,
      weeklyFrequency: parseInt(prescription.frequency) || 2,
      durationMin: program.duration_minutes ?? 30,
      prescription: {
        sets: Math.round(
          (prescription.sets ?? 3) * loadMod.setsMultiplier
        ),
        reps: prescription.reps ?? "8-12",
        intensity: prescription.intensity ?? "moderate",
        rpe: prescription.rpe ?? "6-7",
        rest: prescription.rest ?? "60-90s",
        frequency: prescription.frequency ?? "2x/week",
        coachingCues: prescription.coachingCues ?? [],
      },
      loadModification:
        loadMod.setsMultiplier !== 1.0 ||
        loadMod.intensityMultiplier !== 1.0 ||
        loadMod.heightCue ||
        loadMod.weightCue
          ? loadMod
          : null,
      phvWarnings,
      positionNote,
      reason: reasons.join(". ") || `${program.type} development program`,
    };

    if (isInjuryPrev) {
      injuryPrevention.push(rec);
    } else if (isTechnical) {
      technical.push(rec);
    } else if (priority === "mandatory") {
      mandatory.push(rec);
    } else {
      highPriority.push(rec);
    }
  }

  // Sort each bucket: mandatory first, then high, then medium
  const sortByPriority = (a: ProgramRecommendation, b: ProgramRecommendation) => {
    const order = { mandatory: 0, high: 1, medium: 2 };
    return order[a.priority] - order[b.priority];
  };
  mandatory.sort(sortByPriority);
  highPriority.sort(sortByPriority);
  technical.sort(sortByPriority);
  injuryPrevention.sort(sortByPriority);

  // ── 5. Build weekly plan suggestion ─────────────────────────────────

  const weeklyPlanSuggestion = buildWeeklyPlanSuggestion(
    position,
    ageBand,
    phv,
    mandatory,
    highPriority,
    injuryPrevention,
    matrix
  );

  return {
    mandatory,
    highPriority,
    technical,
    injuryPrevention,
    weeklyPlanSuggestion,
    playerProfile: {
      name: context.name,
      position,
      ageBand,
      phvStage: phv?.phvStage ?? "not_applicable",
      phvDetails: phv,
    },
  };
}

// ── Weekly Plan Builder ─────────────────────────────────────────────────

function buildWeeklyPlanSuggestion(
  position: string,
  ageBand: string,
  phv: PHVResult | null,
  mandatory: ProgramRecommendation[],
  highPriority: ProgramRecommendation[],
  injuryPrevention: ProgramRecommendation[],
  matrix: any
): string {
  const lines: string[] = [];

  lines.push(
    `Weekly Training Plan Suggestion — ${position} | ${ageBand}`
  );

  if (phv && phv.phvStage === "mid_phv") {
    lines.push(
      "\n--- MID-PHV ALERT: Reduced loading across all sessions. No maximal efforts. ---"
    );
  }

  const weeklyStructure = matrix?.weekly_structure;
  if (weeklyStructure) {
    lines.push(`\nRecommended structure: ${JSON.stringify(weeklyStructure)}`);
  }

  if (mandatory.length > 0) {
    lines.push("\nMandatory Programs:");
    for (const p of mandatory.slice(0, 5)) {
      lines.push(
        `  - ${p.name} (${p.prescription.frequency}) — ${p.reason}`
      );
    }
  }

  if (highPriority.length > 0) {
    lines.push("\nHigh Priority:");
    for (const p of highPriority.slice(0, 5)) {
      lines.push(
        `  - ${p.name} (${p.prescription.frequency}) — ${p.reason}`
      );
    }
  }

  if (injuryPrevention.length > 0) {
    lines.push("\nInjury Prevention (integrate into warm-ups):");
    for (const p of injuryPrevention.slice(0, 3)) {
      lines.push(`  - ${p.name}`);
    }
  }

  // Age-band specific notes
  if (ageBand === "U13" || ageBand === "U15") {
    lines.push(
      "\nYouth Note: Max 3 structured training sessions/week. Prioritize fun, variety, and movement quality."
    );
  } else if (ageBand === "SEN" || ageBand === "VET") {
    lines.push(
      "\nSenior Note: 4-5 sessions/week sustainable. Include 2 recovery days. Monitor ACWR weekly."
    );
  }

  return lines.join("\n");
}
