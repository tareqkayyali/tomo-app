/**
 * PD Program Rule Loader — methodology-resolver backed (Phase 7).
 *
 * Hard cutover: legacy `pd_program_rules` table is no longer read at
 * runtime. The `program_rule` directives in the live methodology
 * snapshot are the only source. The Phase 7.0a migration seeded the
 * snapshot with the equivalent of every legacy row, so behaviour is
 * preserved on flip day.
 *
 * Cache lives inside `services/instructions/resolver` (60s TTL); this
 * module just adapts the resolver output to the existing PDProgramRule
 * shape so `evaluateRules` / `applyGuardrails` don't change.
 */

import { resolveInstructions } from '@/services/instructions/resolver';
import type { PDProgramRule, ProgramRuleScopeFilter } from './types';

function payloadToRule(d: {
  id: string;
  payload: Record<string, unknown>;
  priority: number;
  sport_scope: string[];
  phv_scope: string[];
  age_scope: string[];
  position_scope: string[];
  updated_at: string | null;
}): PDProgramRule {
  const p = d.payload as Record<string, any>;
  return {
    rule_id:                d.id,
    name:                   String(p.rule_name ?? ''),
    description:            (p.description as string | null) ?? null,
    category:               (p.category as PDProgramRule['category']) ?? 'development',
    conditions:             (p.conditions as any) ?? { match: 'all', conditions: [] },
    priority:               typeof p.priority === 'number' ? p.priority : d.priority,

    mandatory_programs:     (p.mandatory_programs as string[]) ?? [],
    high_priority_programs: (p.high_priority_programs as string[]) ?? [],
    blocked_programs:       (p.blocked_programs as string[]) ?? [],
    prioritize_categories:  (p.prioritize_categories as string[]) ?? [],
    block_categories:       (p.block_categories as string[]) ?? [],

    load_multiplier:        p.load_multiplier != null ? Number(p.load_multiplier) : null,
    session_cap_minutes:    p.session_cap_minutes != null ? Number(p.session_cap_minutes) : null,
    frequency_cap:          p.frequency_cap != null ? Number(p.frequency_cap) : null,
    intensity_cap:          (p.intensity_cap as PDProgramRule['intensity_cap']) ?? null,

    ai_guidance_text:       (p.ai_guidance_text as string | null) ?? null,
    safety_critical:        Boolean(p.safety_critical),

    // Scope filters: prefer explicit payload fields, fall back to directive scope arrays.
    sport_filter:    d.sport_scope.length    ? d.sport_scope    : null,
    phv_filter:      d.phv_scope.length      ? d.phv_scope      : null,
    age_band_filter: d.age_scope.length      ? d.age_scope      : null,
    position_filter: d.position_scope.length ? d.position_scope : null,

    is_built_in:            Boolean(p.is_built_in),
    is_enabled:             p.is_enabled !== false,
    version:                typeof p.version === 'number' ? p.version : 1,

    evidence_source:        (p.evidence_source as string | null) ?? null,
    evidence_grade:         (p.evidence_grade as PDProgramRule['evidence_grade']) ?? null,
    created_by:             null,
    updated_by:             null,
    created_at:             d.updated_at ?? new Date().toISOString(),
    updated_at:             d.updated_at ?? new Date().toISOString(),
  };
}

async function loadAllRules(): Promise<PDProgramRule[]> {
  const set = await resolveInstructions({ audience: 'athlete' });
  const directives = set.byType('program_rule');
  return directives
    .filter((d) => (d.payload as any)?.is_enabled !== false)
    .map(payloadToRule);
}

export async function loadActiveRules(
  scope: ProgramRuleScopeFilter,
): Promise<PDProgramRule[]> {
  // The resolver's audience-only filter doesn't apply per-athlete scope —
  // the legacy ruleLoader filtered by sport/phv/age/position locally, and
  // the existing evaluateRules consumer expects that. Preserve the
  // contract by post-filtering here.
  const all = await loadAllRules();
  return filterByScope(all, scope);
}

function filterByScope(
  rules: PDProgramRule[],
  scope: ProgramRuleScopeFilter,
): PDProgramRule[] {
  return rules.filter((r) => {
    if (r.sport_filter && r.sport_filter.length > 0 && scope.sport) {
      if (!r.sport_filter.includes(scope.sport)) return false;
    }
    if (r.phv_filter && r.phv_filter.length > 0 && scope.phv_stage) {
      if (!r.phv_filter.includes(scope.phv_stage)) return false;
    }
    if (r.age_band_filter && r.age_band_filter.length > 0 && scope.age_band) {
      if (!r.age_band_filter.includes(scope.age_band)) return false;
    }
    if (r.position_filter && r.position_filter.length > 0 && scope.position) {
      if (!r.position_filter.includes(scope.position)) return false;
    }
    return true;
  });
}

/** Phase 7: rule cache lives inside the resolver. Kept as a no-op so
 *  callers (CMS admin pages) compile without changes. */
export function clearProgramRuleCache(): void {
  // No-op since Phase 7
}

export function getProgramRuleCacheStatus() {
  return {
    cached: false,
    count: 0,
    age_ms: 0,
    ttl_remaining_ms: 0,
  };
}
