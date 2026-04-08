/**
 * PD Program Rule Evaluator
 *
 * Evaluates all program rules against an athlete's current state.
 * Returns merged ProgramRuleGuidance that the AI deep program refresh
 * uses as mandatory guidelines for program selection.
 *
 * Reuses the PDIL conditionEvaluator for condition matching.
 */

import { loadActiveRules } from './ruleLoader';
import { evaluateConditions } from '../../pdil/conditionEvaluator';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { PDProgramRule, ProgramRuleScopeFilter, ProgramRuleGuidance } from './types';

const INTENSITY_ORDER: Record<string, number> = {
  rest: 0,
  light: 1,
  moderate: 2,
  full: 3,
};

/**
 * Evaluate all program rules for an athlete and return merged guidance.
 */
export async function evaluateProgramRules(
  input: {
    snapshot: Record<string, unknown>;
    todayVitals: Record<string, unknown> | null;
    upcomingEvents: any[];
    recentDailyLoad: any[];
    trigger: 'boot' | 'chat' | 'event' | 'screen' | 'test' | 'refresh';
  },
  scope: ProgramRuleScopeFilter,
  athleteId?: string,
): Promise<ProgramRuleGuidance> {
  // 1. Load rules (cached, scope-filtered)
  const rules = await loadActiveRules(scope);

  // 2. Evaluate each rule's conditions
  const triggered: { rule: PDProgramRule; values: Record<string, unknown> }[] = [];

  for (const rule of rules) {
    try {
      const result = evaluateConditions(rule.conditions, input);
      if (result.matched) {
        triggered.push({
          rule,
          values: result.values ?? {},
        });
      }
    } catch (err) {
      console.warn(`[ProgramRules] Failed to evaluate rule "${rule.name}":`, (err as Error).message);
    }
  }

  // 3. Merge all triggered rules (most restrictive wins)
  const guidance = mergeGuidance(triggered);

  // 4. Write audit log (async, non-blocking)
  if (athleteId && triggered.length > 0) {
    writeAuditLog(athleteId, triggered, input.trigger).catch(() => {});
  }

  return guidance;
}

/**
 * Merge all triggered rules into a single ProgramRuleGuidance.
 * Conflict resolution: most restrictive wins for safety.
 */
function mergeGuidance(
  triggered: { rule: PDProgramRule; values: Record<string, unknown> }[],
): ProgramRuleGuidance {
  if (triggered.length === 0) {
    return {
      activeRules: [],
      mandatoryPrograms: [],
      highPriorityPrograms: [],
      blockedPrograms: [],
      prioritizeCategories: [],
      blockCategories: [],
      loadMultiplier: 1.0,
      sessionCapMinutes: null,
      frequencyCap: null,
      intensityCap: 'full',
      aiGuidanceText: '',
      isSafetyCritical: false,
      evaluatedAt: new Date().toISOString(),
    };
  }

  const mandatorySet = new Set<string>();
  const highPrioritySet = new Set<string>();
  const blockedSet = new Set<string>();
  const prioritizeCatSet = new Set<string>();
  const blockCatSet = new Set<string>();

  let loadMultiplier = 1.0;
  let sessionCapMinutes: number | null = null;
  let frequencyCap: number | null = null;
  let intensityCap: string = 'full';
  let isSafetyCritical = false;
  const guidanceTexts: string[] = [];

  // Sort by priority for consistent ordering
  const sorted = [...triggered].sort((a, b) => a.rule.priority - b.rule.priority);

  for (const { rule } of sorted) {
    // Union of programs
    for (const p of rule.mandatory_programs) mandatorySet.add(p);
    for (const p of rule.high_priority_programs) highPrioritySet.add(p);
    for (const p of rule.blocked_programs) blockedSet.add(p);
    for (const c of rule.prioritize_categories) prioritizeCatSet.add(c);
    for (const c of rule.block_categories) blockCatSet.add(c);

    // Most restrictive load multiplier (MIN)
    if (rule.load_multiplier != null) {
      loadMultiplier = Math.min(loadMultiplier, rule.load_multiplier);
    }

    // Most restrictive session cap (MIN)
    if (rule.session_cap_minutes != null) {
      sessionCapMinutes = sessionCapMinutes != null
        ? Math.min(sessionCapMinutes, rule.session_cap_minutes)
        : rule.session_cap_minutes;
    }

    // Most restrictive frequency cap (MIN)
    if (rule.frequency_cap != null) {
      frequencyCap = frequencyCap != null
        ? Math.min(frequencyCap, rule.frequency_cap)
        : rule.frequency_cap;
    }

    // Most restrictive intensity cap
    if (rule.intensity_cap) {
      const current = INTENSITY_ORDER[intensityCap] ?? 3;
      const incoming = INTENSITY_ORDER[rule.intensity_cap] ?? 3;
      if (incoming < current) {
        intensityCap = rule.intensity_cap;
      }
    }

    // Safety-critical: OR
    if (rule.safety_critical) isSafetyCritical = true;

    // Concatenate AI guidance
    if (rule.ai_guidance_text) {
      guidanceTexts.push(`[Rule: ${rule.name} (P${rule.priority}${rule.safety_critical ? ', SAFETY' : ''})]\n${rule.ai_guidance_text}`);
    }
  }

  // Remove blocked programs from mandatory/high-priority (blocked wins)
  for (const blocked of blockedSet) {
    mandatorySet.delete(blocked);
    highPrioritySet.delete(blocked);
  }

  return {
    activeRules: sorted.map(({ rule }) => ({
      rule_id: rule.rule_id,
      name: rule.name,
      category: rule.category,
      priority: rule.priority,
      safety_critical: rule.safety_critical,
    })),
    mandatoryPrograms: [...mandatorySet],
    highPriorityPrograms: [...highPrioritySet],
    blockedPrograms: [...blockedSet],
    prioritizeCategories: [...prioritizeCatSet],
    blockCategories: [...blockCatSet],
    loadMultiplier,
    sessionCapMinutes,
    frequencyCap,
    intensityCap: intensityCap as ProgramRuleGuidance['intensityCap'],
    aiGuidanceText: guidanceTexts.join('\n\n'),
    isSafetyCritical,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Write audit log entries for all triggered rules (non-blocking).
 */
async function writeAuditLog(
  athleteId: string,
  triggered: { rule: PDProgramRule; values: Record<string, unknown> }[],
  trigger: string,
): Promise<void> {
  const db = supabaseAdmin();
  const rows = triggered.map(({ rule, values }) => ({
    athlete_id: athleteId,
    rule_id: rule.rule_id,
    condition_values: values,
    programs_mandated: rule.mandatory_programs,
    programs_blocked: rule.blocked_programs,
    categories_prioritized: rule.prioritize_categories,
    categories_blocked: rule.block_categories,
    source_trigger: trigger,
  }));

  const { error } = await (db as any)
    .from('pd_program_rule_audit')
    .insert(rows);

  if (error) {
    console.warn('[ProgramRules] Audit log write failed (non-fatal):', error.message);
  }
}
