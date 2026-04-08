/**
 * ════════════════════════════════════════════════════════════════════════════
 * Signal Loader — Loads pd_signals with 5-minute cache
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Mirrors the PDIL protocolLoader pattern:
 *   - Single shared cache (signals don't change per-request)
 *   - 5-minute TTL
 *   - Sorted by priority ASC (highest priority = lowest number = checked first)
 *   - CMS admin calls clearSignalCache() after edits
 * ══════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { SignalConfig } from './types';

// ── Cache ──────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedSignals: SignalConfig[] | null = null;
let cacheTimestamp = 0;

/**
 * Load all enabled signals from pd_signals, sorted by priority ASC.
 * Uses a 5-minute in-memory cache.
 */
export async function loadActiveSignals(): Promise<SignalConfig[]> {
  const now = Date.now();

  if (cachedSignals && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedSignals;
  }

  const db = supabaseAdmin();
  const { data, error } = await (db as any)
    .from('pd_signals')
    .select('*')
    .eq('is_enabled', true)
    .order('priority', { ascending: true });

  if (error) {
    console.error('[SignalLoader] Failed to load signals:', error);
    // If we have a stale cache, use it rather than failing
    if (cachedSignals) {
      console.warn('[SignalLoader] Using stale cache after DB error');
      return cachedSignals;
    }
    return [];
  }

  // Map DB rows to SignalConfig shape
  cachedSignals = (data ?? []).map((row: any) => ({
    signal_id:          row.signal_id,
    key:                row.key,
    display_name:       row.display_name,
    subtitle:           row.subtitle,
    conditions:         row.conditions as any,
    priority:           row.priority,
    color:              row.color,
    hero_background:    row.hero_background,
    arc_opacity:        row.arc_opacity as any,
    pill_background:    row.pill_background,
    bar_rgba:           row.bar_rgba,
    coaching_color:     row.coaching_color,
    coaching_text:      row.coaching_text,
    pill_config:        row.pill_config as any,
    trigger_config:     row.trigger_config as any,
    adapted_plan_name:  row.adapted_plan_name,
    adapted_plan_meta:  row.adapted_plan_meta,
    show_urgency_badge: row.show_urgency_badge,
    urgency_label:      row.urgency_label,
    is_built_in:        row.is_built_in,
    is_enabled:         row.is_enabled,
    created_at:         row.created_at,
    updated_at:         row.updated_at,
  }));

  cacheTimestamp = now;
  return cachedSignals!;
}

/**
 * Clear the signal cache. Called by CMS admin after signal edits.
 */
export function clearSignalCache(): void {
  cachedSignals = null;
  cacheTimestamp = 0;
}

/**
 * Get cache status for debugging.
 */
export function getSignalCacheStatus(): { cached: boolean; age_ms: number; count: number } {
  return {
    cached: cachedSignals !== null,
    age_ms: cachedSignals ? Date.now() - cacheTimestamp : 0,
    count:  cachedSignals?.length ?? 0,
  };
}
