"""
Tomo AI Chat — Eval Result Persister

Writes eval runs + per-scenario results to Supabase (`ai_eval_runs`,
`ai_eval_results`). Service-role client (bypasses RLS). Best-effort by
default — the eval itself still runs and reports if Supabase is
unreachable, unless --persist-required is set.

Populated by runner.py when `--persist` is passed. Surfaces in the CMS
Eval System tab once rows land.

Convention for suite runners wanting to attach extra context:
  EvalResult.details["expected"]     -> JSONB expected
  EvalResult.details["actual"]       -> JSONB actual
  EvalResult.details["latency_ms"]   -> int latency
  EvalResult.details["cost_usd"]     -> float cost
  EvalResult.details["model_used"]   -> str model id
  EvalResult.details["probable_target_file"]   -> str
  EvalResult.details["probable_target_symbol"] -> str
Missing keys simply land as NULL.
"""

from __future__ import annotations

import logging
import os
import subprocess
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("tomo-evals.persister")


# ── Trigger detection ────────────────────────────────────────────────

VALID_TRIGGERS = {"pr", "nightly", "pre_deploy", "manual", "auto_heal_reeval"}


def detect_trigger(explicit: Optional[str] = None) -> str:
    """
    Resolve the run trigger. Explicit flag wins. Otherwise infer from
    GitHub Actions env. Default 'manual'.
    """
    if explicit:
        if explicit not in VALID_TRIGGERS:
            raise ValueError(
                f"Invalid trigger {explicit!r}. Must be one of: {sorted(VALID_TRIGGERS)}"
            )
        return explicit
    if os.environ.get("GITHUB_ACTIONS") == "true":
        event = os.environ.get("GITHUB_EVENT_NAME", "")
        if event == "pull_request":
            return "pr"
        if event == "schedule":
            return "nightly"
        if event == "workflow_dispatch":
            return "manual"
    return "manual"


def detect_commit_sha() -> Optional[str]:
    """GITHUB_SHA when in CI; local git HEAD as a fallback; None if neither."""
    sha = os.environ.get("GITHUB_SHA")
    if sha:
        return sha
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            timeout=3,
        )
        return result.stdout.strip() or None
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return None


def detect_branch() -> Optional[str]:
    """GITHUB_REF_NAME when in CI; local git branch as a fallback; None otherwise."""
    ref = os.environ.get("GITHUB_REF_NAME")
    if ref:
        return ref
    # GitHub sets GITHUB_HEAD_REF on pull_request events (source branch name)
    head_ref = os.environ.get("GITHUB_HEAD_REF")
    if head_ref:
        return head_ref
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            timeout=3,
        )
        branch = result.stdout.strip()
        return branch if branch and branch != "HEAD" else None
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return None


# ── Persister ────────────────────────────────────────────────────────

class PersistError(RuntimeError):
    """Raised when --persist-required is set and persist fails."""


class SupabaseEvalPersister:
    """
    Writes eval runs + results to Supabase. Lazy-inits the client; logs
    and swallows errors by default; raises when `required=True`.
    """

    def __init__(self, required: bool = False):
        self.required = required
        self._client = self._build_client()

    @property
    def enabled(self) -> bool:
        return self._client is not None

    def _build_client(self):
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not (url and key):
            msg = (
                "SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY not set; "
                "eval persistence disabled"
            )
            if self.required:
                raise PersistError(msg)
            logger.warning(msg)
            return None
        try:
            from supabase import create_client
            return create_client(url, key)
        except Exception as e:
            msg = f"Supabase client init failed: {e}"
            if self.required:
                raise PersistError(msg) from e
            logger.error(msg)
            return None

    def start_run(
        self,
        trigger: str,
        suite_set: list[str],
        commit_sha: Optional[str] = None,
        branch: Optional[str] = None,
        pipeline_version: Optional[str] = None,
    ) -> Optional[str]:
        """Insert the ai_eval_runs header row. Returns run_id or None."""
        if not self.enabled:
            return None
        try:
            payload = {
                "trigger": trigger,
                "suite_set": suite_set,
                "commit_sha": commit_sha,
                "branch": branch,
                "pipeline_version": pipeline_version,
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat(),
            }
            result = self._client.table("ai_eval_runs").insert(payload).execute()
            run_id = result.data[0]["id"] if result.data else None
            if run_id:
                logger.info(f"Eval run persisted: run_id={run_id} trigger={trigger}")
            return run_id
        except Exception as e:
            msg = f"start_run failed: {e}"
            if self.required:
                raise PersistError(msg) from e
            logger.error(msg)
            return None

    def persist_result(
        self,
        run_id: Optional[str],
        suite: str,
        scenario_id: str,
        passed: bool,
        reason: str = "",
        details: Optional[dict[str, Any]] = None,
    ) -> Optional[str]:
        """
        Insert one ai_eval_results row. Returns the inserted UUID (used as
        source_ref on downstream ai_issues upserts) or None when persist is
        disabled / fails.
        """
        if not run_id or not self.enabled:
            return None
        details = details or {}
        try:
            payload = {
                "run_id": run_id,
                "suite": suite,
                "scenario_id": scenario_id or "(unknown)",
                "status": "pass" if passed else "fail",
                "expected": details.get("expected"),
                "actual": details.get("actual"),
                "latency_ms": details.get("latency_ms"),
                "cost_usd": details.get("cost_usd"),
                "model_used": details.get("model_used"),
                "probable_target_file": details.get("probable_target_file"),
                "probable_target_symbol": details.get("probable_target_symbol"),
                "failure_reason": reason if not passed else None,
            }
            result = self._client.table("ai_eval_results").insert(payload).execute()
            return result.data[0]["id"] if result.data else None
        except Exception as e:
            msg = f"persist_result failed for {suite}/{scenario_id}: {e}"
            if self.required:
                raise PersistError(msg) from e
            logger.error(msg)
            return None

    # ── Eval → ai_issues upsert (Phase 3) ───────────────────────────

    # Suites that produce p1_safety issues. Rule judges in qualityScorer
    # + safety_live (Phase 4) should be added here as they ship.
    _SAFETY_SUITES = frozenset({"safety", "safety_live"})

    # Active statuses: a new fail on an issue in any of these bumps the
    # existing row instead of creating a duplicate.
    _ACTIVE_STATUSES = ["open", "fix_generated", "needs_human"]

    def upsert_issue_for_failed_scenario(
        self,
        suite: str,
        scenario_id: str,
        reason: str,
        source_ref: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        """
        Record a failing scenario as an ai_issues row so it surfaces in the
        CMS Issues & Fixes tab and feeds the Phase 5 applier.

        Dedup: one open ai_issues row per (source='eval', target_file=suite,
        target_symbol=scenario_id). On subsequent failures we bump
        occurrence_count + last_seen_at + refresh source_ref. A fail after
        the issue was marked 'resolved' creates a NEW row (treated as a
        fresh incident, not a silent recurrence).
        """
        if not self.enabled:
            return

        severity_class = (
            "p1_safety" if suite in self._SAFETY_SUITES else "p2_quality"
        )
        now = datetime.now(timezone.utc).isoformat()
        details = details or {}

        try:
            # ── Look for an active open issue for this scenario ──
            existing = (
                self._client.table("ai_issues")
                .select("id, occurrence_count")
                .eq("source", "eval")
                .eq("target_file", suite)
                .eq("target_symbol", scenario_id)
                .in_("status", self._ACTIVE_STATUSES)
                .limit(1)
                .execute()
            )

            if existing.data:
                issue_id = existing.data[0]["id"]
                current_count = existing.data[0].get("occurrence_count") or 1
                update_payload: dict[str, Any] = {
                    "occurrence_count": current_count + 1,
                    "last_seen_at": now,
                }
                if source_ref:
                    update_payload["source_ref"] = source_ref
                self._client.table("ai_issues").update(update_payload).eq(
                    "id", issue_id
                ).execute()
                logger.info(
                    f"ai_issues bumped: suite={suite} scenario={scenario_id[:40]} "
                    f"occurrences={current_count + 1}"
                )
                return

            # ── Insert new issue row ──
            # Legacy trace-source fields (severity, affected_count, pattern_summary)
            # kept populated for backward compat with the CMS Issues tab render
            # that reads both vocabularies.
            insert_payload: dict[str, Any] = {
                "source": "eval",
                "source_ref": source_ref,
                "category": f"eval_{suite}_failure",
                "severity": "high",  # legacy vocab — trace-compatible
                "severity_class": severity_class,
                "target_file": suite,
                "target_symbol": scenario_id,
                "description": f"Eval {suite} scenario failed: {reason[:400]}",
                "evidence": details,
                "status": "open",
                "first_seen_at": now,
                "last_seen_at": now,
                "occurrence_count": 1,
                # Trace-compat fields that the CMS Issues page still reads
                "pattern_summary": f"Eval {suite} scenario failed: {reason[:200]}",
                "affected_count": 1,
            }
            self._client.table("ai_issues").insert(insert_payload).execute()
            logger.info(
                f"ai_issues opened: suite={suite} scenario={scenario_id[:40]} "
                f"severity_class={severity_class}"
            )
        except Exception as e:
            msg = f"upsert_issue_for_failed_scenario failed for {suite}/{scenario_id}: {e}"
            if self.required:
                raise PersistError(msg) from e
            logger.error(msg)

    def finish_run(
        self,
        run_id: Optional[str],
        totals: dict[str, int],
        cost_usd_total: float = 0.0,
        status: str = "passed",
    ) -> None:
        """
        Update the ai_eval_runs header with final counts + status.
        totals: {"total", "passed", "failed", "errored"}
        status: 'passed' | 'failed' | 'errored' | 'aborted'
        """
        if not run_id or not self.enabled:
            return
        try:
            payload = {
                "total": totals.get("total", 0),
                "passed": totals.get("passed", 0),
                "failed": totals.get("failed", 0),
                "errored": totals.get("errored", 0),
                "cost_usd_total": cost_usd_total,
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "status": status,
            }
            self._client.table("ai_eval_runs").update(payload).eq("id", run_id).execute()
            logger.info(
                f"Eval run finalized: run_id={run_id} status={status} "
                f"passed={payload['passed']}/{payload['total']}"
            )
        except Exception as e:
            msg = f"finish_run failed: {e}"
            if self.required:
                raise PersistError(msg) from e
            logger.error(msg)
