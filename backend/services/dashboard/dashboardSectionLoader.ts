/**
 * Dashboard Section Loader — Cached CMS reader + visibility evaluator.
 *
 * Loads enabled dashboard sections from DB, caches for 5 minutes.
 * Evaluates visibility conditions against athlete snapshot to produce
 * a personalized section layout per request.
 *
 * Cache follows the module-level variable + timestamp TTL pattern
 * (same as planningProtocolSelector.ts).
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardSection {
  id: string;
  section_key: string;
  display_name: string;
  component_type: string;
  sort_order: number;
  visibility: {
    match: 'all' | 'any';
    conditions: Array<{
      field: string;
      operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in';
      value: unknown;
    }>;
  } | null;
  config: Record<string, unknown>;
  coaching_text: string | null;
  sport_filter: string[] | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface ResolvedDashboardSection {
  section_key: string;
  display_name: string;
  component_type: string;
  sort_order: number;
  config: Record<string, unknown>;
  coaching_text: string | null;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let cachedSections: DashboardSection[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function clearDashboardSectionCache(): void {
  cachedSections = null;
  cachedAt = 0;
}

async function loadSections(): Promise<DashboardSection[]> {
  const now = Date.now();
  if (cachedSections && now - cachedAt < CACHE_TTL_MS) {
    return cachedSections;
  }

  const db = supabaseAdmin();
  const { data, error } = await (db as any)
    .from('dashboard_sections')
    .select('*')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true });

  if (error) {
    logger.error('Failed to load dashboard sections', { error: error.message });
    return cachedSections ?? [];
  }

  cachedSections = (data ?? []) as DashboardSection[];
  cachedAt = now;
  return cachedSections;
}

// ---------------------------------------------------------------------------
// Condition Evaluator (pure function — same logic as planningProtocolSelector)
// ---------------------------------------------------------------------------

function evaluateCondition(
  snapshot: Record<string, unknown>,
  condition: NonNullable<DashboardSection['visibility']>['conditions'][0]
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

function evaluateVisibility(
  section: DashboardSection,
  snapshot: Record<string, unknown>
): boolean {
  // NULL visibility = always visible
  if (!section.visibility) return true;

  const { match, conditions } = section.visibility;
  if (!conditions || conditions.length === 0) return true;

  if (match === 'all') {
    return conditions.every(c => evaluateCondition(snapshot, c));
  }
  return conditions.some(c => evaluateCondition(snapshot, c));
}

// ---------------------------------------------------------------------------
// Template Interpolation
// ---------------------------------------------------------------------------

/**
 * Resolve {field} placeholders in coaching_text against a flat context map.
 * Unresolved placeholders are left as-is (safe for display).
 */
function interpolateText(
  template: string,
  context: Record<string, unknown>
): string {
  return template.replace(/\{(\w+)\}/g, (match, field) => {
    const val = context[field];
    if (val === null || val === undefined) return match;
    return String(val);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the dashboard layout for a specific athlete.
 *
 * @param snapshot - Athlete's current snapshot (flat key-value from readSnapshot)
 * @param sport - Athlete's sport (for sport_filter scoping)
 * @returns Ordered array of resolved sections the athlete should see
 */
export async function resolveDashboardLayout(
  snapshot: Record<string, unknown>,
  sport?: string
): Promise<ResolvedDashboardSection[]> {
  const allSections = await loadSections();

  return allSections
    .filter(section => {
      // Sport filter: NULL = all sports, array = only these sports
      if (section.sport_filter && sport) {
        if (!section.sport_filter.includes(sport)) return false;
      }
      // Visibility condition evaluation
      return evaluateVisibility(section, snapshot);
    })
    .map(section => ({
      section_key: section.section_key,
      display_name: section.display_name,
      component_type: section.component_type,
      sort_order: section.sort_order,
      config: section.config,
      coaching_text: section.coaching_text
        ? interpolateText(section.coaching_text, snapshot)
        : null,
    }));
}

/**
 * Get all sections (admin view, no visibility filtering).
 * Used by admin panel to show the full list including disabled sections.
 */
export async function getAllSectionsAdmin(): Promise<DashboardSection[]> {
  const db = supabaseAdmin();
  const { data, error } = await (db as any)
    .from('dashboard_sections')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    logger.error('Failed to load dashboard sections for admin', { error: error.message });
    throw error;
  }

  return (data ?? []) as DashboardSection[];
}
