/**
 * Eval baseline rollover — advances `ai_eval_baselines.active` after 3
 * consecutive green nightly runs. Invoked by the daily
 * `/api/v1/cron/advance-eval-baseline` endpoint (GH workflow triggered).
 *
 * Rules:
 *   - Only considers `trigger='nightly'` runs (not PR / manual / pre_deploy)
 *   - Requires the 3 most recent nightly runs to ALL have status='passed'
 *   - Advances to the commit_sha of the most recent (newest) green run
 *   - No-op if current active already matches that sha
 *   - Writes ai_auto_heal_audit row on every advance
 *
 * The `long_term_anchor` baseline is NEVER advanced here — that requires
 * manual super_admin promotion (Phase 5 feature).
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export type AdvanceAction =
  | "insufficient_history"
  | "streak_broken"
  | "no_sha_on_head"
  | "already_at_head"
  | "advanced";

export interface AdvanceResult {
  action: AdvanceAction;
  from_sha?: string | null;
  to_sha?: string | null;
  consecutive_green_nights?: number;
  reason?: string;
  checked_runs?: Array<{
    commit_sha: string | null;
    status: string;
    started_at: string;
  }>;
}

const REQUIRED_CONSECUTIVE = 3;

export async function advanceEvalBaseline(): Promise<AdvanceResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_* tables not in generated types until regen

  // ── Fetch last N nightlies ─────────────────────────────────────────
  const { data: runs, error: runsErr } = await db
    .from("ai_eval_runs")
    .select("id, commit_sha, status, started_at, finished_at")
    .eq("trigger", "nightly")
    .order("started_at", { ascending: false })
    .limit(REQUIRED_CONSECUTIVE);

  if (runsErr) throw new Error(`fetch nightlies failed: ${runsErr.message}`);

  const checked: Array<{
    commit_sha: string | null;
    status: string;
    started_at: string;
  }> = (runs ?? []).map(
    (r: { commit_sha: string | null; status: string; started_at: string }) => ({
      commit_sha: r.commit_sha,
      status: r.status,
      started_at: r.started_at,
    }),
  );

  if (!runs || runs.length < REQUIRED_CONSECUTIVE) {
    return {
      action: "insufficient_history",
      consecutive_green_nights: runs?.length ?? 0,
      reason: `only ${runs?.length ?? 0} of ${REQUIRED_CONSECUTIVE} required nightlies in history`,
      checked_runs: checked,
    };
  }

  const allGreen = runs.every((r: { status: string }) => r.status === "passed");
  if (!allGreen) {
    return {
      action: "streak_broken",
      reason: "one of last 3 nightlies not passed",
      checked_runs: checked,
    };
  }

  const headSha: string | null = runs[0].commit_sha;
  if (!headSha) {
    return {
      action: "no_sha_on_head",
      reason: "most recent nightly run has no commit_sha (CI misconfiguration?)",
      checked_runs: checked,
    };
  }

  // ── Compare against current active baseline ────────────────────────
  const { data: active, error: activeErr } = await db
    .from("ai_eval_baselines")
    .select("id, commit_sha, consecutive_green_nights")
    .eq("kind", "active")
    .eq("is_retired", false)
    .maybeSingle();

  if (activeErr) throw new Error(`fetch active baseline failed: ${activeErr.message}`);

  if (active?.commit_sha === headSha) {
    return {
      action: "already_at_head",
      to_sha: headSha,
      reason: "active baseline already points at the head of the green streak",
      checked_runs: checked,
    };
  }

  // ── Retire current active ──────────────────────────────────────────
  const now = new Date().toISOString();
  if (active) {
    const { error: retireErr } = await db
      .from("ai_eval_baselines")
      .update({ is_retired: true, retired_at: now })
      .eq("id", active.id);
    if (retireErr) {
      throw new Error(`retire previous active failed: ${retireErr.message}`);
    }
  }

  // ── Insert new active ──────────────────────────────────────────────
  const streakShas = runs
    .map((r: { commit_sha: string | null }) =>
      r.commit_sha ? r.commit_sha.slice(0, 7) : "no-sha",
    )
    .join(", ");
  const { data: newBaseline, error: insertErr } = await db
    .from("ai_eval_baselines")
    .insert({
      kind: "active",
      commit_sha: headSha,
      promoted_by: "cron:advance_eval_baseline",
      consecutive_green_nights: REQUIRED_CONSECUTIVE,
      notes: `Auto-advanced after ${REQUIRED_CONSECUTIVE} consecutive green nightlies: ${streakShas}`,
    })
    .select()
    .single();

  if (insertErr || !newBaseline) {
    // Best-effort rollback: un-retire the previous active so we don't end
    // up with zero active baselines.
    if (active) {
      await db
        .from("ai_eval_baselines")
        .update({ is_retired: false, retired_at: null })
        .eq("id", active.id);
    }
    throw new Error(
      `insert new active failed: ${insertErr?.message ?? "no row returned"}`,
    );
  }

  // ── Audit ──────────────────────────────────────────────────────────
  await db.from("ai_auto_heal_audit").insert({
    actor: "cron:advance_eval_baseline",
    action: "baseline_advance",
    target_table: "ai_eval_baselines",
    target_id: newBaseline.id,
    before_state: { active_sha: active?.commit_sha ?? null },
    after_state: {
      active_sha: headSha,
      consecutive_green_nights: REQUIRED_CONSECUTIVE,
    },
    reason: `3 consecutive green nightlies: ${streakShas}`,
  });

  logger.info("[advanceEvalBaseline] advanced", {
    from: active?.commit_sha ?? null,
    to: headSha,
    checked: checked.length,
  });

  return {
    action: "advanced",
    from_sha: active?.commit_sha ?? null,
    to_sha: headSha,
    consecutive_green_nights: REQUIRED_CONSECUTIVE,
    checked_runs: checked,
  };
}
