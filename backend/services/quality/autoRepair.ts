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

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { writeAuditEvent } from "@/lib/autoHealAudit";

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

    // ── Close-the-loop: spawn ai_fixes row (Phase 3, mandate #3) ──────
    // The drift alert already wrote an ai_issues row (drift.ts). Find it
    // by source_ref=alert.id, then insert an ai_fixes lifecycle instance
    // linked to it. Phase 5 applier reads ai_fixes.diff to know what to
    // apply; for CQE patterns the diff is the serialized patch_spec,
    // which the applier interprets per patch_type.
    await upsertCqeFix({
      alertId: alert.id,
      pattern,
      patch,
    });

    // Audit (Phase 4, CQE integration mandate #6).
    await writeAuditEvent({
      actor: "cron:auto-repair-scan",
      action: "drift_alert_patched",
      target_table: "quality_drift_alerts",
      target_id: alert.id,
      before_state: { status: alert.status, matched_pattern_id: null },
      after_state: {
        status: "patch_proposed",
        matched_pattern_id: pattern.id,
        patch_type: patch.patch_type,
        pattern_name: pattern.pattern_name,
      },
      reason: patch.rationale,
    });

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
// ai_fixes bridge (Phase 3, CQE integration mandate #3)
// ---------------------------------------------------------------------------

async function upsertCqeFix(args: {
  alertId: string;
  pattern: PatternRow;
  patch: ProposedPatch;
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_fixes not in generated types until regen
  try {
    // Find the ai_issues row that drift.ts opened for this alert.
    const { data: issueRow } = await db
      .from("ai_issues")
      .select("id")
      .eq("source", "cqe_drift")
      .eq("source_ref", args.alertId)
      .in("status", ["open", "fix_generated", "needs_human"])
      .limit(1);

    if (!issueRow || issueRow.length === 0) {
      logger.warn("[auto-repair] no ai_issues row found for alert; skipping ai_fixes bridge", {
        alertId: args.alertId,
      });
      return;
    }

    const issueId = issueRow[0].id as string;

    // The "diff" for CQE patterns is the patch_spec serialized — the Phase 5
    // applier reads patch_type to know how to interpret it (prompt_block_reinforce,
    // constant_update, etc.). Not a unified diff in the git sense; documented
    // in the column via rationale.
    const diffBody = JSON.stringify(args.patch, null, 2);
    const diffHash = createHash("sha256").update(diffBody).digest("hex");

    // Dedup: if an ai_fixes row with the same issue_id + diff_hash already
    // exists, skip — the same patch was previously proposed. Prevents
    // duplicate rows on re-runs over the same alert.
    const { data: existingFix } = await db
      .from("ai_fixes")
      .select("id, status")
      .eq("issue_id", issueId)
      .eq("diff_hash", diffHash)
      .limit(1);

    if (existingFix && existingFix.length > 0) {
      logger.info("[auto-repair] ai_fixes row already exists for this patch; no-op", {
        fix_id: existingFix[0].id,
      });
      return;
    }

    const { data: inserted, error } = await db
      .from("ai_fixes")
      .insert({
        issue_id: issueId,
        author: "cqe-autorepair",
        title: `CQE auto-repair: ${args.pattern.pattern_name}`,
        description: args.pattern.description ?? args.patch.rationale,
        fix_type: (() => {
          // Bridge to legacy fix_type CHECK values when possible, so the
          // existing CMS renderer keeps working. Map common patch_types to
          // the closest legacy bucket; unknowns fall back to 'prompt_builder'
          // which is the most common CQE target.
          const t = args.patch.patch_type;
          if (t === "prompt_block_reinforce") return "prompt_builder";
          if (t === "constant_update") return "rag_knowledge";
          if (t === "intent_registry") return "intent_registry";
          return "prompt_builder";
        })(),
        file_path: args.patch.affected_files[0] ?? null,
        code_change: diffBody, // legacy column — keep populated for back-compat
        diff: diffBody,
        diff_hash: diffHash,
        target_files: args.patch.affected_files,
        rationale: args.patch.rationale,
        confidence: 0.5, // not a real probability; placeholder until judges rate
        status: "proposed",
        priority: 3, // quality, not safety
      })
      .select("id")
      .single();

    if (error) {
      logger.error("[auto-repair] ai_fixes insert failed", { error: error.message });
      return;
    }

    // Mark the parent issue as fix_generated so the CMS queue reflects that
    // a fix is ready for human review.
    await db
      .from("ai_issues")
      .update({ status: "fix_generated" })
      .eq("id", issueId);

    logger.info("[auto-repair] ai_fixes opened", {
      fix_id: inserted?.id,
      issue_id: issueId,
      pattern: args.pattern.pattern_name,
    });
  } catch (e) {
    // Best-effort — the proposed_patch already landed on quality_drift_alerts;
    // ai_fixes bridge failure shouldn't block the scan.
    logger.error("[auto-repair] upsertCqeFix failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
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

