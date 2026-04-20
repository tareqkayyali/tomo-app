/**
 * ════════════════════════════════════════════════════════════════════════════
 * Config Loader Factory
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Every CMS-configurable domain (CCRS formula, ACWR, intensity catalog,
 * notifications, etc.) uses `createConfigLoader` to get a typed, cached,
 * validated, rollout-aware accessor:
 *
 *   export const getCCRSConfig = createConfigLoader({
 *     key: 'ccrs_formula_v1',
 *     schema: ccrsFormulaSchema,
 *     default: CCRS_FORMULA_DEFAULT,
 *     ttlSeconds: 300,
 *   });
 *
 *   // Consumer:
 *   const cfg = await getCCRSConfig({ athleteId, sport });
 *   const weight = cfg.cascade_weights.biometric_base;
 *
 * Safety contract:
 *   - If the DB row is missing → return DEFAULT, log metric with source='default'
 *   - If Zod validation fails → return DEFAULT, log metric with validation_ok=false
 *   - If the athlete falls outside the rollout → return DEFAULT
 *   - If the DB call throws → return DEFAULT (same as signalLoader)
 *   - If all of the above pass → return the parsed payload from cache/DB
 *
 * The loader is deliberately opinionated: it always returns a valid
 * payload. Callers never handle null. DEFAULT is the source of truth for
 * the shape; DB just lets ops override.
 * ════════════════════════════════════════════════════════════════════════════
 */

import type { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type {
  ConfigEnvelope,
  ConfigReadContext,
  ConfigLoadResult,
  ConfigReadSource,
} from './types';
import { isInRollout } from './rollout';
import { emitConfigRead } from './metrics';

// ── Cache ───────────────────────────────────────────────────────────────────
// Process-wide module-level cache keyed by config_key. Same pattern as
// signalLoader.ts. Entries hold the raw envelope (not the parsed payload)
// so the rollout filter can still run per-call against a shared cached row.

interface CacheEntry {
  envelope:  ConfigEnvelope | null; // null = negative cache (no DB row)
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

// Default 5 minutes, overridable per-domain when cost-of-staleness differs.
const DEFAULT_TTL_MS = 5 * 60 * 1000;

// ── Factory ─────────────────────────────────────────────────────────────────

export interface CreateConfigLoaderParams<T> {
  /** Must match the `config_key` column (e.g. 'ccrs_formula_v1'). */
  key:        string;
  /** Zod schema for the payload. */
  schema:     z.ZodType<T>;
  /** Hardcoded fallback. Source of truth for cold-boot and error paths. */
  default:    T;
  /** Override the 5-minute default cache TTL. */
  ttlSeconds?: number;
}

export type ConfigLoader<T> = (ctx?: ConfigReadContext) => Promise<T>;
export type ConfigLoaderVerbose<T> = (ctx?: ConfigReadContext) => Promise<ConfigLoadResult<T>>;

/**
 * Build a typed loader for one config domain. Returns the consumer-facing
 * `getConfig()` function plus a `.verbose()` accessor that exposes the
 * source + rollout state (used by admin previews and tests).
 */
export function createConfigLoader<T>(
  params: CreateConfigLoaderParams<T>,
): ConfigLoader<T> & { verbose: ConfigLoaderVerbose<T> } {
  const ttlMs = (params.ttlSeconds ?? DEFAULT_TTL_MS / 1000) * 1000;

  async function load(ctx?: ConfigReadContext): Promise<ConfigLoadResult<T>> {
    const started = Date.now();
    let source: ConfigReadSource = 'default';
    let validationOk = true;
    let inRollout = true;

    try {
      const envelope = await readEnvelope(params.key, ttlMs, (hit) => {
        source = hit ? 'cache' : 'db';
      });

      if (!envelope || !envelope.enabled) {
        source = 'default';
        return { payload: params.default, source, in_rollout: true };
      }

      inRollout = isInRollout({
        athleteId:         ctx?.athleteId,
        athleteSport:      ctx?.sport,
        configKey:         params.key,
        rolloutPercentage: envelope.rollout_percentage,
        sportFilter:       envelope.sport_filter,
      });

      if (!inRollout) {
        source = 'default';
        return { payload: params.default, source, in_rollout: false };
      }

      const parsed = params.schema.safeParse(envelope.payload);
      if (!parsed.success) {
        validationOk = false;
        // eslint-disable-next-line no-console
        console.warn(
          `[configLoader] payload for ${params.key} failed Zod validation, falling back to DEFAULT`,
          parsed.error.flatten(),
        );
        source = 'default';
        return { payload: params.default, source, in_rollout: true };
      }

      return { payload: parsed.data, source, in_rollout: true };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[configLoader] unexpected error loading ${params.key}`, err);
      source = 'default';
      validationOk = false;
      return { payload: params.default, source, in_rollout: true };
    } finally {
      emitConfigRead({
        config_key:    params.key,
        source,
        in_rollout:    inRollout,
        validation_ok: validationOk,
        elapsed_ms:    Date.now() - started,
      });
    }
  }

  const getConfig: ConfigLoader<T> & { verbose: ConfigLoaderVerbose<T> } =
    (async (ctx?: ConfigReadContext) => (await load(ctx)).payload) as
      ConfigLoader<T> & { verbose: ConfigLoaderVerbose<T> };

  getConfig.verbose = (ctx?: ConfigReadContext) => load(ctx);
  return getConfig;
}

// ── Shared cache machinery ─────────────────────────────────────────────────

async function readEnvelope(
  key:     string,
  ttlMs:   number,
  markHit: (wasCacheHit: boolean) => void,
): Promise<ConfigEnvelope | null> {
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && now - cached.timestamp < ttlMs) {
    markHit(true);
    return cached.envelope;
  }

  const db = supabaseAdmin();
  const { data, error } = await (db as any)
    .from('system_config')
    .select('*')
    .eq('config_key', key)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[configLoader] DB error on ${key}:`, error.message);
    // Serve stale if we have it, otherwise return null → caller uses DEFAULT.
    if (cached) {
      markHit(true);
      return cached.envelope;
    }
    markHit(false);
    return null;
  }

  const envelope: ConfigEnvelope | null = data
    ? {
        config_key:         data.config_key,
        payload:            data.payload,
        schema_version:     data.schema_version,
        rollout_percentage: data.rollout_percentage,
        sport_filter:       data.sport_filter,
        enabled:            data.enabled,
        updated_at:         data.updated_at,
        updated_by:         data.updated_by,
        change_reason:      data.change_reason,
      }
    : null;

  cache.set(key, { envelope, timestamp: now });
  markHit(false);
  return envelope;
}

// ── Cache control ──────────────────────────────────────────────────────────

/**
 * Drop the cached envelope for a specific key (or all keys). Called by
 * admin write endpoints immediately after a successful upsert so the next
 * read hits DB.
 */
export function invalidateConfigCache(key?: string): void {
  if (key === undefined) {
    cache.clear();
  } else {
    cache.delete(key);
  }
}

/**
 * Cache inspection for tests + the admin debug page.
 */
export function getConfigCacheStatus(): Array<{
  key:       string;
  has_row:   boolean;
  age_ms:    number;
}> {
  const now = Date.now();
  return Array.from(cache.entries()).map(([key, entry]) => ({
    key,
    has_row: entry.envelope !== null,
    age_ms:  now - entry.timestamp,
  }));
}
