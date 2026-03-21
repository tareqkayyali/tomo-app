/**
 * Program Guardrails — Deterministic rules that modify program recommendations
 * based on the athlete's current snapshot state.
 *
 * These guardrails run AFTER program selection (either hardcoded or AI) and
 * enforce safety/appropriateness rules that should never be overridden.
 *
 * The guardrails read from the athlete_snapshots table (Layer 2) which is
 * kept current by the event processor on every athlete event.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { InlineProgram, Prescription } from "./footballPrograms";

// ── Types ──

export interface SnapshotState {
  acwr: number | null;
  atl7day: number | null;
  ctl28day: number | null;
  dualLoadIndex: number | null;
  athleticLoad7day: number | null;
  academicLoad7day: number | null;
  readinessScore: number | null;
  readinessRag: string | null;
  hrvTodayMs: number | null;
  hrvBaselineMs: number | null;
  sleepQuality: number | null;
  wellness7dayAvg: number | null;
  wellnessTrend: string | null;
  injuryRiskFlag: string | null;
  phvStage: string | null;
  sessionsTotal: number | null;
  trainingAgeWeeks: number | null;
  streakDays: number | null;
  masteryScores: Record<string, number> | null;
  speedProfile: Record<string, number> | null;
  strengthBenchmarks: Record<string, number> | null;
}

export interface GuardrailResult {
  programs: InlineProgram[];
  appliedRules: string[];
  loadCap: number; // 0.0–1.0 multiplier
  blockedCategories: string[];
}

// ── Fetch Snapshot ──

export async function getSnapshotState(athleteId: string): Promise<SnapshotState | null> {
  const { data } = await (supabaseAdmin() as any)
    .from("athlete_snapshots")
    .select(
      "acwr, atl_7day, ctl_28day, dual_load_index, athletic_load_7day, " +
      "academic_load_7day, readiness_score, readiness_rag, hrv_today_ms, " +
      "hrv_baseline_ms, sleep_quality, wellness_7day_avg, wellness_trend, " +
      "injury_risk_flag, phv_stage, sessions_total, training_age_weeks, " +
      "streak_days, mastery_scores, speed_profile, strength_benchmarks"
    )
    .eq("athlete_id", athleteId)
    .maybeSingle();

  if (!data) return null;

  return {
    acwr: data.acwr,
    atl7day: data.atl_7day,
    ctl28day: data.ctl_28day,
    dualLoadIndex: data.dual_load_index,
    athleticLoad7day: data.athletic_load_7day,
    academicLoad7day: data.academic_load_7day,
    readinessScore: data.readiness_score,
    readinessRag: data.readiness_rag,
    hrvTodayMs: data.hrv_today_ms,
    hrvBaselineMs: data.hrv_baseline_ms,
    sleepQuality: data.sleep_quality,
    wellness7dayAvg: data.wellness_7day_avg,
    wellnessTrend: data.wellness_trend,
    injuryRiskFlag: data.injury_risk_flag,
    phvStage: data.phv_stage,
    sessionsTotal: data.sessions_total,
    trainingAgeWeeks: data.training_age_weeks,
    streakDays: data.streak_days,
    masteryScores: data.mastery_scores,
    speedProfile: data.speed_profile,
    strengthBenchmarks: data.strength_benchmarks,
  };
}

// ── Apply Guardrails ──

export function applyGuardrails(
  programs: InlineProgram[],
  snapshot: SnapshotState
): GuardrailResult {
  const rules: string[] = [];
  let loadCap = 1.0;
  const blockedCategories: string[] = [];

  // ── Rule 1: ACWR Load Gate ──
  if (snapshot.acwr != null) {
    if (snapshot.acwr > 1.5) {
      // DANGER zone — drastically reduce
      loadCap = Math.min(loadCap, 0.5);
      rules.push(`ACWR ${snapshot.acwr.toFixed(2)} > 1.5 (danger): load capped at 50%`);
    } else if (snapshot.acwr > 1.3) {
      // High zone — moderate reduction
      loadCap = Math.min(loadCap, 0.7);
      rules.push(`ACWR ${snapshot.acwr.toFixed(2)} > 1.3 (high): load capped at 70%`);
    } else if (snapshot.acwr < 0.6) {
      // Under-training — encourage volume
      rules.push(`ACWR ${snapshot.acwr.toFixed(2)} < 0.6: athlete under-trained, volume can increase`);
      // No cap change — allow full load
    }
  }

  // ── Rule 2: Readiness Gate ──
  if (snapshot.readinessRag === "RED") {
    loadCap = Math.min(loadCap, 0.5);
    rules.push("Readiness RED: max 50% load, skip high-intensity programs");
    blockedCategories.push("sprint", "sled", "power", "plyometric");
  } else if (snapshot.readinessRag === "AMBER") {
    loadCap = Math.min(loadCap, 0.75);
    rules.push("Readiness AMBER: max 75% load, reduce explosive work");
  }

  // ── Rule 3: HRV Suppression ──
  if (snapshot.hrvTodayMs != null && snapshot.hrvBaselineMs != null && snapshot.hrvBaselineMs > 0) {
    const hrvRatio = snapshot.hrvTodayMs / snapshot.hrvBaselineMs;
    if (hrvRatio < 0.7) {
      loadCap = Math.min(loadCap, 0.6);
      rules.push(`HRV ${Math.round(hrvRatio * 100)}% of baseline: sympathetic stress, reduce load to 60%`);
    } else if (hrvRatio < 0.85) {
      loadCap = Math.min(loadCap, 0.8);
      rules.push(`HRV ${Math.round(hrvRatio * 100)}% of baseline: slightly suppressed, reduce load to 80%`);
    }
  }

  // ── Rule 4: Sleep Quality ──
  if (snapshot.sleepQuality != null && snapshot.sleepQuality < 5) {
    loadCap = Math.min(loadCap, 0.8);
    rules.push(`Sleep quality ${snapshot.sleepQuality}/10: poor sleep, reduce volume by 20%`);
  }

  // ── Rule 5: Academic Load (Dual Load) ──
  if (snapshot.dualLoadIndex != null && snapshot.dualLoadIndex > 80) {
    loadCap = Math.min(loadCap, 0.7);
    rules.push(`Dual load index ${snapshot.dualLoadIndex}/100: high combined load, cap athletic volume at 70%`);
  } else if (snapshot.academicLoad7day != null && snapshot.academicLoad7day > 70) {
    loadCap = Math.min(loadCap, 0.8);
    rules.push(`Academic load ${snapshot.academicLoad7day}: exam period stress, reduce training to 80%`);
  }

  // ── Rule 6: Injury Risk ──
  if (snapshot.injuryRiskFlag === "high") {
    loadCap = Math.min(loadCap, 0.6);
    rules.push("Injury risk HIGH: prioritize prevention, cap load at 60%");
    // Boost injury prevention programs
  } else if (snapshot.injuryRiskFlag === "moderate") {
    loadCap = Math.min(loadCap, 0.85);
    rules.push("Injury risk moderate: include prevention in every session");
  }

  // ── Rule 7: Wellness Trend ──
  if (snapshot.wellnessTrend === "declining" && snapshot.wellness7dayAvg != null && snapshot.wellness7dayAvg < 3) {
    loadCap = Math.min(loadCap, 0.7);
    rules.push(`Wellness declining (avg ${snapshot.wellness7dayAvg.toFixed(1)}): reducing volume`);
  }

  // ── Rule 8: Training Age (Beginner Protection) ──
  if (snapshot.trainingAgeWeeks != null && snapshot.trainingAgeWeeks < 8) {
    loadCap = Math.min(loadCap, 0.7);
    rules.push(`Training age ${snapshot.trainingAgeWeeks}w: beginner, reduced volume for adaptation`);
    blockedCategories.push("power"); // No Olympic lifts for beginners
  }

  // ── Apply Rules to Programs ──

  const blockedSet = new Set(blockedCategories);
  let result = programs;

  // Filter out blocked categories
  if (blockedSet.size > 0) {
    result = result.filter((p) => {
      if (blockedSet.has(p.category)) {
        // Don't block injury prevention even if category matches
        const isInjuryPrev = ["nordic", "acl_prevention", "ankle_stability", "groin", "hip_mobility"].includes(p.category);
        return isInjuryPrev;
      }
      return true;
    });
  }

  // Apply load cap to prescriptions
  if (loadCap < 1.0) {
    result = result.map((p) => ({
      ...p,
      prescription: applyLoadCap(p.prescription, loadCap),
    }));
  }

  // Boost injury prevention priority if injury risk is flagged
  if (snapshot.injuryRiskFlag === "high" || snapshot.injuryRiskFlag === "moderate") {
    result = result.map((p) => {
      const isInjuryPrev = ["nordic", "acl_prevention", "ankle_stability", "groin", "hip_mobility"].includes(p.category);
      if (isInjuryPrev && p.priority !== "mandatory") {
        return { ...p, priority: "mandatory" as const, reason: `${p.reason}. ELEVATED: injury risk ${snapshot.injuryRiskFlag}` };
      }
      return p;
    });
  }

  // Boost mastery-weak areas
  if (snapshot.masteryScores) {
    const weakPillars = Object.entries(snapshot.masteryScores)
      .filter(([, v]) => typeof v === "number" && v < 40)
      .map(([k]) => k.toLowerCase());

    if (weakPillars.length > 0) {
      result = result.map((p) => {
        const matchesWeak = weakPillars.some((w) =>
          p.category.includes(w) || p.tags.some((t) => t.includes(w))
        );
        if (matchesWeak && p.priority === "medium") {
          return { ...p, priority: "high" as const, reason: `${p.reason}. Targets weak mastery area.` };
        }
        return p;
      });
    }
  }

  // Re-sort by priority
  const priorityOrder = { mandatory: 0, high: 1, medium: 2 };
  result.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return { programs: result, appliedRules: rules, loadCap, blockedCategories };
}

// ── Load Cap Application ──

function applyLoadCap(rx: Prescription, cap: number): Prescription {
  // Reduce sets
  const originalSets = rx.sets;
  const cappedSets = Math.max(1, Math.round(originalSets * cap));

  // Reduce RPE
  let cappedRpe = rx.rpe;
  if (cap < 0.7) {
    // Parse RPE range and reduce
    const rpeMatch = rx.rpe.match(/(\d+)(?:\s*-\s*(\d+))?/);
    if (rpeMatch) {
      const lo = parseInt(rpeMatch[1]);
      const hi = rpeMatch[2] ? parseInt(rpeMatch[2]) : lo;
      const newLo = Math.max(3, Math.round(lo * cap));
      const newHi = Math.max(newLo, Math.round(hi * cap));
      cappedRpe = newLo === newHi ? `${newLo}` : `${newLo}-${newHi}`;
    }
  }

  // Reduce frequency
  let cappedFreq = rx.frequency;
  if (cap <= 0.6) {
    const freqMatch = rx.frequency.match(/(\d+)(?:\s*-\s*(\d+))?/);
    if (freqMatch) {
      const lo = parseInt(freqMatch[1]);
      const newLo = Math.max(1, lo - 1);
      cappedFreq = `${newLo}x/week`;
    }
  }

  return {
    ...rx,
    sets: cappedSets,
    rpe: cappedRpe,
    frequency: cappedFreq,
  };
}

// ── Build Guardrail Summary for AI Prompt Injection ──

export function buildGuardrailSummary(snapshot: SnapshotState): string {
  const { appliedRules, loadCap, blockedCategories } = applyGuardrails([], snapshot);

  if (appliedRules.length === 0) return "No guardrail restrictions active — athlete is in good state.";

  const lines = [
    `LOAD CAP: ${Math.round(loadCap * 100)}% of prescribed volume`,
    "",
    "ACTIVE RULES:",
    ...appliedRules.map((r) => `  - ${r}`),
  ];

  if (blockedCategories.length > 0) {
    lines.push("", `BLOCKED CATEGORIES: ${blockedCategories.join(", ")}`);
  }

  lines.push("", "YOU MUST respect these guardrails in your program selection and prescription overrides.");

  return lines.join("\n");
}
