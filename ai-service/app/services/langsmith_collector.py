"""
Tomo AI Service — LangSmith Collector (Layer 1: 6-hour acute pulse)

Reads recent traces from local ai_trace_log table (written by persist_node),
detects 9 issue patterns, upserts into ai_issues with three-question overlap logic:
  Q1: Record exists? → UPDATE, don't duplicate
  Q2: Status is fix_applied/resolved? → increment recurrence_count
  Q3: Affected_count growing fast? → auto-escalate severity

Data source: ai_trace_log (local Supabase) — NOT LangSmith REST API.
This decouples the feedback loop from LangSmith API read access (which
requires Plus plan). LangSmith traces are still created for debugging
via the UI, but automated monitoring runs off local data.

9 detectors:
  1. routing_miss — fallthrough with no intent match
  2. verbose_response — verbose validation flag
  3. zero_tool_response — full AI path, zero tools called
  4. cost_spike — avg cost above $0.010 target
  5. latency_spike — >25% of requests slow
  6. stale_checkin_high_risk — RED risk + stale check-in (>7 days)
  7. danger_zone_no_escalation — ACWR danger + RED + no gate fired
  8. rag_empty_chunks — entities found but zero chunks returned
  9. capsule_cost_leak — check-in classified but routed to expensive full AI
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.config import get_settings
from app.db.supabase import get_pool

logger = logging.getLogger("tomo-ai.langsmith_collector")

# ── Column mapping for ai_trace_log rows ─────────────────────────────────
TRACE_COLS = [
    "id", "created_at", "request_id", "user_id", "session_id", "message",
    "path_type", "agent_type", "classification_layer", "intent_id",
    "routing_confidence", "tool_count", "tool_names",
    "total_cost_usd", "total_tokens", "latency_ms",
    "validation_passed", "validation_flags",
    "phv_gate_fired", "crisis_detected", "ped_detected", "medical_warning",
    "rag_used", "rag_entity_count", "rag_chunk_count",
    "rag_cost_usd", "rag_latency_ms",
    "sport", "age_band", "phv_stage",
    "readiness_score", "readiness_rag", "injury_risk",
    "acwr", "acwr_bucket", "data_confidence_score",
    "checkin_staleness_days",
    "cost_bucket", "latency_bucket", "confidence_bucket", "tool_bucket",
]


async def fetch_recent_runs(hours: int = 6) -> list[dict]:
    """
    Read recent traces from local ai_trace_log table.
    Returns list of dicts with all metadata fields — same shape the
    detectors expect, but sourced from our own DB instead of LangSmith API.
    """
    pool = get_pool()
    if not pool:
        logger.error("No DB pool available for trace fetch")
        return []

    start_time = datetime.now(timezone.utc) - timedelta(hours=hours)

    try:
        async with pool.connection() as conn:
            result = await conn.execute(
                f"SELECT {', '.join(TRACE_COLS)} FROM ai_trace_log "
                "WHERE created_at >= %s ORDER BY created_at DESC LIMIT 500",
                (start_time,),
            )
            rows = await result.fetchall()

        runs = [dict(zip(TRACE_COLS, row)) for row in rows]
        logger.info(f"Fetched {len(runs)} traces from ai_trace_log (last {hours}h)")
        return runs

    except Exception as e:
        logger.error(f"ai_trace_log fetch failed: {e}")
        return []


def _meta(run: dict, key: str, default: Any = None) -> Any:
    """Safely extract a metadata field from a trace log row."""
    val = run.get(key)
    if val is not None:
        return val
    return default


def detect_issues(runs: list[dict]) -> list[dict]:
    """
    Scan runs for 9 known issue patterns.
    Returns list of issue dicts ready to upsert into ai_issues.
    """
    if not runs:
        return []

    now = datetime.now(timezone.utc)
    week_start = (now.date() - timedelta(days=now.weekday())).isoformat()
    total = max(len(runs), 1)
    issues: list[dict] = []

    # ── 1. Routing misses ────────────────────────────────────────────
    fallthrough = [r for r in runs if _meta(r, "classification_layer") == "fallthrough"]
    if len(fallthrough) > 5:
        msg_counts: dict[str, int] = defaultdict(int)
        for r in fallthrough:
            msg = (r.get("inputs") or {}).get("message", "")[:80]
            if msg:
                msg_counts[msg] += 1
        top = sorted(msg_counts.items(), key=lambda x: -x[1])[:5]
        issues.append({
            "week_start": week_start,
            "issue_type": "routing_miss",
            "severity": "high" if len(fallthrough) > 20 else "medium",
            "affected_count": len(fallthrough),
            "sample_run_ids": [r.get("id", "") for r in fallthrough[:5]],
            "pattern_summary": (
                f"{len(fallthrough)} requests fell through to full AI with no intent match. "
                f"Top unmatched: {[m for m, _ in top[:3]]}"
            ),
            "metadata": {
                "fallthrough_rate_pct": round(len(fallthrough) / total * 100, 1),
                "top_unmatched_messages": dict(top),
                "total_runs_in_window": len(runs),
            },
        })

    # ── 2. Verbose responses ─────────────────────────────────────────
    verbose = [r for r in runs if "verbose_response" in (_meta(r, "validation_flags") or [])]
    if len(verbose) > 3:
        by_agent: dict[str, int] = defaultdict(int)
        for r in verbose:
            by_agent[_meta(r, "agent_type", "unknown")] += 1
        issues.append({
            "week_start": week_start,
            "issue_type": "verbose_response",
            "severity": "medium",
            "affected_count": len(verbose),
            "sample_run_ids": [r.get("id", "") for r in verbose[:5]],
            "pattern_summary": (
                f"{len(verbose)} responses flagged as verbose "
                f"({round(len(verbose) / total * 100, 1)}% of traffic). "
                f"By agent: {dict(by_agent)}"
            ),
            "metadata": {
                "verbose_rate_pct": round(len(verbose) / total * 100, 1),
                "by_agent": dict(by_agent),
            },
        })

    # ── 3. Zero-tool full_ai responses ───────────────────────────────
    zero_tool = [
        r for r in runs
        if _meta(r, "path_type") == "full_ai" and _meta(r, "tool_count", 1) == 0
    ]
    if len(zero_tool) > 3:
        by_intent: dict[str, int] = defaultdict(int)
        for r in zero_tool:
            by_intent[_meta(r, "intent_id", "unknown")] += 1
        issues.append({
            "week_start": week_start,
            "issue_type": "zero_tool_response",
            "severity": "high",
            "affected_count": len(zero_tool),
            "sample_run_ids": [r.get("id", "") for r in zero_tool[:5]],
            "pattern_summary": (
                f"{len(zero_tool)} full_ai requests returned responses without calling "
                f"any tools — generic answers ignoring athlete data. "
                f"By intent: {dict(by_intent)}"
            ),
            "metadata": {
                "zero_tool_rate_pct": round(len(zero_tool) / total * 100, 1),
                "by_intent": dict(by_intent),
            },
        })

    # ── 4. Cost spike ────────────────────────────────────────────────
    costs = [_meta(r, "total_cost_usd", 0) for r in runs]
    avg_cost = sum(costs) / total
    expensive = [r for r in runs if _meta(r, "cost_bucket") == "expensive"]
    if avg_cost > 0.010:
        issues.append({
            "week_start": week_start,
            "issue_type": "cost_spike",
            "severity": "high" if avg_cost > 0.015 else "medium",
            "affected_count": len(expensive),
            "sample_run_ids": [r.get("id", "") for r in expensive[:5]],
            "pattern_summary": (
                f"Average cost per request ${avg_cost:.4f} above target $0.010. "
                f"{len(expensive)} requests in expensive bucket."
            ),
            "metadata": {
                "avg_cost_usd": round(avg_cost, 5),
                "expensive_run_count": len(expensive),
                "target_cost_usd": 0.010,
                "max_cost_usd": round(max(costs) if costs else 0, 5),
            },
        })

    # ── 5. Latency spike ────────────────────────────────────────────
    slow = [r for r in runs if _meta(r, "latency_bucket") == "slow"]
    if len(slow) > total * 0.25:
        latencies = [_meta(r, "latency_ms", 0) for r in slow]
        avg_lat = sum(latencies) / max(len(latencies), 1)
        issues.append({
            "week_start": week_start,
            "issue_type": "latency_spike",
            "severity": "high",
            "affected_count": len(slow),
            "sample_run_ids": [r.get("id", "") for r in slow[:5]],
            "pattern_summary": (
                f"{len(slow)} requests ({round(len(slow) / total * 100, 1)}%) classified slow. "
                f"Average latency: {int(avg_lat)}ms (target: 6000ms)."
            ),
            "metadata": {
                "slow_rate_pct": round(len(slow) / total * 100, 1),
                "avg_latency_slow_ms": int(avg_lat),
                "target_ms": 6000,
            },
        })

    # ── 6. Stale check-in + RED injury risk (SAFETY — always critical) ─
    stale_red = [
        r for r in runs
        if _meta(r, "checkin_staleness_days", 0) > 7
        and _meta(r, "injury_risk") == "RED"
    ]
    if stale_red:
        stale_days = [_meta(r, "checkin_staleness_days", 0) for r in stale_red]
        avg_stale = sum(stale_days) / len(stale_days)
        issues.append({
            "week_start": week_start,
            "issue_type": "stale_checkin_high_risk",
            "severity": "critical",
            "affected_count": len(stale_red),
            "sample_run_ids": [r.get("id", "") for r in stale_red[:5]],
            "pattern_summary": (
                f"{len(stale_red)} sessions: athlete RED injury risk but check-in "
                f"data >{int(avg_stale)} days old. Load advice based on stale baseline."
            ),
            "metadata": {"avg_staleness_days": round(avg_stale, 1)},
        })

    # ── 7. Danger-zone with no escalation (SAFETY — always critical) ─
    danger_no_escalate = [
        r for r in runs
        if _meta(r, "acwr_bucket") == "danger"
        and _meta(r, "injury_risk") == "RED"
        and not _meta(r, "phv_gate_fired")
        and not _meta(r, "crisis_detected")
    ]
    if danger_no_escalate:
        acwr_vals = [_meta(r, "acwr", 0) for r in danger_no_escalate]
        avg_acwr = sum(acwr_vals) / max(len(acwr_vals), 1)
        issues.append({
            "week_start": week_start,
            "issue_type": "danger_zone_no_escalation",
            "severity": "critical",
            "affected_count": len(danger_no_escalate),
            "sample_run_ids": [r.get("id", "") for r in danger_no_escalate[:5]],
            "pattern_summary": (
                f"{len(danger_no_escalate)} sessions: athlete in ACWR danger zone "
                f"(avg {avg_acwr:.2f}) with RED injury risk, but no safety gate fired. "
                f"No load-reduction advice provided."
            ),
            "metadata": {
                "avg_acwr": round(avg_acwr, 2),
                "tool_counts": [_meta(r, "tool_count", 0) for r in danger_no_escalate[:5]],
            },
        })

    # ── 8. RAG entity-only fallback (entities found, zero chunks) ────
    rag_empty = [
        r for r in runs
        if _meta(r, "rag_entity_count", 0) > 0
        and _meta(r, "rag_chunk_count", 0) == 0
    ]
    if len(rag_empty) > 2:
        avg_entities = sum(_meta(r, "rag_entity_count", 0) for r in rag_empty) / len(rag_empty)
        issues.append({
            "week_start": week_start,
            "issue_type": "rag_empty_chunks",
            "severity": "high",
            "affected_count": len(rag_empty),
            "sample_run_ids": [r.get("id", "") for r in rag_empty[:5]],
            "pattern_summary": (
                f"{len(rag_empty)} sessions: RAG found entities (avg {avg_entities:.0f}) "
                f"but returned zero knowledge chunks. Responses rely on model memory only — "
                f"no sports science grounding."
            ),
            "metadata": {
                "avg_entity_count": round(avg_entities, 1),
                "rag_empty_rate_pct": round(len(rag_empty) / total * 100, 1),
            },
        })

    # ── 9. Capsule cost leak (check-in on expensive full AI path) ────
    capsule_leak = [
        r for r in runs
        if _meta(r, "intent_id") == "check_in"
        and _meta(r, "path_type") == "full_ai"
    ]
    if capsule_leak:
        wasted = sum(_meta(r, "total_cost_usd", 0) for r in capsule_leak)
        issues.append({
            "week_start": week_start,
            "issue_type": "capsule_cost_leak",
            "severity": "medium",
            "affected_count": len(capsule_leak),
            "sample_run_ids": [r.get("id", "") for r in capsule_leak[:5]],
            "pattern_summary": (
                f"{len(capsule_leak)} check-in intents routed to full AI path instead "
                f"of capsule fast-path. Wasted ${wasted:.4f} on deterministic actions."
            ),
            "metadata": {
                "wasted_cost_usd": round(wasted, 4),
                "avg_tokens": round(
                    sum(_meta(r, "total_tokens", 0) for r in capsule_leak) / max(len(capsule_leak), 1)
                ),
            },
        })

    return issues


async def upsert_issues(issues: list[dict]) -> int:
    """
    Upsert issues into ai_issues using (week_start, issue_type) as key.
    Three-question overlap logic:
      Q1: Record exists? → UPDATE affected_count, sample_run_ids, pattern_summary, metadata
      Q2: Status is fix_applied/resolved? → increment recurrence_count, don't overwrite status
      Q3: Affected_count growing faster than last check? → auto-escalate severity
    Returns count of issues upserted.
    """
    if not issues:
        return 0

    pool = get_pool()
    if not pool:
        logger.error("No DB pool available for upsert")
        return 0

    upserted = 0

    async with pool.connection() as conn:
        for issue in issues:
            try:
                # Q2: Check current status before upserting
                result = await conn.execute(
                    "SELECT id, status, affected_count FROM ai_issues "
                    "WHERE week_start = %s AND issue_type = %s",
                    (issue["week_start"], issue["issue_type"]),
                )
                existing = await result.fetchone()

                if existing and existing[1] in ("fix_applied", "resolved"):
                    # Issue reappeared after fix — increment recurrence only
                    await conn.execute(
                        "UPDATE ai_issues SET recurrence_count = recurrence_count + 1, "
                        "last_seen_at = NOW(), affected_count = %s WHERE id = %s",
                        (issue["affected_count"], existing[0]),
                    )
                    upserted += 1
                    continue

                # Q3: Auto-escalate if count is growing fast
                severity = issue["severity"]
                if existing:
                    prev_count = existing[2]  # affected_count
                    new_count = issue["affected_count"]
                    if new_count > prev_count * 2 and severity == "medium":
                        severity = "high"
                    elif new_count > prev_count * 2 and severity == "high":
                        severity = "critical"

                # Q1: Safe upsert via ON CONFLICT
                import json
                await conn.execute(
                    """
                    INSERT INTO ai_issues
                      (week_start, issue_type, severity, affected_count,
                       sample_run_ids, pattern_summary, metadata, last_seen_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (week_start, issue_type) DO UPDATE SET
                      severity        = EXCLUDED.severity,
                      affected_count  = EXCLUDED.affected_count,
                      sample_run_ids  = EXCLUDED.sample_run_ids,
                      pattern_summary = EXCLUDED.pattern_summary,
                      metadata        = EXCLUDED.metadata,
                      last_seen_at    = NOW()
                    WHERE ai_issues.status NOT IN ('fix_applied', 'resolved')
                    """,
                    (
                        issue["week_start"],
                        issue["issue_type"],
                        severity,
                        issue["affected_count"],
                        issue["sample_run_ids"],
                        issue["pattern_summary"],
                        json.dumps(issue.get("metadata", {})),
                    ),
                )
                upserted += 1

            except Exception as e:
                logger.error(f"Failed to upsert issue {issue.get('issue_type')}: {e}")

    return upserted


async def write_feedback_to_langsmith(run_id: str, score: float, comment: str) -> None:
    """
    Write a quality score back to LangSmith after a fix is verified.
    score: 0.0 = bad response, 1.0 = good response.
    Closes the feedback loop — LangSmith becomes both input and output.
    """
    base, headers, _ = _get_langsmith_config()
    payload = {
        "run_id": run_id,
        "key": "tomo_quality_score",
        "score": score,
        "comment": comment,
        "source_info": {"source": "tomo_admin_fix_verified"},
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{base}/feedback", headers=headers, json=payload
            )
            resp.raise_for_status()
            logger.info(f"LangSmith feedback written for run {run_id}: score={score}")
    except Exception as e:
        logger.warning(f"Failed to write LangSmith feedback: {e}")


async def run_collection_cycle() -> dict:
    """
    Entry point: fetch → detect → upsert → return summary.
    Called every 6h by scheduler and manually via admin endpoint.
    """
    logger.info("Starting LangSmith collection cycle...")
    runs = await fetch_recent_runs(hours=6)
    issues = detect_issues(runs)
    upserted = await upsert_issues(issues)

    summary = {
        "runs_analyzed": len(runs),
        "issues_detected": len(issues),
        "issues_upserted": upserted,
        "issue_types": [i["issue_type"] for i in issues],
    }
    logger.info(f"Collection cycle complete: {summary}")
    return summary
