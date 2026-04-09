/**
 * Planning Protocol Selector — Cached CMS reader + snapshot evaluator.
 *
 * Selects applicable planning protocols based on current athlete snapshot state.
 * Cache follows the module-level variable + timestamp TTL pattern.
 *
 * Zero DB access in the selector itself — protocols are fetched from cache.
 * The cache loader is the only DB-touching function.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanningProtocol {
  id: string;
  name: string;
  description: string | null;
  severity: 'MANDATORY' | 'ADVISORY' | 'INFO';
  category: string;
  trigger_conditions: {
    match: 'all' | 'any';
    conditions: Array<{
      field: string;
      operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in';
      value: unknown;
    }>;
  };
  actions: Record<string, unknown>;
  scientific_basis: string | null;
  sport_filter: string[] | null;
  is_enabled: boolean;
}

export interface ProtocolSelectionResult {
  applicable: PlanningProtocol[];
  mandatory: PlanningProtocol[];
  advisory: PlanningProtocol[];
  info: PlanningProtocol[];
  protocol_ids: string[];
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let cachedProtocols: PlanningProtocol[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function clearPlanningProtocolCache(): void {
  cachedProtocols = null;
  cachedAt = 0;
}

async function loadProtocols(): Promise<PlanningProtocol[]> {
  const now = Date.now();
  if (cachedProtocols && now - cachedAt < CACHE_TTL_MS) {
    return cachedProtocols;
  }

  const db = supabaseAdmin();
  // planning_protocols is a new table from migration 036 — cast to bypass generated types until regen
  const { data, error } = await (db as any)
    .from('planning_protocols')
    .select('*')
    .eq('is_enabled', true);

  if (error) {
    logger.error('Failed to load planning protocols', { error: error.message });
    return cachedProtocols ?? [];
  }

  cachedProtocols = (data ?? []) as PlanningProtocol[];
  cachedAt = now;
  return cachedProtocols;
}

// ---------------------------------------------------------------------------
// Condition Evaluator (pure function)
// ---------------------------------------------------------------------------

function evaluateCondition(
  snapshot: Record<string, unknown>,
  condition: PlanningProtocol['trigger_conditions']['conditions'][0]
): boolean {
  const fieldValue = snapshot[condition.field];
  if (fieldValue === null || fieldValue === undefined) return false;

  switch (condition.operator) {
    case 'eq': return fieldValue === condition.value;
    case 'neq': return fieldValue !== condition.value;
    case 'gt': return (fieldValue as number) > (condition.value as number);
    case 'gte': return (fieldValue as number) >= (condition.value as number);
    case 'lt': return (fieldValue as number) < (condition.value as number);
    case 'lte': return (fieldValue as number) <= (condition.value as number);
    case 'in': return Array.isArray(condition.value) && (condition.value as unknown[]).includes(fieldValue);
    case 'not_in': return Array.isArray(condition.value) && !(condition.value as unknown[]).includes(fieldValue);
    default: return false;
  }
}

function evaluateProtocol(
  protocol: PlanningProtocol,
  snapshot: Record<string, unknown>
): boolean {
  const { match, conditions } = protocol.trigger_conditions;
  if (!conditions || conditions.length === 0) return false;

  if (match === 'all') {
    return conditions.every(c => evaluateCondition(snapshot, c));
  }
  return conditions.some(c => evaluateCondition(snapshot, c));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Select all applicable protocols for the given snapshot state.
 * Filters by sport if provided.
 */
export async function selectApplicableProtocols(
  snapshot: Record<string, unknown>,
  sport?: string
): Promise<ProtocolSelectionResult> {
  const allProtocols = await loadProtocols();

  // Filter by sport
  const sportFiltered = sport
    ? allProtocols.filter(p => p.sport_filter === null || p.sport_filter.includes(sport))
    : allProtocols;

  // Evaluate conditions against snapshot
  const applicable = sportFiltered.filter(p => evaluateProtocol(p, snapshot));

  return {
    applicable,
    mandatory: applicable.filter(p => p.severity === 'MANDATORY'),
    advisory: applicable.filter(p => p.severity === 'ADVISORY'),
    info: applicable.filter(p => p.severity === 'INFO'),
    protocol_ids: applicable.map(p => p.id),
  };
}
