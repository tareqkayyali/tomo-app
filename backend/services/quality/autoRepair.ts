/**
 * Auto-repair pipeline.
 *
 * When drift detector raises a quality_drift_alerts row, this worker:
 *   1. Finds a matching auto_repair_patterns entry (by dimension + segment)
 *   2. Builds a concrete patch from the pattern's patch_spec
 *   3. Attaches the proposed_patch to the alert and updates status
 *   4. Optionally opens a GitHub PR if GH_BOT_TOKEN + repo env vars are set
 *
 * Nothing is auto-merged — human review is always required. The auto-repair
 * system's job is to propose, not to decide.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertRow {
  id: string;
  dimension: string;
  segment_key: Record<string, unknown>;
  baseline_mean: number | null;
  current_mean: number | null;
  cusum_value: number | null;
  window_days: number;
  status: string;
  matched_pattern_id: string | null;
}

interface PatternRow {
  id: string;
  pattern_name: string;
  description: string | null;
  detection_spec: Record<string, unknown>;
  affected_files: string[] | null;
  patch_spec: Record<string, unknown>;
  status: string;
  times_triggered: number;
}

export interface ProposedPatch {
  pattern_name: string;
  patch_type: string;                // e.g. "prompt_block_reinforce" | "constant_update"
  affected_files: string[];
  details: Record<string, unknown>;  // spec + filled-in evidence
  rationale: string;
}

// ---------------------------------------------------------------------------
// Main worker — scans open alerts and proposes patches
// ---------------------------------------------------------------------------

export interface AutoRepairResult {
  alertsScanned: number;
  patchesProposed: number;
  prsOpened: number;
  noMatch: number;
}

export async function runAutoRepairScan(): Promise<AutoRepairResult> {
  const db = supabaseAdmin() as any;

  const { data: alerts, error } = await db
    .from("quality_drift_alerts")
    .select("*")
    .eq("status", "open")
    .is("matched_pattern_id", null)
    .limit(100);

  if (error) throw new Error(`auto-repair scan load failed: ${error.message}`);

  const rows = (alerts ?? []) as AlertRow[];
  logger.info("[auto-repair] scanning alerts", { count: rows.length });

  let patchesProposed = 0;
  let prsOpened = 0;
  let noMatch = 0;

  for (const alert of rows) {
    const pattern = await findMatchingPattern(alert);
    if (!pattern) {
      noMatch++;
      continue;
    }

    const patch = buildPatch(pattern, alert);

    await db
      .from("quality_drift_alerts")
      .update({
        matched_pattern_id: pattern.id,
        proposed_patch: patch,
        status: "patch_proposed",
      })
      .eq("id", alert.id);

    // Bump the pattern's counters (read-then-write; no atomic increment in
    // supabase-js without an rpc fn — acceptable here since scan is serial).
    await db
      .from("auto_repair_patterns")
      .update({
        last_triggered_at: new Date().toISOString(),
        times_triggered: (pattern.times_triggered ?? 0) + 1,
      })
      .eq("id", pattern.id);

    patchesProposed++;

    const prUrl = await maybeOpenPr(patch, alert);
    if (prUrl) {
      await db
        .from("quality_drift_alerts")
        .update({ proposed_pr_url: prUrl })
        .eq("id", alert.id);
      prsOpened++;
    }

    logger.info("[auto-repair] patch proposed", {
      alertId: alert.id,
      pattern: pattern.pattern_name,
      prUrl: prUrl ?? "(not configured)",
    });
  }

  return {
    alertsScanned: rows.length,
    patchesProposed,
    prsOpened,
    noMatch,
  };
}

// ---------------------------------------------------------------------------
// Pattern matching
//
// A pattern's detection_spec describes a segment filter (optional) and a
// dimension. A simple match is: dimension matches AND every key in
// detection_spec.segment is a subset of the alert's segment_key.
// ---------------------------------------------------------------------------

async function findMatchingPattern(alert: AlertRow): Promise<PatternRow | null> {
  const db = supabaseAdmin() as any;
  const { data, error } = await db
    .from("auto_repair_patterns")
    .select("*")
    .eq("status", "active");

  if (error) {
    logger.warn("[auto-repair] pattern load failed", { error: error.message });
    return null;
  }

  const patterns = (data ?? []) as PatternRow[];
  for (const p of patterns) {
    if (patternMatches(p, alert)) return p;
  }
  return null;
}

export function patternMatches(pattern: PatternRow, alert: AlertRow): boolean {
  const spec = pattern.detection_spec ?? {};
  const dim = (spec as any).dimension;
  if (dim && dim !== alert.dimension) return false;

  const segFilter = (spec as any).segment ?? {};
  for (const [k, v] of Object.entries(segFilter)) {
    if ((alert.segment_key as any)[k] !== v) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Patch generation
// ---------------------------------------------------------------------------

export function buildPatch(pattern: PatternRow, alert: AlertRow): ProposedPatch {
  const spec = pattern.patch_spec ?? {};
  const baseline = alert.baseline_mean ?? null;
  const current = alert.current_mean ?? null;
  const delta =
    baseline !== null && current !== null ? current - baseline : null;

  const rationale = [
    `Pattern: ${pattern.pattern_name}.`,
    `Segment: ${JSON.stringify(alert.segment_key)}.`,
    `Dimension ${alert.dimension} baseline ${fmt(baseline)} → current ${fmt(current)}`,
    delta !== null ? `(Δ ${delta >= 0 ? "+" : ""}${fmt(delta)})` : "",
    `over ${alert.window_days}d window. z=${fmt(alert.cusum_value)}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    pattern_name: pattern.pattern_name,
    patch_type: ((spec as any).type as string) ?? "unknown",
    affected_files: pattern.affected_files ?? [],
    details: spec,
    rationale,
  };
}

function fmt(n: number | null): string {
  if (n === null) return "—";
  return n.toFixed(3);
}

// ---------------------------------------------------------------------------
// GitHub PR integration (optional — only runs when env is configured)
// ---------------------------------------------------------------------------

async function maybeOpenPr(
  patch: ProposedPatch,
  alert: AlertRow
): Promise<string | null> {
  const token = process.env.GH_BOT_TOKEN;
  const owner = process.env.GH_REPO_OWNER;
  const repo = process.env.GH_REPO_NAME;
  const baseBranch = process.env.GH_BASE_BRANCH ?? "main";

  if (!token || !owner || !repo) return null;

  // Minimal implementation: create a draft issue describing the patch.
  // Creating an actual branch + PR requires the structured edit to exist
  // as a concrete diff — that's out of scope for the generator. We open an
  // ISSUE with the patch body; engineers convert it to a PR.
  const title = `[auto-repair] ${patch.pattern_name} drift — ${alert.dimension}`;
  const body =
    `## Auto-repair proposal\n\n` +
    `**Rationale**: ${patch.rationale}\n\n` +
    `**Patch type**: \`${patch.patch_type}\`\n` +
    `**Affected files**:\n${patch.affected_files.map((f) => `- \`${f}\``).join("\n") || "— (unspecified)"}\n\n` +
    `**Patch spec**:\n\`\`\`json\n${JSON.stringify(patch.details, null, 2)}\n\`\`\`\n\n` +
    `Alert id: \`${alert.id}\`. Base branch: \`${baseBranch}\`.\n\n` +
    `_Created by the Chat Quality auto-repair scanner. Review → implement → commit → close._`;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          title,
          body,
          labels: ["auto-repair", "chat-quality"],
        }),
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn("[auto-repair] GitHub issue create failed", {
        status: res.status,
        text: text.slice(0, 200),
      });
      return null;
    }
    const data = (await res.json()) as { html_url?: string };
    return data.html_url ?? null;
  } catch (err) {
    logger.warn("[auto-repair] GitHub call threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

