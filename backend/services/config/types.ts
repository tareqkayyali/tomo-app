/**
 * ════════════════════════════════════════════════════════════════════════════
 * System Config Engine — Shared Types
 * ════════════════════════════════════════════════════════════════════════════
 *
 * These types describe the envelope of every CMS-configurable domain.
 * Domain-specific payload schemas live alongside their consumers (e.g.
 * `services/ccrs/ccrsFormulaConfig.ts`) and plug in via `createConfigLoader`.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { z } from 'zod';

/**
 * One row in the `system_config` table.
 *
 * `payload` is `unknown` at this layer because every domain validates it
 * against its own Zod schema inside the loader. Consumers never see the raw
 * unknown — only the parsed, typed result.
 */
export interface ConfigEnvelope {
  config_key:         string;
  payload:            unknown;
  schema_version:     number;
  rollout_percentage: number;
  sport_filter:       string[] | null;
  enabled:            boolean;
  updated_at:         string;
  updated_by:         string | null;
  change_reason:      string | null;
}

/**
 * Context passed in on every config read. Determines whether the caller is
 * inside the rollout cohort (via hash(athlete_id + config_key)) and whether
 * the sport filter matches.
 *
 * Omit this for calls that are athlete-agnostic (e.g. background jobs,
 * admin previews). In that case the loader applies the config unconditionally
 * if rollout_percentage = 100 and sport_filter is null; otherwise it falls
 * back to the hardcoded DEFAULT (safe default — an unknown caller never
 * lands on a partial-rollout payload).
 */
export interface ConfigReadContext {
  athleteId?: string;
  sport?:     string | null;
}

/**
 * Source of the value returned by a config loader. Emitted on every read
 * as a metric tag so ops can see at a glance which percentage of reads
 * are hitting the DB vs. the hardcoded fallback.
 */
export type ConfigReadSource = 'cache' | 'db' | 'default';

/**
 * Envelope returned by the loader alongside the parsed payload.
 */
export interface ConfigLoadResult<T> {
  payload: T;
  source:  ConfigReadSource;
  /** Whether the caller's rollout context matched the stored row. Always true for DEFAULT fallback. */
  in_rollout: boolean;
}

/**
 * Zod schema for the envelope metadata columns, useful when admin endpoints
 * want to validate request bodies on write.
 */
export const configEnvelopeMetadataSchema = z.object({
  config_key:         z.string().regex(/^[a-z][a-z0-9_]*_v[0-9]+$/),
  schema_version:     z.number().int().positive(),
  rollout_percentage: z.number().int().min(0).max(100),
  sport_filter:       z.array(z.string()).nullable(),
  enabled:            z.boolean(),
  change_reason:      z.string().min(1).max(500),
});
