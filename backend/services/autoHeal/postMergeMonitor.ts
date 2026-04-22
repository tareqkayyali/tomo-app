/**
 * Auto-heal post-merge monitor.
 *
 * Three responsibilities per run:
 *
 *   1. DETECT  — poll GH for auto-heal PRs (status='auto_approved_pr_open').
 *                Flip to 'merged' + open an ai_post_merge_watch on merge,
 *                or 'reverted' when the PR is closed without merge.
 *
 *   2. ASSESS  — for every active watch (status='watching'), count
 *                ai_issues opened on overlapping target_files SINCE the
 *                merge. Update regressions_detected + heartbeat_at.
 *
 *   3. FINALIZE — for watches past watch_until, flip to 'clean' if zero
 *                 regressions, 'reverted' otherwise. MVP logs the reverted
 *                 state and writes an audit row — auto-opening a revert PR
 *                 is a later enhancement.
 *
 * Watch window default: ai_auto_heal_config.post_merge_clean_hours (48h).
 *
 * Runs every hour via .github/workflows/auto-heal-monitor.yml → TS cron.
 * No kill-switch gate: telemetry stays live even when auto-heal is
 * disabled — the watches that exist were created while the loop was on,
 * and we still want to know whether they introduced regressions.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { writeAuditEvent } from "@/lib/autoHealAudit";

// ── Types ────────────────────────────────────────────────────────────

interface GhContext {
  owner: string;
  repo: string;
  token: string;
}

interface OpenPrFix {
  id: string;
  issue_id: string;
  pr_url: string | null;
  target_files: string[] | null;
  branch_name: string | null;
}

interface ActiveWatch {
  id: string;
  fix_id: string;
  merged_commit_sha: string;
  merged_at: string;
  watch_until: string;
  regressions_detected: number;
  regression_details: Record<string, unknown>[] | null;
}

export interface MonitorResult {
  mergedDetected: number;
  closedWithoutMerge: number;
  watchesOpened: number;
  watchesAssessed: number;
  watchesFinalizedClean: number;
  watchesFinalizedReverted: number;
  errors: number;
}


// ── Public entry ─────────────────────────────────────────────────────

export async function runPostMergeMonitor(): Promise<MonitorResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_* tables not in generated types until regen

  const summary: MonitorResult = {
    mergedDetected: 0,
    closedWithoutMerge: 0,
    watchesOpened: 0,
    watchesAssessed: 0,
    watchesFinalizedClean: 0,
    watchesFinalizedReverted: 0,
    errors: 0,
  };

  const gh = loadGhContext();
  if (!gh) {
    logger.warn(
      "[monitor] skipped detection — GH_BOT_TOKEN + GH_REPO_OWNER + GH_REPO_NAME must be set",
    );
  }

  // ── 1. Detect merged / closed-without-merge ─────────────────────
  if (gh) {
    try {
      const detect = await detectPrOutcomes(db, gh);
      summary.mergedDetected = detect.merged;
      summary.closedWithoutMerge = detect.closed;
      summary.watchesOpened = detect.watchesOpened;
      summary.errors += detect.errors;
    } catch (e) {
      logger.error("[monitor] detect phase failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      summary.errors += 1;
    }
  }

  // ── 2. Assess active watches ────────────────────────────────────
  try {
    const assessed = await assessActiveWatches(db);
    summary.watchesAssessed = assessed;
  } catch (e) {
    logger.error("[monitor] assess phase failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    summary.errors += 1;
  }

  // ── 3. Finalize expired watches ─────────────────────────────────
  try {
    const finalized = await finalizeExpiredWatches(db);
    summary.watchesFinalizedClean = finalized.clean;
    summary.watchesFinalizedReverted = finalized.reverted;
  } catch (e) {
    logger.error("[monitor] finalize phase failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    summary.errors += 1;
  }

  return summary;
}


// ── 1. Detect ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function detectPrOutcomes(db: any, gh: GhContext) {
  let merged = 0;
  let closed = 0;
  let watchesOpened = 0;
  let errors = 0;

  const { data: openFixes, error } = await db
    .from("ai_fixes")
    .select("id, issue_id, pr_url, target_files, branch_name")
    .eq("status", "auto_approved_pr_open")
    .not("pr_url", "is", null);
  if (error) throw new Error(`load open PRs failed: ${error.message}`);

  const watchHours = await loadWatchWindowHours(db);

  for (const fix of (openFixes ?? []) as OpenPrFix[]) {
    try {
      const prNumber = parsePrNumber(fix.pr_url);
      if (!prNumber) continue;
      const state = await ghGetPr(gh, prNumber);
      if (state.merged && state.merged_at && state.merge_commit_sha) {
        // Flip fix → merged, open watch, flip issue → resolved
        await db
          .from("ai_fixes")
          .update({ status: "merged", resolved_at: new Date().toISOString() })
          .eq("id", fix.id);

        const watchUntil = new Date(
          new Date(state.merged_at).getTime() + watchHours * 3600 * 1000,
        ).toISOString();

        await db.from("ai_post_merge_watch").insert({
          fix_id: fix.id,
          merged_commit_sha: state.merge_commit_sha,
          merged_at: state.merged_at,
          watch_until: watchUntil,
          regressions_detected: 0,
          regression_details: [],
          status: "watching",
        });

        await db
          .from("ai_issues")
          .update({
            status: "resolved",
            resolved_at: new Date().toISOString(),
            resolved_by_fix_id: fix.id,
          })
          .eq("id", fix.issue_id);

        await writeAuditEvent({
          actor: "cron:auto-heal-monitor",
          action: "auto_heal_pr_merged",
          target_table: "ai_fixes",
          target_id: fix.id,
          before_state: { status: "auto_approved_pr_open" },
          after_state: {
            status: "merged",
            merged_commit_sha: state.merge_commit_sha,
            watch_until: watchUntil,
          },
        });
        merged++;
        watchesOpened++;
      } else if (state.state === "closed" && !state.merged) {
        // PR closed without merging — treat as human rejection.
        await db
          .from("ai_fixes")
          .update({ status: "reverted", resolved_at: new Date().toISOString() })
          .eq("id", fix.id);
        await db
          .from("ai_issues")
          .update({ status: "needs_human" })
          .eq("id", fix.issue_id);
        await writeAuditEvent({
          actor: "cron:auto-heal-monitor",
          action: "auto_heal_pr_closed_without_merge",
          target_table: "ai_fixes",
          target_id: fix.id,
          before_state: { status: "auto_approved_pr_open" },
          after_state: { status: "reverted" },
          reason: "PR closed by human without merging",
        });
        closed++;
      }
      // else: still open — no action, wait for next tick
    } catch (e) {
      logger.error("[monitor] PR outcome check failed", {
        fix_id: fix.id,
        error: e instanceof Error ? e.message : String(e),
      });
      errors++;
    }
  }

  return { merged, closed, watchesOpened, errors };
}


// ── 2. Assess ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assessActiveWatches(db: any): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: watches, error } = await db
    .from("ai_post_merge_watch")
    .select("id, fix_id, merged_commit_sha, merged_at, watch_until, regressions_detected, regression_details")
    .eq("status", "watching")
    .gte("watch_until", nowIso);
  if (error) throw new Error(`load active watches failed: ${error.message}`);

  const rows = (watches ?? []) as ActiveWatch[];
  for (const watch of rows) {
    // Load fix target_files to scope regression detection.
    const { data: fixRow } = await db
      .from("ai_fixes")
      .select("target_files")
      .eq("id", watch.fix_id)
      .maybeSingle();
    const targetFiles = ((fixRow?.target_files ?? []) as string[]) || [];

    // Find ai_issues opened after the merge referencing the same files.
    // Scope: source='eval' rows (target_file holds the suite, which is not a
    // file) won't match directly; we match on eval-source via target_symbol
    // and cqe_drift-source via target_file if it matches any tuple.
    //
    // Simplest broad check: count OPEN ai_issues with first_seen_at > merged_at
    // matching any of the target_files as target_symbol OR target_file.
    let regressions = 0;
    const hits: Record<string, unknown>[] = [];
    if (targetFiles.length > 0) {
      const { data: candidates, error: qErr } = await db
        .from("ai_issues")
        .select("id, source, target_file, target_symbol, category, description, first_seen_at")
        .gte("first_seen_at", watch.merged_at)
        .in("status", ["open", "fix_generated", "needs_human"]);
      if (!qErr && candidates) {
        for (const cand of candidates) {
          const tf = (cand as { target_file: string | null }).target_file;
          const ts = (cand as { target_symbol: string | null }).target_symbol;
          const matches =
            (tf && targetFiles.includes(tf)) ||
            (ts && targetFiles.some((p) => ts.includes(p)));
          if (matches) {
            regressions++;
            hits.push(cand as Record<string, unknown>);
          }
        }
      }
    }

    const patch: Record<string, unknown> = {
      heartbeat_at: nowIso,
      regressions_detected: regressions,
    };
    if (hits.length > 0) patch.regression_details = hits;
    await db.from("ai_post_merge_watch").update(patch).eq("id", watch.id);
  }

  return rows.length;
}


// ── 3. Finalize ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function finalizeExpiredWatches(db: any) {
  const nowIso = new Date().toISOString();
  const { data: expired, error } = await db
    .from("ai_post_merge_watch")
    .select("id, fix_id, regressions_detected, watch_until, merged_commit_sha")
    .eq("status", "watching")
    .lt("watch_until", nowIso);
  if (error) throw new Error(`load expired watches failed: ${error.message}`);

  let clean = 0;
  let reverted = 0;

  for (const w of (expired ?? []) as ActiveWatch[]) {
    const isClean = (w.regressions_detected ?? 0) === 0;
    const newStatus = isClean ? "clean" : "reverted";
    await db
      .from("ai_post_merge_watch")
      .update({ status: newStatus })
      .eq("id", w.id);

    await writeAuditEvent({
      actor: "cron:auto-heal-monitor",
      action: isClean ? "post_merge_watch_clean" : "post_merge_watch_reverted",
      target_table: "ai_post_merge_watch",
      target_id: w.id,
      before_state: { status: "watching" },
      after_state: {
        status: newStatus,
        regressions_detected: w.regressions_detected,
      },
      reason: isClean
        ? `48h window elapsed with zero regressions`
        : `${w.regressions_detected} regressions detected in watch window`,
    });

    if (!isClean) {
      // Flip the fix to reverted so the CMS sees it. Auto-revert PR
      // creation is deferred — humans must review which regression ties
      // to which PR and open the revert manually.
      await db
        .from("ai_fixes")
        .update({ status: "reverted" })
        .eq("id", w.fix_id);
      reverted++;
      logger.warn("[monitor] regression detected — fix reverted in state", {
        fix_id: w.fix_id,
        regressions: w.regressions_detected,
      });
    } else {
      clean++;
    }
  }

  return { clean, reverted };
}


// ── Helpers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadWatchWindowHours(db: any): Promise<number> {
  const { data } = await db
    .from("ai_auto_heal_config")
    .select("post_merge_clean_hours")
    .limit(1)
    .maybeSingle();
  const h = (data as { post_merge_clean_hours?: number } | null)?.post_merge_clean_hours;
  return typeof h === "number" && h > 0 ? h : 48;
}

function loadGhContext(): GhContext | null {
  const token = process.env.GH_BOT_TOKEN;
  const owner = process.env.GH_REPO_OWNER;
  const repo = process.env.GH_REPO_NAME;
  if (!token || !owner || !repo) return null;
  return { token, owner, repo };
}

function parsePrNumber(prUrl: string | null): number | null {
  if (!prUrl) return null;
  const m = prUrl.match(/\/pull\/(\d+)(?:[/#?].*)?$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

async function ghGetPr(
  gh: GhContext,
  prNumber: number,
): Promise<{
  state: string;
  merged: boolean;
  merged_at: string | null;
  merge_commit_sha: string | null;
}> {
  const res = await fetch(
    `https://api.github.com/repos/${gh.owner}/${gh.repo}/pulls/${prNumber}`,
    {
      headers: {
        Authorization: `Bearer ${gh.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`GET PR #${prNumber} failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    state: string;
    merged: boolean;
    merged_at: string | null;
    merge_commit_sha: string | null;
  };
  return data;
}
