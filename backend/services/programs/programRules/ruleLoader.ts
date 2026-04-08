/**
 * PD Program Rule Loader
 *
 * Loads program rules from database with in-memory caching (5-minute TTL).
 * Same pattern as PDIL protocolLoader.ts.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { PDProgramRule, ProgramRuleScopeFilter } from './types';

// ── Cache ──
let ruleCache: PDProgramRule[] | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadAllRules(): Promise<PDProgramRule[]> {
  const now = Date.now();

  if (ruleCache && (now - cacheLoadedAt) < CACHE_TTL_MS) {
    return ruleCache;
  }

  const db = supabaseAdmin();
  const { data, error } = await (db as any)
    .from('pd_program_rules')
    .select('*')
    .eq('is_enabled', true)
    .order('priority', { ascending: true });

  if (error) {
    console.error('[ProgramRules] Failed to load rules:', error.message);
    if (ruleCache) {
      console.warn('[ProgramRules] Using stale cache as fallback');
      return ruleCache;
    }
    return [];
  }

  ruleCache = ((data as Record<string, unknown>[]) || []).map(normalizeRule);
  cacheLoadedAt = now;

  return ruleCache;
}

function normalizeRule(row: Record<string, unknown>): PDProgramRule {
  return {
    rule_id:                row.rule_id as string,
    name:                   row.name as string,
    description:            (row.description as string) ?? null,
    category:               row.category as PDProgramRule['category'],
    conditions:             typeof row.conditions === 'string'
                              ? JSON.parse(row.conditions)
                              : (row.conditions as PDProgramRule['conditions']),
    priority:               (row.priority as number) ?? 100,

    mandatory_programs:     (row.mandatory_programs as string[]) ?? [],
    high_priority_programs: (row.high_priority_programs as string[]) ?? [],
    blocked_programs:       (row.blocked_programs as string[]) ?? [],
    prioritize_categories:  (row.prioritize_categories as string[]) ?? [],
    block_categories:       (row.block_categories as string[]) ?? [],

    load_multiplier:        row.load_multiplier != null ? Number(row.load_multiplier) : null,
    session_cap_minutes:    row.session_cap_minutes != null ? Number(row.session_cap_minutes) : null,
    frequency_cap:          row.frequency_cap != null ? Number(row.frequency_cap) : null,
    intensity_cap:          (row.intensity_cap as PDProgramRule['intensity_cap']) ?? null,

    ai_guidance_text:       (row.ai_guidance_text as string) ?? null,
    safety_critical:        (row.safety_critical as boolean) ?? false,

    sport_filter:           (row.sport_filter as string[]) ?? null,
    phv_filter:             (row.phv_filter as string[]) ?? null,
    age_band_filter:        (row.age_band_filter as string[]) ?? null,
    position_filter:        (row.position_filter as string[]) ?? null,

    is_built_in:            (row.is_built_in as boolean) ?? false,
    is_enabled:             (row.is_enabled as boolean) ?? true,
    version:                (row.version as number) ?? 1,

    evidence_source:        (row.evidence_source as string) ?? null,
    evidence_grade:         (row.evidence_grade as PDProgramRule['evidence_grade']) ?? null,
    created_by:             (row.created_by as string) ?? null,
    updated_by:             (row.updated_by as string) ?? null,
    created_at:             (row.created_at as string) ?? new Date().toISOString(),
    updated_at:             (row.updated_at as string) ?? new Date().toISOString(),
  };
}

function filterByScope(
  rules: PDProgramRule[],
  scope: ProgramRuleScopeFilter,
): PDProgramRule[] {
  return rules.filter(r => {
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

export async function loadActiveRules(scope: ProgramRuleScopeFilter): Promise<PDProgramRule[]> {
  const all = await loadAllRules();
  return filterByScope(all, scope);
}

export function clearProgramRuleCache(): void {
  ruleCache = null;
  cacheLoadedAt = 0;
}

export function getProgramRuleCacheStatus() {
  const now = Date.now();
  const age = ruleCache ? now - cacheLoadedAt : 0;
  return {
    cached: ruleCache !== null,
    count: ruleCache?.length ?? 0,
    age_ms: age,
    ttl_remaining_ms: ruleCache ? Math.max(0, CACHE_TTL_MS - age) : 0,
  };
}
