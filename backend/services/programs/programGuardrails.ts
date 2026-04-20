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
import { getRecommendationConfig } from "@/services/recommendations/recommendationConfig";
import { buildSelectColumns, mapRowToState } from "./snapshotFieldRegistry";
import { getModeDefinition, type ModeParams } from "@/services/scheduling/modeConfig";
import { ACWR_PROGRAM_GUARDRAIL_ENABLED } from "@/lib/acwrFlags";

// ── Types ──

/**
 * SnapshotState — camelCase read model for guardrail evaluation.
 * Fields are auto-mapped from athlete_snapshots via snapshotFieldRegistry.
 * When adding new columns, update SNAPSHOT_COLUMNS in snapshotFieldRegistry.ts.
 */
export interface SnapshotState {
  // Load metrics
  acwr: number | null;
  atl7day: number | null;
  ctl28day: number | null;
  dualLoadIndex: number | null;
  athleticLoad7day: number | null;
  academicLoad7day: number | null;
  // Readiness
  readinessScore: number | null;
  readinessRag: string | null;
  hrvTodayMs: number | null;
  hrvBaselineMs: number | null;
  sleepQuality: number | null;
  restingHrBpm: number | null;
  // Vitals freshness timestamps
  hrvRecordedAt: string | null;
  sleepRecordedAt: string | null;
  // Wellness
  wellness7dayAvg: number | null;
  wellnessTrend: string | null;
  // Injury & flags
  injuryRiskFlag: string | null;
  triangleRag: string | null;
  // PHV
  phvStage: string | null;
  phvOffsetYears: number | null;
  // Performance history
  sessionsTotal: number | null;
  trainingAgeWeeks: number | null;
  streakDays: number | null;
  cvCompleteness: number | null;
  coachabilityIndex: number | null;
  // JSON blobs
  masteryScores: Record<string, number> | null;
  speedProfile: Record<string, number> | null;
  strengthBenchmarks: Record<string, number> | null;
  // Allow dynamic field access for custom rules
  [key: string]: unknown;
}

export interface GuardrailResult {
  programs: InlineProgram[];
  appliedRules: string[];
  loadCap: number; // 0.0–1.0 multiplier
  blockedCategories: string[];
}

// ── Fetch Snapshot ──

export async function getSnapshotState(athleteId: string): Promise<SnapshotState | null> {
  const selectCols = buildSelectColumns();

  const { data } = await (supabaseAdmin() as any)
    .from("athlete_snapshots")
    .select(selectCols)
    .eq("athlete_id", athleteId)
    .maybeSingle();

  if (!data) return null;

  return mapRowToState(data) as SnapshotState;
}

// ── Apply Guardrails ──

export async function applyGuardrails(
  programs: InlineProgram[],
  snapshot: SnapshotState
): Promise<GuardrailResult> {
  const cfg = await getRecommendationConfig();
  const g = cfg.guardrails;
  const rules: string[] = [];
  let loadCap = 1.0;
  const blockedCategories: string[] = [];

  // ── Rule 1: ACWR Load Gate (DECOMMISSIONED April 2026) ──
  // ACWR is gated behind both (a) the CMS-managed `guardrails.acwr.enabled`
  // flag (default false) and (b) the ACWR_PROGRAM_GUARDRAIL_ENABLED env
  // override. The catastrophic-overload safety net lives in ccrsFormula
  // (ACWR > 2.0 → ccrs_recommendation='blocked') — day-to-day load capping
  // is handled by readiness RAG (Rule 2), HRV suppression (Rule 3), and
  // wellness trend (Rule 7).
  if (
    (g.acwr.enabled || ACWR_PROGRAM_GUARDRAIL_ENABLED) &&
    snapshot.acwr != null
  ) {
    if (snapshot.acwr > g.acwr.dangerThreshold) {
      loadCap = Math.min(loadCap, g.acwr.dangerCap);
      rules.push(`ACWR ${snapshot.acwr.toFixed(2)} > ${g.acwr.dangerThreshold} (danger): load capped at ${Math.round(g.acwr.dangerCap * 100)}%`);
    } else if (snapshot.acwr > g.acwr.highThreshold) {
      loadCap = Math.min(loadCap, g.acwr.highCap);
      rules.push(`ACWR ${snapshot.acwr.toFixed(2)} > ${g.acwr.highThreshold} (high): load capped at ${Math.round(g.acwr.highCap * 100)}%`);
    } else if (snapshot.acwr < g.acwr.detrainingThreshold) {
      rules.push(`ACWR ${snapshot.acwr.toFixed(2)} < ${g.acwr.detrainingThreshold}: athlete under-trained, volume can increase`);
    }
  }

  // ── Rule 2: Readiness Gate ──
  if (g.readiness.enabled) {
    if (snapshot.readinessRag === "RED") {
      loadCap = Math.min(loadCap, g.readiness.redCap);
      rules.push(`Readiness RED: max ${Math.round(g.readiness.redCap * 100)}% load, skip high-intensity programs`);
      blockedCategories.push(...g.readiness.redBlockedCategories);
    } else if (snapshot.readinessRag === "AMBER") {
      loadCap = Math.min(loadCap, g.readiness.amberCap);
      rules.push(`Readiness AMBER: max ${Math.round(g.readiness.amberCap * 100)}% load, reduce explosive work`);
    }
  }

  // ── Rule 3: HRV Suppression (skip if stale >24h) ──
  if (g.hrv.enabled && snapshot.hrvTodayMs != null && snapshot.hrvBaselineMs != null && snapshot.hrvBaselineMs > 0) {
    const hrvAgeHours = snapshot.hrvRecordedAt
      ? (Date.now() - new Date(snapshot.hrvRecordedAt as string).getTime()) / 3600000
      : Infinity;

    if (hrvAgeHours > 24) {
      rules.push(`HRV data is ${Math.round(hrvAgeHours / 24)}d old — skipping HRV-based load adjustment`);
    } else {
      const hrvRatio = snapshot.hrvTodayMs / snapshot.hrvBaselineMs;
      if (hrvRatio < g.hrv.suppressedRatio) {
        loadCap = Math.min(loadCap, g.hrv.suppressedCap);
        rules.push(`HRV ${Math.round(hrvRatio * 100)}% of baseline: sympathetic stress, reduce load to ${Math.round(g.hrv.suppressedCap * 100)}%`);
      } else if (hrvRatio < g.hrv.mildRatio) {
        loadCap = Math.min(loadCap, g.hrv.mildCap);
        rules.push(`HRV ${Math.round(hrvRatio * 100)}% of baseline: slightly suppressed, reduce load to ${Math.round(g.hrv.mildCap * 100)}%`);
      }
    }
  }

  // ── Rule 4: Sleep Quality (skip if stale >24h) ──
  if (g.sleep.enabled && snapshot.sleepQuality != null && snapshot.sleepQuality < g.sleep.poorThreshold) {
    const sleepAgeHours = snapshot.sleepRecordedAt
      ? (Date.now() - new Date(snapshot.sleepRecordedAt as string).getTime()) / 3600000
      : Infinity;

    if (sleepAgeHours > 24) {
      rules.push(`Sleep data is ${Math.round(sleepAgeHours / 24)}d old — skipping sleep-based load adjustment`);
    } else {
      loadCap = Math.min(loadCap, g.sleep.poorCap);
      rules.push(`Sleep quality ${snapshot.sleepQuality}/10: poor sleep, reduce volume by ${Math.round((1 - g.sleep.poorCap) * 100)}%`);
    }
  }

  // ── Rule 5: Dual Load / Academic Load ──
  if (g.dualLoad.enabled && snapshot.dualLoadIndex != null && snapshot.dualLoadIndex > g.dualLoad.criticalThreshold) {
    loadCap = Math.min(loadCap, g.dualLoad.cap);
    rules.push(`Dual load index ${snapshot.dualLoadIndex}/100: high combined load, cap athletic volume at ${Math.round(g.dualLoad.cap * 100)}%`);
  } else if (g.academicLoad.enabled && snapshot.academicLoad7day != null && snapshot.academicLoad7day > g.academicLoad.highThreshold) {
    loadCap = Math.min(loadCap, g.academicLoad.cap);
    rules.push(`Academic load ${snapshot.academicLoad7day}: exam period stress, reduce training to ${Math.round(g.academicLoad.cap * 100)}%`);
  }

  // ── Rule 6: Injury Risk ──
  if (g.injuryRisk.enabled) {
    if (snapshot.injuryRiskFlag === "high") {
      loadCap = Math.min(loadCap, g.injuryRisk.highCap);
      rules.push(`Injury risk HIGH: prioritize prevention, cap load at ${Math.round(g.injuryRisk.highCap * 100)}%`);
    } else if (snapshot.injuryRiskFlag === "moderate") {
      loadCap = Math.min(loadCap, g.injuryRisk.moderateCap);
      rules.push("Injury risk moderate: include prevention in every session");
    }
  }

  // ── Rule 7: Wellness Trend ──
  if (g.wellness.enabled && snapshot.wellnessTrend === "declining" && snapshot.wellness7dayAvg != null && snapshot.wellness7dayAvg < g.wellness.decliningAvgThreshold) {
    loadCap = Math.min(loadCap, g.wellness.cap);
    rules.push(`Wellness declining (avg ${snapshot.wellness7dayAvg.toFixed(1)}): reducing volume`);
  }

  // ── Rule 8: Training Age (Beginner Protection) ──
  if (g.trainingAge.enabled && snapshot.trainingAgeWeeks != null && snapshot.trainingAgeWeeks < g.trainingAge.beginnerWeeks) {
    loadCap = Math.min(loadCap, g.trainingAge.cap);
    rules.push(`Training age ${snapshot.trainingAgeWeeks}w: beginner, reduced volume for adaptation`);
    blockedCategories.push(...g.trainingAge.blockedCategories);
  }

  // ── Rule 9: Athlete Mode Load Cap ──
  // CMS-managed mode params override load caps (e.g. rest mode caps at 50%, study caps at 70%)
  const athleteMode = (snapshot as any).athleteMode ?? (snapshot as any).athlete_mode ?? null;
  if (athleteMode && typeof athleteMode === 'string') {
    try {
      const modeDef = await getModeDefinition(athleteMode);
      if (modeDef?.params) {
        const mp = modeDef.params;
        // Apply mode-specific load cap multiplier
        if (mp.loadCapMultiplier < 1.0) {
          loadCap = Math.min(loadCap, mp.loadCapMultiplier);
          rules.push(`Mode "${athleteMode}": load capped at ${Math.round(mp.loadCapMultiplier * 100)}%`);
        }
        // Rest mode blocks high-intensity categories
        if (athleteMode === 'rest') {
          const restBlocked = ['plyometric', 'speed', 'explosive', 'match_prep'];
          blockedCategories.push(...restBlocked);
          rules.push(`Mode "rest": blocking high-intensity categories (${restBlocked.join(', ')})`);
        }
        // Drop personal dev programs if mode says so
        if (mp.dropPersonalDev) {
          blockedCategories.push('personal_dev', 'mental_skills');
          rules.push(`Mode "${athleteMode}": dropping personal development categories`);
        }
      }
    } catch {
      // Graceful degradation — if mode lookup fails, skip rule 9
    }
  }

  // ── Custom Attributes (legacy) ──
  for (const attr of cfg.customAttributes) {
    if (!attr.enabled || !attr.fieldPath) continue;
    const val = getNestedValue(snapshot, attr.fieldPath);
    if (val != null && typeof val === "number" && val > attr.threshold) {
      if (attr.action === "reduce_load") {
        const cap = parseFloat(attr.actionValue) || 0.8;
        loadCap = Math.min(loadCap, cap);
        rules.push(`Custom "${attr.name}": ${attr.fieldPath}=${val} > ${attr.threshold}, load capped at ${Math.round(cap * 100)}%`);
      } else if (attr.action === "block_category") {
        blockedCategories.push(attr.actionValue);
        rules.push(`Custom "${attr.name}": blocking category "${attr.actionValue}"`);
      } else if (attr.action === "boost_priority") {
        rules.push(`Custom "${attr.name}": boosting priority for "${attr.actionValue}"`);
      }
    }
  }

  // ── Visual Rules (from Rule Builder UI) ──
  if (cfg.rules && cfg.rules.length > 0) {
    // Only execute custom (non-builtIn) rules here — builtIn rules are
    // already handled by the hardcoded logic above for backward compat.
    const customVisualRules = cfg.rules.filter((r) => !r.builtIn);
    if (customVisualRules.length > 0) {
      const ruleResult = executeRules(snapshot, customVisualRules);
      loadCap = Math.min(loadCap, ruleResult.loadCap);
      blockedCategories.push(...ruleResult.blockedCategories);
      rules.push(...ruleResult.appliedRules);
    }
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
  if (g.masteryBoost.enabled && snapshot.masteryScores) {
    const weakPillars = Object.entries(snapshot.masteryScores)
      .filter(([, v]) => typeof v === "number" && v < g.masteryBoost.weakThreshold)
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

export async function buildGuardrailSummary(snapshot: SnapshotState): Promise<string> {
  const { appliedRules, loadCap, blockedCategories } = await applyGuardrails([], snapshot);

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

// ── Nested value accessor for custom attributes ──

function getNestedValue(obj: any, path: string): unknown {
  return path.split(".").reduce((curr: any, key) => curr?.[key], obj);
}

// ── Visual Rule Engine ──

import type { Rule, RuleCondition } from "@/services/recommendations/recommendationConfig";

/**
 * Resolve a field value from the snapshot, including derived fields.
 */
function resolveField(snapshot: SnapshotState, field: string): unknown {
  if (field === "hrvRatio") {
    if (snapshot.hrvTodayMs != null && snapshot.hrvBaselineMs != null && snapshot.hrvBaselineMs > 0) {
      return snapshot.hrvTodayMs / snapshot.hrvBaselineMs;
    }
    return null;
  }
  return (snapshot as any)[field] ?? null;
}

/**
 * Evaluate a single condition against a resolved value.
 */
function evalCondition(val: unknown, cond: RuleCondition): boolean {
  if (val == null) return false;

  const condVal = cond.value;

  // Numeric comparison
  if (typeof val === "number") {
    const numTarget = typeof condVal === "number" ? condVal : parseFloat(String(condVal));
    if (isNaN(numTarget)) return false;
    switch (cond.operator) {
      case ">": return val > numTarget;
      case ">=": return val >= numTarget;
      case "<": return val < numTarget;
      case "<=": return val <= numTarget;
      case "=": return val === numTarget;
      case "!=": return val !== numTarget;
      default: return false;
    }
  }

  // String comparison
  const strVal = String(val).toLowerCase();
  const strTarget = String(condVal).toLowerCase();
  switch (cond.operator) {
    case "=": return strVal === strTarget;
    case "!=": return strVal !== strTarget;
    default: return false;
  }
}

/**
 * Execute all enabled rules against a snapshot.
 * Returns the same GuardrailResult shape for compatibility.
 */
export function executeRules(
  snapshot: SnapshotState,
  rules: Rule[]
): { loadCap: number; blockedCategories: string[]; appliedRules: string[] } {
  let loadCap = 1.0;
  const blockedCategories: string[] = [];
  const appliedRules: string[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    // Evaluate all conditions (AND logic)
    const allPass = rule.conditions.every((cond) => {
      const val = resolveField(snapshot, cond.field);
      return evalCondition(val, cond);
    });

    if (!allPass) continue;

    // Execute actions
    for (const action of rule.actions) {
      switch (action.type) {
        case "reduce_load": {
          const cap = parseFloat(action.value) / 100;
          if (!isNaN(cap) && cap > 0 && cap <= 1) {
            loadCap = Math.min(loadCap, cap);
          }
          break;
        }
        case "block_category":
          if (action.value) blockedCategories.push(action.value);
          break;
        case "boost_priority":
          // Handled at program selection level
          break;
        case "log":
          if (action.value) appliedRules.push(action.value);
          break;
      }
    }

    // If no log action was present, auto-generate one
    if (!rule.actions.some((a) => a.type === "log")) {
      appliedRules.push(`Rule "${rule.name}" triggered`);
    }
  }

  return { loadCap, blockedCategories, appliedRules };
}
