/**
 * Auto-heal applier.
 *
 * Reads proposed ai_fixes rows authored by cqe-autorepair, applies their
 * patch via services/autoHeal/transform.ts, creates a branch, commits the
 * change via the GitHub Contents API, opens a PR, and updates the fix
 * lifecycle.
 *
 * Design choices:
 *   - Runs on the Railway backend (no local git clone). Uses the GitHub
 *     REST API for all file + branch + PR operations. Matches the
 *     maybeOpenPr pattern already in services/quality/autoRepair.ts.
 *   - Kill-switch: respects ai_auto_heal_config.enabled. Short-circuit
 *     returns when disabled.
 *   - Blocked paths: every target file is checked against blocked_paths
 *     BEFORE any mutation. Bypass is impossible without DB write.
 *   - Rate limits: max_fixes_per_day (per run), max_fixes_per_file_per_week.
 *   - PR label: 'auto-heal-pending-review'. Post-merge monitor and CMS UI
 *     filter on this label to identify auto-heal PRs.
 *   - Phase 5 is informational — re-eval gate fires via the existing PR
 *     CI (routing-live-eval job from Phase 1). PR merge decision stays
 *     with the human reviewer; no auto-merge.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { writeAuditEvent } from "@/lib/autoHealAudit";
import { applyPatchToFile, type PatchSpec } from "./transform";

// ── Types ────────────────────────────────────────────────────────────

interface FixRow {
  id: string;
  issue_id: string;
  author: string;
  diff: string | null;
  target_files: string[] | null;
  rationale: string | null;
  status: string;
  title?: string | null;
  description?: string | null;
}

interface AutoHealConfig {
  enabled: boolean;
  max_fixes_per_day: number;
  max_fixes_per_file_per_week: number;
  cooldown_minutes_after_revert: number;
  blocked_paths: string[];
}

export type ApplyOutcome =
  | "skipped_disabled"
  | "skipped_no_config"
  | "rate_limited"
  | "blocked_path"
  | "transform_failed"
  | "gh_api_failed"
  | "pr_opened"
  | "no_valid_patch";

export interface ApplyFixResult {
  fixId: string;
  outcome: ApplyOutcome;
  branchName?: string;
  prUrl?: string;
  reason?: string;
  filesTouched?: string[];
}

export interface ApplierRunResult {
  totalCandidates: number;
  applied: number;
  skipped: number;
  errors: number;
  perFix: ApplyFixResult[];
}


// ── Public entry ─────────────────────────────────────────────────────

export async function runApplierOnce(): Promise<ApplierRunResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_* not in generated types until regen

  // 1. Kill-switch + config load
  const config = await loadConfig(db);
  if (!config) {
    logger.warn("[applier] config row missing — skipping");
    return zeroResult({ skipped: 1 });
  }
  if (!config.enabled) {
    logger.info("[applier] skipped — ai_auto_heal_config.enabled=false");
    return zeroResult({ skipped: 1 });
  }

  // 2. GH env check — applier is inert without push credentials
  const ghCtx = loadGhContext();
  if (!ghCtx) {
    logger.warn("[applier] skipped — GH_BOT_TOKEN + GH_REPO_OWNER + GH_REPO_NAME must be set");
    return zeroResult({ skipped: 1 });
  }

  // 3. Select candidate fixes, capped by daily limit
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: appliedTodayCount, error: countErr } = await db
    .from("ai_fixes")
    .select("id", { count: "exact", head: true })
    .gte("applied_at", todayStart.toISOString());
  if (countErr) {
    logger.error("[applier] daily count failed", { error: countErr.message });
    return zeroResult({ errors: 1 });
  }
  const remainingBudget = Math.max(
    0,
    config.max_fixes_per_day - (typeof appliedTodayCount === "number" ? appliedTodayCount : 0),
  );
  if (remainingBudget === 0) {
    logger.info("[applier] daily budget exhausted", {
      max: config.max_fixes_per_day,
    });
    return zeroResult({ skipped: 1 });
  }

  const { data: proposed, error: loadErr } = await db
    .from("ai_fixes")
    .select("id, issue_id, author, diff, target_files, rationale, status, title, description")
    .eq("author", "cqe-autorepair")
    .eq("status", "proposed")
    .order("created_at", { ascending: true })
    .limit(remainingBudget);
  if (loadErr) {
    logger.error("[applier] proposed load failed", { error: loadErr.message });
    return zeroResult({ errors: 1 });
  }
  const candidates = (proposed ?? []) as FixRow[];
  logger.info("[applier] candidates loaded", { count: candidates.length });

  // 4. Per-fix apply
  const perFix: ApplyFixResult[] = [];
  for (const fix of candidates) {
    perFix.push(await applyOne(db, fix, config, ghCtx));
  }

  return {
    totalCandidates: candidates.length,
    applied: perFix.filter((p) => p.outcome === "pr_opened").length,
    skipped: perFix.filter((p) =>
      ["skipped_disabled", "rate_limited", "blocked_path", "no_valid_patch"].includes(p.outcome),
    ).length,
    errors: perFix.filter((p) =>
      ["transform_failed", "gh_api_failed"].includes(p.outcome),
    ).length,
    perFix,
  };
}


// ── Per-fix apply ────────────────────────────────────────────────────

interface GhContext {
  owner: string;
  repo: string;
  baseBranch: string;
  token: string;
}

async function applyOne(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  fix: FixRow,
  config: AutoHealConfig,
  gh: GhContext,
): Promise<ApplyFixResult> {
  const targetFiles = fix.target_files ?? [];
  if (targetFiles.length === 0) {
    await markFixStatus(db, fix.id, "applied_wrong_location", "no target_files");
    return {
      fixId: fix.id,
      outcome: "no_valid_patch",
      reason: "fix row has no target_files",
    };
  }

  // Blocked-path check — enforced at applier level, not relying only on config
  // (defense in depth per adversarial C1).
  for (const path of targetFiles) {
    if (isBlockedPath(path, config.blocked_paths)) {
      await markFixStatus(db, fix.id, "rejected", `target ${path} matches blocked_paths`);
      await writeAuditEvent({
        actor: "cron:auto-heal-apply",
        action: "applier_rejected_blocked_path",
        target_table: "ai_fixes",
        target_id: fix.id,
        before_state: { status: fix.status },
        after_state: { status: "rejected" },
        reason: `blocked_path hit: ${path}`,
      });
      return {
        fixId: fix.id,
        outcome: "blocked_path",
        reason: `target ${path} matches blocked_paths`,
      };
    }
  }

  // Per-file-per-week rate limit
  const weekStart = new Date();
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  for (const path of targetFiles) {
    const { count, error } = await db
      .from("ai_fixes")
      .select("id", { count: "exact", head: true })
      .gte("applied_at", weekStart.toISOString())
      .contains("target_files", [path]);
    if (error) continue; // best-effort; don't block on telemetry failure
    if (
      typeof count === "number" &&
      count >= config.max_fixes_per_file_per_week
    ) {
      await markFixStatus(
        db,
        fix.id,
        "awaiting_human_approval",
        `per-file-per-week limit hit for ${path}`,
      );
      return {
        fixId: fix.id,
        outcome: "rate_limited",
        reason: `${path} hit ${config.max_fixes_per_file_per_week}/week cap`,
      };
    }
  }

  // Parse patch spec from ai_fixes.diff (set by cqe-autorepair to JSON.stringify(patch))
  let patchSpec: PatchSpec;
  try {
    if (!fix.diff) throw new Error("diff is empty");
    const parsed = JSON.parse(fix.diff);
    // Accept either the outer ProposedPatch or the inner patch_spec
    patchSpec = (parsed.details ?? parsed) as PatchSpec;
  } catch (e) {
    await markFixStatus(
      db,
      fix.id,
      "applied_wrong_location",
      `diff parse failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      fixId: fix.id,
      outcome: "no_valid_patch",
      reason: "diff is not parseable JSON",
    };
  }

  // Mark as applying BEFORE any GH calls so concurrent runs don't double-fire
  await markFixStatus(db, fix.id, "applying", undefined);

  const branchName = `auto-heal/${fix.issue_id.slice(0, 8)}-${fix.id.slice(0, 8)}`;

  // ── GH pipeline: create branch, write files, open PR ──
  try {
    const baseSha = await ghGetBranchSha(gh, gh.baseBranch);
    await ghCreateBranch(gh, branchName, baseSha);

    const fileEdits: { path: string; before: string; after: string; symbol: string }[] = [];
    for (const path of targetFiles) {
      const { content, sha } = await ghGetFile(gh, path, gh.baseBranch);
      const result = applyPatchToFile({
        fileContent: content,
        filePath: path,
        patchSpec,
      });
      if (!result.ok) {
        throw new Error(`transform failed for ${path}: ${result.reason}`);
      }
      await ghPutFile(gh, {
        path,
        branch: branchName,
        newContent: result.newContent,
        currentSha: sha,
        commitMessage: `auto-heal: ${patchSpec.type} ${result.symbol} ${result.oldValue}→${result.newValue}`,
      });
      fileEdits.push({
        path,
        before: result.before,
        after: result.after,
        symbol: result.symbol,
      });
    }

    const prBody = buildPrBody({ fix, patchSpec, fileEdits });
    const prTitle = fix.title ?? `[auto-heal] ${patchSpec.type} — ${patchSpec.symbol ?? "(unnamed)"}`;
    const { prUrl, prNumber } = await ghOpenPr(gh, {
      title: prTitle,
      body: prBody,
      head: branchName,
      base: gh.baseBranch,
    });

    // Label so the CMS + post-merge monitor can filter auto-heal PRs.
    // 'auto-heal-pending-review' signals: the system opened this PR; human
    // review + CI are the gates. Once PR CI re-eval passes a human may add
    // 'auto-heal-approved' to signal "safe to merge"; Phase 5 MVP doesn't
    // auto-add that label.
    await ghAddLabels(gh, prNumber, ["auto-heal", "auto-heal-pending-review"]);

    await db
      .from("ai_fixes")
      .update({
        status: "auto_approved_pr_open",
        branch_name: branchName,
        pr_url: prUrl,
        applied_at: new Date().toISOString(),
        applied_by: "cron:auto-heal-apply",
      })
      .eq("id", fix.id);

    // Flip the parent issue to fix_applied — the fix has materialized as
    // a reviewable PR.
    await db
      .from("ai_issues")
      .update({ status: "fix_applied" })
      .eq("id", fix.issue_id);

    await writeAuditEvent({
      actor: "cron:auto-heal-apply",
      action: "auto_heal_pr_opened",
      target_table: "ai_fixes",
      target_id: fix.id,
      before_state: { status: fix.status },
      after_state: {
        status: "auto_approved_pr_open",
        branch_name: branchName,
        pr_url: prUrl,
      },
      reason: `${fileEdits.length} file(s) edited; ${patchSpec.type}`,
    });

    logger.info("[applier] PR opened", {
      fix_id: fix.id,
      branch: branchName,
      pr: prUrl,
      files: fileEdits.map((e) => e.path),
    });

    return {
      fixId: fix.id,
      outcome: "pr_opened",
      branchName,
      prUrl,
      filesTouched: fileEdits.map((e) => e.path),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[applier] failed", { fix_id: fix.id, error: msg });

    // Best-effort cleanup — delete the branch we created if it exists
    try {
      await ghDeleteBranch(gh, branchName);
    } catch {
      // swallow — cleanup is best-effort
    }

    const outcome: ApplyOutcome = msg.startsWith("transform failed")
      ? "transform_failed"
      : "gh_api_failed";

    await markFixStatus(db, fix.id, "applied_wrong_location", msg.slice(0, 300));
    await writeAuditEvent({
      actor: "cron:auto-heal-apply",
      action: "applier_failed",
      target_table: "ai_fixes",
      target_id: fix.id,
      before_state: { status: fix.status },
      after_state: { status: "applied_wrong_location" },
      reason: msg.slice(0, 400),
    });
    return {
      fixId: fix.id,
      outcome,
      reason: msg,
    };
  }
}


// ── Config + status helpers ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadConfig(db: any): Promise<AutoHealConfig | null> {
  const { data, error } = await db
    .from("ai_auto_heal_config")
    .select(
      "enabled, max_fixes_per_day, max_fixes_per_file_per_week, cooldown_minutes_after_revert, blocked_paths",
    )
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as AutoHealConfig;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markFixStatus(db: any, fixId: string, status: string, rationaleAppend?: string): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (rationaleAppend) {
    patch.rationale = `[applier] ${rationaleAppend}`;
  }
  await db.from("ai_fixes").update(patch).eq("id", fixId);
}

function loadGhContext(): GhContext | null {
  const token = process.env.GH_BOT_TOKEN;
  const owner = process.env.GH_REPO_OWNER;
  const repo = process.env.GH_REPO_NAME;
  const baseBranch = process.env.GH_BASE_BRANCH ?? "main";
  if (!token || !owner || !repo) return null;
  return { token, owner, repo, baseBranch };
}


// ── Blocked path matching ────────────────────────────────────────────

export function isBlockedPath(filePath: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (likeMatches(filePath, p)) return true;
  }
  return false;
}

function likeMatches(input: string, pattern: string): boolean {
  // Postgres LIKE → regex. '%' -> '.*'. Other chars escaped.
  const re = new RegExp(
    "^" +
      pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/%/g, ".*") +
      "$",
  );
  return re.test(input);
}


// ── GitHub API ───────────────────────────────────────────────────────

const GH_API = "https://api.github.com";

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghGetBranchSha(gh: GhContext, branch: string): Promise<string> {
  const res = await fetch(
    `${GH_API}/repos/${gh.owner}/${gh.repo}/git/refs/heads/${branch}`,
    { headers: ghHeaders(gh.token) },
  );
  if (!res.ok) {
    throw new Error(`get branch ${branch} failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { object: { sha: string } };
  return data.object.sha;
}

async function ghCreateBranch(
  gh: GhContext,
  newBranch: string,
  fromSha: string,
): Promise<void> {
  const res = await fetch(
    `${GH_API}/repos/${gh.owner}/${gh.repo}/git/refs`,
    {
      method: "POST",
      headers: ghHeaders(gh.token),
      body: JSON.stringify({
        ref: `refs/heads/${newBranch}`,
        sha: fromSha,
      }),
    },
  );
  if (!res.ok && res.status !== 422) {
    // 422 = already exists; we treat that as OK because subsequent writes
    // to the branch will fail explicitly if the branch is in a bad state.
    throw new Error(`create branch ${newBranch} failed: ${res.status} ${await res.text()}`);
  }
}

async function ghGetFile(
  gh: GhContext,
  path: string,
  ref: string,
): Promise<{ content: string; sha: string }> {
  const res = await fetch(
    `${GH_API}/repos/${gh.owner}/${gh.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
    { headers: ghHeaders(gh.token) },
  );
  if (!res.ok) {
    throw new Error(`get file ${path} failed: ${res.status}`);
  }
  const data = (await res.json()) as { content: string; sha: string; encoding: string };
  if (data.encoding !== "base64") {
    throw new Error(`unexpected encoding ${data.encoding} for ${path}`);
  }
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { content, sha: data.sha };
}

async function ghPutFile(
  gh: GhContext,
  args: {
    path: string;
    branch: string;
    newContent: string;
    currentSha: string;
    commitMessage: string;
  },
): Promise<void> {
  const res = await fetch(
    `${GH_API}/repos/${gh.owner}/${gh.repo}/contents/${encodeURIComponent(args.path)}`,
    {
      method: "PUT",
      headers: ghHeaders(gh.token),
      body: JSON.stringify({
        message: args.commitMessage,
        content: Buffer.from(args.newContent, "utf-8").toString("base64"),
        sha: args.currentSha,
        branch: args.branch,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`put file ${args.path} failed: ${res.status} ${await res.text()}`);
  }
}

async function ghOpenPr(
  gh: GhContext,
  args: { title: string; body: string; head: string; base: string },
): Promise<{ prUrl: string; prNumber: number }> {
  const res = await fetch(
    `${GH_API}/repos/${gh.owner}/${gh.repo}/pulls`,
    {
      method: "POST",
      headers: ghHeaders(gh.token),
      body: JSON.stringify(args),
    },
  );
  if (!res.ok) {
    throw new Error(`open PR failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { html_url: string; number: number };
  return { prUrl: data.html_url, prNumber: data.number };
}

async function ghAddLabels(
  gh: GhContext,
  prNumber: number,
  labels: string[],
): Promise<void> {
  const res = await fetch(
    `${GH_API}/repos/${gh.owner}/${gh.repo}/issues/${prNumber}/labels`,
    {
      method: "POST",
      headers: ghHeaders(gh.token),
      body: JSON.stringify({ labels }),
    },
  );
  if (!res.ok) {
    // Non-fatal — the PR is open; labels are a CMS-filter convenience.
    logger.warn("[applier] add labels failed", {
      status: res.status,
      labels,
    });
  }
}

async function ghDeleteBranch(gh: GhContext, branch: string): Promise<void> {
  await fetch(
    `${GH_API}/repos/${gh.owner}/${gh.repo}/git/refs/heads/${branch}`,
    {
      method: "DELETE",
      headers: ghHeaders(gh.token),
    },
  );
}


// ── PR body builder ──────────────────────────────────────────────────

function buildPrBody(args: {
  fix: FixRow;
  patchSpec: PatchSpec;
  fileEdits: { path: string; before: string; after: string; symbol: string }[];
}): string {
  const { fix, patchSpec, fileEdits } = args;
  const lines = [
    "## Auto-heal patch",
    "",
    `**Source**: CQE auto-repair pattern match`,
    `**Fix row**: \`${fix.id}\``,
    `**Issue**: \`${fix.issue_id}\``,
    `**Patch type**: \`${patchSpec.type}\``,
    "",
    "### Changes",
    "",
    ...fileEdits.map(
      (e) =>
        `- \`${e.path}\` — \`${e.symbol}\`\n  - Before: \`${e.before}\`\n  - After: \`${e.after}\``,
    ),
    "",
    "### Rationale",
    "",
    fix.rationale ?? fix.description ?? "_no rationale provided_",
    "",
    "---",
    "",
    "_Opened by `cron:auto-heal-apply`. Re-eval runs via the PR's CI — review the `routing-live-eval` job output before merging. No auto-merge._",
  ];
  return lines.join("\n");
}


// ── Misc ─────────────────────────────────────────────────────────────

function zeroResult(extras: Partial<ApplierRunResult>): ApplierRunResult {
  return {
    totalCandidates: 0,
    applied: 0,
    skipped: 0,
    errors: 0,
    perFix: [],
    ...extras,
  };
}
