/**
 * Dashboard Section Loader — methodology-resolver backed (Phase 7).
 *
 * Hard cutover: legacy `dashboard_sections` table is no longer read at
 * runtime. The `dashboard_section` directives in the live methodology
 * snapshot are the only source. The Phase 7.0a migration seeded the
 * snapshot with the equivalent of every legacy row, so behaviour is
 * preserved on flip day.
 *
 * Resolution flow:
 *   1. Resolve the live snapshot (60s TTL, scope-filtered).
 *   2. Filter directives matching `panel_key` (`null`/`undefined` =
 *      main dashboard, otherwise a sub-panel).
 *   3. Evaluate any *additional* visibility conditions inside
 *      `payload.config.visibility` (preserved from legacy migration).
 *   4. Return resolved sections in `sort_order`. The mobile client
 *      receives the same shape as before.
 *
 * Provenance: every resolved section carries its source directive id
 * so the boot route can log it for the Prompt Inspector.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { resolveInstructions } from '@/services/instructions/resolver';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardPanelKey = 'program' | 'metrics' | 'progress';

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
  panel_key: DashboardPanelKey | null;
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
  /** Phase 7: provenance id of the methodology directive that drove this section. */
  directive_id?: string;
}

export function clearDashboardSectionCache(): void {
  // No-op since Phase 7 — cache lives inside the resolver.
}

// ---------------------------------------------------------------------------
// Condition Evaluator
// ---------------------------------------------------------------------------

type Condition = NonNullable<DashboardSection['visibility']>['conditions'][0];

function evaluateCondition(
  snapshot: Record<string, unknown>,
  condition: Condition,
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
    case 'in':
      return Array.isArray(condition.value) && (condition.value as unknown[]).includes(fieldValue);
    case 'not_in':
      return Array.isArray(condition.value) && !(condition.value as unknown[]).includes(fieldValue);
    default: return false;
  }
}

function evaluateVisibility(
  visibility: DashboardSection['visibility'],
  snapshot: Record<string, unknown>,
): boolean {
  if (!visibility) return true;
  const { match, conditions } = visibility;
  if (!conditions || conditions.length === 0) return true;
  if (match === 'all') return conditions.every((c) => evaluateCondition(snapshot, c));
  return conditions.some((c) => evaluateCondition(snapshot, c));
}

// ---------------------------------------------------------------------------
// Template Interpolation
// ---------------------------------------------------------------------------

function interpolateText(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, field) => {
    const val = context[field];
    if (val === null || val === undefined) return match;
    return String(val);
  });
}

// ---------------------------------------------------------------------------
// Public API — resolver-backed
// ---------------------------------------------------------------------------

/**
 * Resolve the dashboard layout for a specific athlete.
 *
 * Phase 7: reads from the live methodology snapshot only. No legacy DB
 * reads. The Phase 7.0a migration seeded the snapshot with all prior
 * rows so this is behaviour-preserving on flip day.
 */
export async function resolveDashboardLayout(
  snapshot: Record<string, unknown>,
  sport?: string,
  panelKey?: DashboardPanelKey | null,
  athleteScope?: {
    age_band?: string | null;
    phv_stage?: string | null;
    position?: string | null;
    mode?: string | null;
  },
): Promise<ResolvedDashboardSection[]> {
  const set = await resolveInstructions({
    audience: 'athlete',
    sport: sport ?? null,
    age_band: athleteScope?.age_band ?? null,
    phv_stage: athleteScope?.phv_stage ?? null,
    position: athleteScope?.position ?? null,
    mode: athleteScope?.mode ?? null,
  });

  const dashboardDirectives = set.byType('dashboard_section');
  const wantedPanel = panelKey ?? 'main';

  return dashboardDirectives
    .filter((d) => {
      const payload = d.payload as Record<string, unknown>;
      if (payload.is_enabled === false) return false;
      const directivePanel = (payload.panel_key as string | undefined) ?? 'main';
      if (directivePanel !== wantedPanel) return false;

      // Honor any embedded visibility predicate carried over from legacy data.
      const config = (payload.config as Record<string, unknown>) ?? {};
      const visibility = (config.visibility ?? null) as DashboardSection['visibility'];
      return evaluateVisibility(visibility, snapshot);
    })
    .sort((a, b) => {
      const sa = (a.payload.sort_order as number | undefined) ?? a.priority;
      const sb = (b.payload.sort_order as number | undefined) ?? b.priority;
      return sa - sb;
    })
    .map((d) => {
      const payload = d.payload as Record<string, unknown>;
      const config = { ...((payload.config as Record<string, unknown>) ?? {}) };
      if (typeof config.headline_template === 'string') {
        config.headline_template = interpolateText(config.headline_template, snapshot);
      }
      if (typeof config.body_template === 'string') {
        config.body_template = interpolateText(config.body_template, snapshot);
      }

      const coachingTpl = (payload.coaching_text_template as string | null | undefined) ?? null;
      const sortOrder = (payload.sort_order as number | undefined) ?? d.priority;

      return {
        section_key: String(payload.section_key ?? ''),
        display_name: String(payload.display_name ?? ''),
        component_type: String(payload.component_type ?? ''),
        sort_order: sortOrder,
        config,
        coaching_text: coachingTpl ? interpolateText(coachingTpl, snapshot) : null,
        directive_id: d.id,
      };
    });
}

/**
 * Get all sections from the legacy table (admin/inspection view).
 * Phase 7: kept for the deprecation-banner-protected admin page so
 * operators can audit the legacy state. New authoring happens in the
 * Methodology Command Center.
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
