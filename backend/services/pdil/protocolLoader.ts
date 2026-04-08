/**
 * ════════════════════════════════════════════════════════════════════════════
 * PDIL Protocol Loader
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Loads PD protocols from the database with:
 *   1. In-memory caching (5-minute TTL) — avoids DB reads during event bursts
 *   2. Scope pre-filtering — only evaluates protocols relevant to this athlete
 *   3. Cache invalidation — called after CMS saves
 *
 * ── CACHING STRATEGY ──
 *
 * Protocols change rarely (PD edits via CMS, maybe a few times per week).
 * Evaluations happen frequently (every boot, every chat, every event).
 * A 5-minute cache means:
 *   - 0 DB reads for rapid-fire events (check-in + session + vital in 30 seconds)
 *   - Max 5 minutes stale after a CMS edit (acceptable for protocol changes)
 *   - Explicit invalidation on CMS save for immediate effect when needed
 *
 * ── SCOPE PRE-FILTERING ──
 *
 * Before evaluating conditions (which involves field resolution and operator
 * comparison), we cheaply filter out protocols that don't apply to this
 * athlete based on sport, PHV stage, age band, and position.
 * This is O(n) array filtering — fast even with 100+ protocols.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { PDProtocol, PDScopeFilter } from './types';

// ============================================================================
// CACHE
// ============================================================================

/** All enabled protocols, cached in memory. */
let protocolCache: PDProtocol[] | null = null;

/** Timestamp of last cache population. */
let cacheLoadedAt = 0;

/** Cache time-to-live: 5 minutes. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Load all enabled protocols from the database.
 * Returns cached data if within TTL window.
 *
 * @returns All enabled protocols, sorted by priority ASC
 */
async function loadAllProtocols(): Promise<PDProtocol[]> {
  const now = Date.now();

  // Return cached if fresh
  if (protocolCache && (now - cacheLoadedAt) < CACHE_TTL_MS) {
    return protocolCache;
  }

  // Fetch from DB
  const db = supabaseAdmin();
  // Cast to `any` because pd_protocols is not yet in the generated DB types.
  // After running `npx supabase gen types typescript --local`, remove this cast.
  const { data, error } = await (db as any)
    .from('pd_protocols')
    .select('*')
    .eq('is_enabled', true)
    .order('priority', { ascending: true });

  if (error) {
    console.error('[PDIL] Failed to load protocols:', error.message);
    // If cache exists but is stale, use it as fallback (better than nothing)
    if (protocolCache) {
      console.warn('[PDIL] Using stale cache as fallback');
      return protocolCache;
    }
    // No cache at all — return empty (will trigger fail-safe in evaluator)
    return [];
  }

  // Parse conditions JSONB and normalize the protocol shape
  protocolCache = ((data as Record<string, unknown>[]) || []).map(normalizeProtocol);
  cacheLoadedAt = now;

  return protocolCache;
}

/**
 * Normalize a raw database row into a typed PDProtocol.
 * Handles JSONB parsing and null coercion.
 */
function normalizeProtocol(row: Record<string, unknown>): PDProtocol {
  return {
    protocol_id:              row.protocol_id as string,
    name:                     row.name as string,
    description:              (row.description as string) ?? null,
    category:                 row.category as PDProtocol['category'],
    conditions:               typeof row.conditions === 'string'
                                ? JSON.parse(row.conditions)
                                : (row.conditions as PDProtocol['conditions']),
    priority:                 (row.priority as number) ?? 100,

    // Domain 1: Training Modifiers
    load_multiplier:          row.load_multiplier != null ? Number(row.load_multiplier) : null,
    intensity_cap:            (row.intensity_cap as PDProtocol['intensity_cap']) ?? null,
    contraindications:        (row.contraindications as string[]) ?? null,
    required_elements:        (row.required_elements as string[]) ?? null,
    session_cap_minutes:      row.session_cap_minutes != null ? Number(row.session_cap_minutes) : null,

    // Domain 2: Recommendation Guardrails
    blocked_rec_categories:   (row.blocked_rec_categories as string[]) ?? null,
    mandatory_rec_categories: (row.mandatory_rec_categories as string[]) ?? null,
    priority_override:        (row.priority_override as PDProtocol['priority_override']) ?? null,
    override_message:         (row.override_message as string) ?? null,

    // Domain 3: RAG Overrides
    forced_rag_domains:       (row.forced_rag_domains as string[]) ?? null,
    blocked_rag_domains:      (row.blocked_rag_domains as string[]) ?? null,
    rag_condition_tags:       row.rag_condition_tags != null
                                ? (typeof row.rag_condition_tags === 'string'
                                    ? JSON.parse(row.rag_condition_tags)
                                    : row.rag_condition_tags as Record<string, string>)
                                : null,

    // Domain 4: AI Coaching Context
    ai_system_injection:      (row.ai_system_injection as string) ?? null,
    safety_critical:          (row.safety_critical as boolean) ?? false,

    // Scope Filters
    sport_filter:             (row.sport_filter as string[]) ?? null,
    phv_filter:               (row.phv_filter as string[]) ?? null,
    age_band_filter:          (row.age_band_filter as string[]) ?? null,
    position_filter:          (row.position_filter as string[]) ?? null,

    // Behavior
    is_built_in:              (row.is_built_in as boolean) ?? false,
    is_enabled:               (row.is_enabled as boolean) ?? true,
    version:                  (row.version as number) ?? 1,

    // Metadata
    evidence_source:          (row.evidence_source as string) ?? null,
    evidence_grade:           (row.evidence_grade as PDProtocol['evidence_grade']) ?? null,
    created_by:               (row.created_by as string) ?? null,
    updated_by:               (row.updated_by as string) ?? null,
    created_at:               (row.created_at as string) ?? new Date().toISOString(),
    updated_at:               (row.updated_at as string) ?? new Date().toISOString(),
  };
}


// ============================================================================
// SCOPE PRE-FILTER
// ============================================================================

/**
 * Filter protocols by athlete scope.
 *
 * A protocol matches an athlete's scope if:
 *   - The scope filter is NULL (applies to all athletes), OR
 *   - The athlete's value is included in the filter array
 *
 * This is a cheap pre-filter — runs BEFORE the expensive condition evaluation.
 *
 * @param protocols - All enabled protocols (from cache)
 * @param scope     - The athlete's scope attributes
 * @returns Protocols that are relevant to this athlete
 */
function filterByScope(
  protocols: PDProtocol[],
  scope: PDScopeFilter,
): PDProtocol[] {
  return protocols.filter(p => {
    // Sport filter
    if (p.sport_filter && p.sport_filter.length > 0 && scope.sport) {
      if (!p.sport_filter.includes(scope.sport)) return false;
    }

    // PHV stage filter
    if (p.phv_filter && p.phv_filter.length > 0 && scope.phv_stage) {
      if (!p.phv_filter.includes(scope.phv_stage)) return false;
    }

    // Age band filter
    if (p.age_band_filter && p.age_band_filter.length > 0 && scope.age_band) {
      if (!p.age_band_filter.includes(scope.age_band)) return false;
    }

    // Position filter
    if (p.position_filter && p.position_filter.length > 0 && scope.position) {
      if (!p.position_filter.includes(scope.position)) return false;
    }

    return true;
  });
}


// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Load protocols relevant to a specific athlete.
 * Applies scope pre-filtering to avoid unnecessary condition evaluation.
 *
 * @param scope - The athlete's sport, PHV stage, age band, position
 * @returns Filtered protocols sorted by priority ASC (ready for evaluation)
 */
export async function loadActiveProtocols(
  scope: PDScopeFilter,
): Promise<PDProtocol[]> {
  const all = await loadAllProtocols();
  return filterByScope(all, scope);
}

/**
 * Force-clear the protocol cache.
 * Called after CMS saves to ensure immediate effect.
 *
 * @example
 *   // In admin protocol CRUD endpoint:
 *   await updateProtocol(id, data);
 *   clearProtocolCache();  // Next evaluation reads fresh from DB
 */
export function clearProtocolCache(): void {
  protocolCache = null;
  cacheLoadedAt = 0;
}

/**
 * Get the current cache status (for admin diagnostics).
 */
export function getProtocolCacheStatus(): {
  cached: boolean;
  count: number;
  age_ms: number;
  ttl_remaining_ms: number;
} {
  const now = Date.now();
  const age = protocolCache ? now - cacheLoadedAt : 0;
  return {
    cached:           protocolCache !== null,
    count:            protocolCache?.length ?? 0,
    age_ms:           age,
    ttl_remaining_ms: protocolCache ? Math.max(0, CACHE_TTL_MS - age) : 0,
  };
}
