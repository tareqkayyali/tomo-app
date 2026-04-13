/**
 * CMS Config Loader — cached access to CMS-managed agent configuration.
 *
 * Provides a typed, TTL-cached read layer for CMS tables that agents need
 * at runtime (modes, training categories, planning protocols, PDIL protocols).
 *
 * Design:
 *   - Map-based cache with per-table TTL (default 5 minutes)
 *   - Single async getter per table type
 *   - Graceful fallback: returns empty array on any error
 *   - Cache invalidation via clearCache() for admin CMS writes
 *   - Zero impact on chat latency (cache hit = Map.get, ~0ms)
 *
 * Used by: orchestrator (mode params), agent tools, planning agent,
 * system prompt builder (protocol injections), CMS admin endpoints.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Types ──────────────────────────────────────────────────────────────

export interface AthleteMode {
  id: string;
  label: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  params: Record<string, unknown>;
  sportFilter: string[] | null;
  isEnabled: boolean;
}

export interface TrainingCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  defaultMode: string;
  defaultDaysPerWeek: number;
  defaultSessionDuration: number;
  defaultPreferredTime: string;
  sortOrder: number;
  sportFilter: string[] | null;
  isEnabled: boolean;
}

export interface PlanningProtocol {
  id: string;
  name: string;
  description: string | null;
  severity: string;
  category: string;
  triggerConditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  scientificBasis: string | null;
  sportFilter: string[] | null;
  isEnabled: boolean;
}

// ── Cache internals ────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/** Default TTL: 5 minutes (300,000 ms) */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Get all enabled athlete modes, cached for 5 minutes.
 */
export async function getAthleteModes(): Promise<AthleteMode[]> {
  const CACHE_KEY = "athlete_modes";
  const cached = getCached<AthleteMode[]>(CACHE_KEY);
  if (cached) return cached;

  try {
    const db = supabaseAdmin();
    const { data, error } = await (db as any)
      .from("athlete_modes")
      .select("*")
      .eq("is_enabled", true)
      .order("sort_order");

    if (error) throw error;

    const modes: AthleteMode[] = (data ?? []).map((r: any) => ({
      id: r.id,
      label: r.label,
      description: r.description,
      icon: r.icon,
      color: r.color,
      sortOrder: r.sort_order ?? 0,
      params: r.params ?? {},
      sportFilter: r.sport_filter,
      isEnabled: r.is_enabled,
    }));

    setCache(CACHE_KEY, modes);
    return modes;
  } catch (err) {
    console.error("[cmsConfigLoader] Failed to load athlete_modes:", err);
    return [];
  }
}

/**
 * Get all enabled training category templates, cached for 5 minutes.
 */
export async function getTrainingCategories(): Promise<TrainingCategory[]> {
  const CACHE_KEY = "training_categories";
  const cached = getCached<TrainingCategory[]>(CACHE_KEY);
  if (cached) return cached;

  try {
    const db = supabaseAdmin();
    const { data, error } = await (db as any)
      .from("training_category_templates")
      .select("*")
      .eq("is_enabled", true)
      .order("sort_order");

    if (error) throw error;

    const categories: TrainingCategory[] = (data ?? []).map((r: any) => ({
      id: r.id,
      label: r.label,
      icon: r.icon,
      color: r.color,
      defaultMode: r.default_mode ?? "fixed_days",
      defaultDaysPerWeek: r.default_days_per_week ?? 3,
      defaultSessionDuration: r.default_session_duration ?? 60,
      defaultPreferredTime: r.default_preferred_time ?? "afternoon",
      sortOrder: r.sort_order ?? 0,
      sportFilter: r.sport_filter,
      isEnabled: r.is_enabled,
    }));

    setCache(CACHE_KEY, categories);
    return categories;
  } catch (err) {
    console.error("[cmsConfigLoader] Failed to load training_categories:", err);
    return [];
  }
}

/**
 * Get all enabled planning protocols, cached for 5 minutes.
 */
export async function getPlanningProtocols(): Promise<PlanningProtocol[]> {
  const CACHE_KEY = "planning_protocols";
  const cached = getCached<PlanningProtocol[]>(CACHE_KEY);
  if (cached) return cached;

  try {
    const db = supabaseAdmin();
    const { data, error } = await (db as any)
      .from("planning_protocols")
      .select("*")
      .eq("is_enabled", true)
      .order("category");

    if (error) throw error;

    const protocols: PlanningProtocol[] = (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      severity: r.severity,
      category: r.category,
      triggerConditions: r.trigger_conditions ?? {},
      actions: r.actions ?? {},
      scientificBasis: r.scientific_basis,
      sportFilter: r.sport_filter,
      isEnabled: r.is_enabled,
    }));

    setCache(CACHE_KEY, protocols);
    return protocols;
  } catch (err) {
    console.error("[cmsConfigLoader] Failed to load planning_protocols:", err);
    return [];
  }
}

/**
 * Get mode params for a specific mode ID.
 * Convenience wrapper used by orchestrator for system prompt injection.
 */
export async function getModeParams(modeId: string): Promise<Record<string, unknown> | null> {
  const modes = await getAthleteModes();
  const mode = modes.find((m) => m.id === modeId);
  return mode?.params ?? null;
}

/**
 * Get training categories filtered by sport.
 * Returns all categories if sport is null, or those without a sport filter.
 */
export async function getTrainingCategoriesForSport(sport: string | null): Promise<TrainingCategory[]> {
  const all = await getTrainingCategories();
  if (!sport) return all;
  return all.filter((c) => !c.sportFilter || c.sportFilter.includes(sport));
}

/**
 * Clear all cached entries. Call after CMS admin writes.
 * Can optionally clear a single table key.
 */
export function clearCache(key?: string): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

/**
 * Cache stats for debugging / admin dashboard.
 */
export function getCacheStats(): { entries: number; keys: string[] } {
  return {
    entries: cache.size,
    keys: [...cache.keys()],
  };
}
