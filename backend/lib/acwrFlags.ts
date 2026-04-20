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
 * Mode for `getACWRMultiplier` in ccrsFormula.ts.
 *   - `hard_cap_only` (default): only ACWR > 2.0 produces a non-unity
 *     multiplier and the ACWR_BLOCKED alert flag. Anything ≤ 2.0 returns
 *     `{ multiplier: 1.0, zone: 'sweet_spot', hard_cap: false }` with no
 *     flag raised.
 *   - `full`: legacy behaviour — caution (>1.3), high_risk (>1.5), and
 *     blocked (>2.0) all produce multipliers and flags.
 *
 * Default is `hard_cap_only` to preserve the catastrophic-overload safety
 * net while eliminating the false positives driven by academic inflation.
 */
export type CCRSACWRMode = "hard_cap_only" | "full";
export const CCRS_ACWR_MODE: CCRSACWRMode =
  process.env.CCRS_ACWR_MODE === "full" ? "full" : "hard_cap_only";
