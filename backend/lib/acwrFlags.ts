/**
 * ACWR decommissioning flags (April 2026).
 *
 * The Acute:Chronic Workload Ratio (7d:28d) was removed from AI-facing
 * surfaces because academic load (×0.4 weight) was inflating ACWR into
 * caution/danger zones without heavy training, which biased chat
 * recommendations toward "low load / rest / recovery" even for athletes
 * who were not overloaded.
 *
 * ACWR is preserved as:
 *   - a silent input to the CCRS >2.0 hard-cap safety net
 *   - a snapshot field for coach/analyst dashboards (transparency)
 *
 * Flip either flag to `true` (via env var) to restore pre-decommission
 * behaviour without redeploying code.
 */

/**
 * When `true`, program guardrails apply the ACWR load gate (Rule 1 in
 * programGuardrails.ts). Default `false` — CCRS and readiness RAG carry
 * the safety logic instead.
 *
 * NOTE: programGuardrails also reads `guardrails.acwr.enabled` from the
 * CMS-managed recommendation config. That config's `enabled` default has
 * been flipped to `false` to match this flag; this env var is the
 * emergency override if the CMS row is missing or misconfigured.
 */
export const ACWR_PROGRAM_GUARDRAIL_ENABLED =
  process.env.ACWR_PROGRAM_GUARDRAIL_ENABLED === "true";

/**
 * CCRS_ACWR_MODE env var was removed in the config-engine PR 2 (April 2026)
 * and replaced by the `mode` field on the `acwr_config_v1` row in
 * `system_config`. See `services/events/acwrConfig.ts`. Flip it via
 * /admin/config/acwr_config_v1 instead of an env var deploy.
 *
 * Intentionally not re-exported here so any remaining import breaks at
 * tsc time instead of silently reading a dead env var.
 */
