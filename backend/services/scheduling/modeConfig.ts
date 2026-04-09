/**
 * Mode Config Service — Cached CMS reader for athlete modes.
 *
 * Follows the same caching pattern as recommendationConfig.ts:
 * module-level variable + timestamp TTL (5 minutes).
 *
 * Used by:
 *   - modeChangeHandler (event processing)
 *   - scheduleRuleEngine (getEffectiveRulesWithMode)
 *   - Mobile mode selector (getAvailableModes)
 *   - PlanningAgent (AI context building)
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModeParams {
  maxHardPerWeek: number;
  maxSessionsPerDay: number;
  studyDurationMultiplier: number;
  reduceGymDaysTo: number | null;
  dropPersonalDev: boolean;
  intensityCapOnExamDays: 'REST' | 'LIGHT' | 'MODERATE' | null;
  addRecoveryAfterMatch: boolean;
  studyTrainingBalanceRatio: number;
  loadCapMultiplier: number;
  aiCoachingTone: 'supportive' | 'performance' | 'balanced' | 'academic';
  priorityBoosts: Array<{ category: string; delta: number }>;
  referenceTemplates: Record<string, unknown>;
}

export interface ModeDefinition {
  id: string;
  label: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  params: ModeParams;
  sport_filter: string[] | null;
  is_enabled: boolean;
}

// ---------------------------------------------------------------------------
// Cache (module-level — matches recommendationConfig.ts pattern)
// ---------------------------------------------------------------------------

let cachedModes: ModeDefinition[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clear the mode config cache. Call after CMS admin saves.
 */
export function clearModeConfigCache(): void {
  cachedModes = null;
  cachedAt = 0;
}

/**
 * Get all enabled mode definitions (cached 5 min).
 */
export async function getAllModes(): Promise<ModeDefinition[]> {
  const now = Date.now();
  if (cachedModes && now - cachedAt < CACHE_TTL_MS) {
    return cachedModes;
  }

  const db = supabaseAdmin();
  // athlete_modes is a new table from migration 036 — cast to bypass generated types until regen
  const { data, error } = await (db as any)
    .from('athlete_modes')
    .select('*')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true });

  if (error) {
    logger.error('Failed to fetch athlete_modes', { error: error.message });
    // Return stale cache if available, empty array otherwise
    return cachedModes ?? [];
  }

  cachedModes = (data ?? []) as ModeDefinition[];
  cachedAt = now;
  return cachedModes;
}

/**
 * Get a single mode definition by ID (from cache).
 */
export async function getModeDefinition(modeId: string): Promise<ModeDefinition | null> {
  const modes = await getAllModes();
  return modes.find(m => m.id === modeId) ?? null;
}

/**
 * Get available modes for a specific sport (filters by sport_filter).
 * Returns all modes where sport_filter is null (all sports) or contains the sport.
 */
export async function getAvailableModes(sport?: string): Promise<ModeDefinition[]> {
  const modes = await getAllModes();
  if (!sport) return modes;
  return modes.filter(m => m.sport_filter === null || m.sport_filter.includes(sport));
}
