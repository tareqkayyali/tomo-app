"""
Tomo AI Service — AI Health Admin Routes
LangSmith feedback loop management endpoints.

All endpoints protected by X-Service-Key (same pattern as tenants.py).
TypeScript admin CMS proxy adds the key when forwarding requests.

Endpoints:
  POST /admin/ai-health/collect        — Layer 1: 6h pulse (manual trigger)
  POST /admin/ai-health/weekly-trend   — Layer 2: weekly trend (manual trigger)
  POST /admin/ai-health/monthly-digest — Layer 3: monthly digest (manual trigger)
  GET  /admin/ai-health/issues         — Fix queue for CMS page
  GET  /admin/ai-health/digest/latest  — Latest monthly digest
  PATCH /admin/ai-health/fixes/{fix_id}/status — Mark fix applied/verified
  GET  /admin/ai-health/dashboard      — Observability dashboard (global + per-agent stats)
  GET  /admin/ai-health/traces         — Paginated trace browser with filters
  POST /admin/ai-health/insights/filtered — Filtered insights (scoped generate_insights)
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import get_settings
from app.db.supabase import get_pool
from app.services.langsmith_collector import (
    fetch_recent_runs,
    run_collection_cycle,
    write_feedback_to_langsmith,
)
from app.services.issue_analyzer import analyze_open_issues
from app.services.weekly_trend_analyzer import run_weekly_trend_analysis
from app.services.monthly_digest_generator import run_monthly_digest
from app.services.insights_engine import generate_insights

logger = logging.getLogger("tomo-ai.routes.admin_ai_health")

router = APIRouter(prefix="/admin/ai-health", tags=["admin-ai-health"])


# ── Auth ─────────────────────────────────────────────────────────────────────

def _verify_service_key(
    x_service_key: Optional[str] = Header(None, alias="X-Service-Key"),
):
    """Verify the service-to-service key from TypeScript proxy."""
    settings = get_settings()
    if not settings.ts_backend_service_key:
        return  # No service key configured — allow (development mode)
    if x_service_key != settings.ts_backend_service_key:
        raise HTTPException(status_code=401, detail="Invalid service key")


# ── Layer Triggers ───────────────────────────────────────────────────────────

@router.post("/collect")
async def trigger_collection(_: None = Depends(_verify_service_key)):
    """
    Layer 1 — 6h acute pulse.
    Fetches traces, runs 9 detectors, generates insights + fixes.
    Called by APScheduler every 6h and manually via admin CMS.
    """
    result = await run_collection_cycle()
    fixes = await analyze_open_issues()

    # Generate domain-aware insights from trace data
    insights_result = []
    try:
        traces = await fetch_recent_runs(hours=6)
        if traces:
            insights_result = await generate_insights(traces)
    except Exception as e:
        logger.error(f"Insights generation failed: {e}")

    return {
        **result,
        "fixes_generated": fixes,
        "insights": insights_result,
    }


@router.get("/insights")
async def get_insights(_: None = Depends(_verify_service_key)):
    """
    Generate fresh domain-aware insights from recent traces.
    Returns 5 analysis reports covering safety, coaching, routing, cost, dual-load.
    Each insight is a Haiku-generated narrative with severity and highlighted traces.
    """
    try:
        traces = await fetch_recent_runs(hours=24)
        if not traces:
            return {"insights": [], "traces_analyzed": 0, "message": "No traces in last 24h"}
        insights = await generate_insights(traces)
        return {
            "insights": insights,
            "traces_analyzed": len(traces),
        }
    except Exception as e:
        logger.error(f"Insights generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/weekly-trend")
async def trigger_weekly_trend(_: None = Depends(_verify_service_key)):
    """
    Layer 2 — weekly trend analysis.
    Compares week-over-week issue counts, writes trend_data.
    Called by APScheduler Monday 02:00 UTC.
    """
    return await run_weekly_trend_analysis()


@router.post("/monthly-digest")
async def trigger_monthly_digest(_: None = Depends(_verify_service_key)):
    """
    Layer 3 — monthly quality digest.
    Generates Haiku narrative + immutable snapshot.
    Called by APScheduler 1st of month 03:00 UTC.
    """
    return await run_monthly_digest()


# ── Read Endpoints (CMS) ────────────────────────────────────────────────────

@router.get("/issues")
async def get_issues(_: None = Depends(_verify_service_key)):
    """
    Admin CMS fix queue — active issues with fixes and trend data.
    Ordered by severity (critical first) then last_seen_at.
    """
    pool = get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database not available")

    async with pool.connection() as conn:
        # Fetch active issues
        result = await conn.execute(
            """
            SELECT i.id, i.week_start, i.issue_type, i.severity,
                   i.affected_count, i.pattern_summary, i.metadata,
                   i.trend_data, i.recurrence_count, i.last_seen_at,
                   i.status, i.created_at
            FROM ai_issues i
            WHERE i.status NOT IN ('resolved', 'dismissed')
            ORDER BY
              CASE i.severity
                WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                WHEN 'medium'   THEN 3 ELSE 4 END,
              i.last_seen_at DESC
            """,
        )
        issue_rows = await result.fetchall()

        issue_cols = [
            "id", "week_start", "issue_type", "severity",
            "affected_count", "pattern_summary", "metadata",
            "trend_data", "recurrence_count", "last_seen_at",
            "status", "created_at",
        ]

        issues = []
        for row in issue_rows:
            issue = dict(zip(issue_cols, row))

            # Parse JSONB fields
            for jf in ("metadata", "trend_data"):
                if isinstance(issue.get(jf), str):
                    try:
                        issue[jf] = json.loads(issue[jf])
                    except (json.JSONDecodeError, TypeError):
                        issue[jf] = {}

            # Serialize dates
            for df in ("week_start", "last_seen_at", "created_at"):
                if hasattr(issue.get(df), "isoformat"):
                    issue[df] = issue[df].isoformat()

            # Fetch fixes for this issue
            fix_result = await conn.execute(
                """
                SELECT id, priority, fix_type, title, description,
                       file_path, code_change, expected_impact,
                       langsmith_metric, confidence, status,
                       applied_at, created_at
                FROM ai_fixes
                WHERE issue_id = %s
                ORDER BY priority ASC
                """,
                (issue["id"],),
            )
            fix_rows = await fix_result.fetchall()

            fix_cols = [
                "id", "priority", "fix_type", "title", "description",
                "file_path", "code_change", "expected_impact",
                "langsmith_metric", "confidence", "status",
                "applied_at", "created_at",
            ]
            fixes = []
            for frow in fix_rows:
                fix = dict(zip(fix_cols, frow))
                # Serialize dates and Decimal
                for df in ("applied_at", "created_at"):
                    if hasattr(fix.get(df), "isoformat"):
                        fix[df] = fix[df].isoformat()
                if fix.get("confidence") is not None:
                    fix["confidence"] = float(fix["confidence"])
                fixes.append(fix)

            issue["fixes"] = fixes
            issues.append(issue)

    return {"issues": issues}


@router.get("/digest/latest")
async def get_latest_digest(_: None = Depends(_verify_service_key)):
    """Fetch most recent monthly digest for admin dashboard."""
    pool = get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database not available")

    async with pool.connection() as conn:
        result = await conn.execute(
            "SELECT id, month_start, narrative, top_issues, top_fixes, stats, created_at "
            "FROM ai_monthly_digest ORDER BY month_start DESC LIMIT 1",
        )
        row = await result.fetchone()

    if not row:
        return {"narrative": None}

    cols = ["id", "month_start", "narrative", "top_issues", "top_fixes", "stats", "created_at"]
    digest = dict(zip(cols, row))

    # Parse JSONB fields
    for jf in ("top_issues", "top_fixes", "stats"):
        if isinstance(digest.get(jf), str):
            try:
                digest[jf] = json.loads(digest[jf])
            except (json.JSONDecodeError, TypeError):
                digest[jf] = {}

    # Serialize dates
    for df in ("month_start", "created_at"):
        if hasattr(digest.get(df), "isoformat"):
            digest[df] = digest[df].isoformat()

    return digest


# ── Fix Status Management ────────────────────────────────────────────────────

class FixStatusUpdate(BaseModel):
    status: str
    applied_by: Optional[str] = None
    before_metric: Optional[float] = None
    after_metric: Optional[float] = None


@router.patch("/fixes/{fix_id}/status")
async def update_fix_status(
    fix_id: str,
    body: FixStatusUpdate,
    _: None = Depends(_verify_service_key),
):
    """
    Admin marks fix as applied or verified.
    When status → verified, writes feedback score back to LangSmith
    for all sample_run_ids on the parent issue.
    """
    pool = get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database not available")

    valid_statuses = {"pending", "approved", "applied", "verified", "rejected"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    async with pool.connection() as conn:
        # Update fix record
        await conn.execute(
            """
            UPDATE ai_fixes
            SET status = %s,
                applied_at = CASE WHEN %s IN ('applied', 'verified') THEN COALESCE(applied_at, NOW()) ELSE applied_at END,
                applied_by = COALESCE(%s, applied_by),
                before_metric = COALESCE(%s, before_metric),
                after_metric = COALESCE(%s, after_metric),
                verified_at = CASE WHEN %s = 'verified' THEN NOW() ELSE verified_at END
            WHERE id = %s
            """,
            (
                body.status,
                body.status,
                body.applied_by,
                body.before_metric,
                body.after_metric,
                body.status,
                fix_id,
            ),
        )

        # If fix is applied, update parent issue status
        if body.status == "applied":
            await conn.execute(
                "UPDATE ai_issues SET status = 'fix_applied' "
                "WHERE id = (SELECT issue_id FROM ai_fixes WHERE id = %s)",
                (fix_id,),
            )

        # If verified, write feedback back to LangSmith
        if body.status == "verified":
            result = await conn.execute(
                "SELECT f.langsmith_metric, i.sample_run_ids "
                "FROM ai_fixes f JOIN ai_issues i ON i.id = f.issue_id "
                "WHERE f.id = %s",
                (fix_id,),
            )
            fix_row = await result.fetchone()
            if fix_row and fix_row[1]:
                metric_name = fix_row[0] or "unknown"
                sample_ids = fix_row[1] or []
                for run_id in sample_ids[:3]:
                    try:
                        await write_feedback_to_langsmith(
                            run_id=run_id,
                            score=1.0,
                            comment=f"Fix verified: {metric_name} improved",
                        )
                    except Exception as e:
                        logger.warning(f"LangSmith feedback failed for {run_id}: {e}")

            # Update parent issue to resolved
            await conn.execute(
                "UPDATE ai_issues SET status = 'resolved', resolved_at = NOW() "
                "WHERE id = (SELECT issue_id FROM ai_fixes WHERE id = %s)",
                (fix_id,),
            )

    return {"ok": True, "fix_id": fix_id, "status": body.status}


# ── Observability Dashboard ─────────────────────────────────────────────────

def _parse_time_range(
    from_dt: Optional[str],
    to_dt: Optional[str],
) -> tuple[datetime, datetime]:
    """Parse ISO datetime strings into a (from, to) UTC range.
    Defaults to last 24 hours when either bound is missing."""
    now = datetime.now(timezone.utc)
    try:
        dt_to = datetime.fromisoformat(to_dt) if to_dt else now
    except (ValueError, TypeError):
        dt_to = now
    try:
        dt_from = datetime.fromisoformat(from_dt) if from_dt else dt_to - timedelta(hours=24)
    except (ValueError, TypeError):
        dt_from = dt_to - timedelta(hours=24)
    # Ensure timezone-aware (assume UTC if naive)
    if dt_from.tzinfo is None:
        dt_from = dt_from.replace(tzinfo=timezone.utc)
    if dt_to.tzinfo is None:
        dt_to = dt_to.replace(tzinfo=timezone.utc)
    return dt_from, dt_to


@router.get("/dashboard")
async def get_dashboard(
    _: None = Depends(_verify_service_key),
    from_dt: Optional[str] = Query(None, alias="from"),
    to_dt: Optional[str] = Query(None, alias="to"),
):
    """
    Observability dashboard — global stats + per-agent breakdown.
    Used by the CMS AI Health dashboard page.
    """
    pool = get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database not available")

    dt_from, dt_to = _parse_time_range(from_dt, to_dt)

    async with pool.connection() as conn:
        # ── Global stats ────────────────────────────────────────────
        global_result = await conn.execute(
            """
            SELECT
                COUNT(*),
                COALESCE(AVG(total_cost_usd), 0),
                COALESCE(AVG(latency_ms), 0),
                SUM(CASE WHEN validation_passed = false THEN 1 ELSE 0 END)::float
                    / NULLIF(COUNT(*), 0),
                SUM(CASE WHEN phv_gate_fired OR crisis_detected
                              OR ped_detected OR medical_warning
                         THEN 1 ELSE 0 END),
                COALESCE(SUM(total_cost_usd), 0)
            FROM ai_trace_log
            WHERE created_at BETWEEN %s AND %s
            """,
            (dt_from, dt_to),
        )
        g = await global_result.fetchone()

        global_stats = {
            "total_traces": g[0] or 0,
            "avg_cost": round(float(g[1] or 0), 6),
            "avg_latency_ms": round(float(g[2] or 0), 1),
            "error_rate": round(float(g[3] or 0) * 100, 2),
            "safety_flags": int(g[4] or 0),
            "total_cost_usd": round(float(g[5] or 0), 4),
        }

        # ── Per-agent stats ─────────────────────────────────────────
        agent_result = await conn.execute(
            """
            SELECT
                agent_type,
                COUNT(*),
                SUM(CASE WHEN validation_passed IS NOT false THEN 1 ELSE 0 END),
                AVG(total_cost_usd),
                AVG(latency_ms),
                AVG(routing_confidence),
                SUM(total_cost_usd),
                SUM(CASE WHEN phv_gate_fired OR crisis_detected
                         THEN 1 ELSE 0 END)
            FROM ai_trace_log
            WHERE created_at BETWEEN %s AND %s
            GROUP BY agent_type
            ORDER BY COUNT(*) DESC
            """,
            (dt_from, dt_to),
        )
        agent_rows = await agent_result.fetchall()

        # ── Top intents per agent ───────────────────────────────────
        intent_result = await conn.execute(
            """
            SELECT agent_type, intent_id, COUNT(*)
            FROM ai_trace_log
            WHERE created_at BETWEEN %s AND %s
            GROUP BY agent_type, intent_id
            ORDER BY agent_type, COUNT(*) DESC
            """,
            (dt_from, dt_to),
        )
        intent_rows = await intent_result.fetchall()

        # Group intents by agent, keep top 3
        agent_intents: dict[str, list[str]] = {}
        for row in intent_rows:
            agent = str(row[0] or "unknown")
            intent = str(row[1] or "unknown")
            if agent not in agent_intents:
                agent_intents[agent] = []
            if len(agent_intents[agent]) < 3:
                agent_intents[agent].append(intent)

        # ── Build agent list ────────────────────────────────────────
        agents = []
        for row in agent_rows:
            agent_type = str(row[0] or "unknown")
            total = int(row[1] or 0)
            success = int(row[2] or 0)
            error = total - success
            agents.append({
                "agent_type": agent_type,
                "total_traces": total,
                "success_count": success,
                "error_count": error,
                "success_rate": round(success / max(total, 1) * 100, 2),
                "avg_cost": round(float(row[3] or 0), 6),
                "avg_latency_ms": round(float(row[4] or 0), 1),
                "avg_confidence": round(float(row[5] or 0), 4),
                "top_intents": agent_intents.get(agent_type, []),
                "safety_flags": int(row[7] or 0),
                "cost_total_usd": round(float(row[6] or 0), 4),
            })

    return {
        "global_stats": global_stats,
        "agents": agents,
        "time_range": {
            "from": dt_from.isoformat(),
            "to": dt_to.isoformat(),
        },
    }


# ── Trace Browser ───────────────────────────────────────────────────────────

# Columns to return for each trace row
_TRACE_BROWSER_COLS = [
    "id", "created_at", "message", "assistant_response", "agent_type", "path_type",
    "intent_id", "classification_layer", "routing_confidence",
    "tool_count", "tool_names",
    "total_cost_usd", "total_tokens", "latency_ms",
    "validation_passed", "validation_flags",
    "phv_gate_fired", "crisis_detected",
    "rag_used", "sport", "age_band",
    "readiness_rag", "acwr",
    "cost_bucket", "latency_bucket",
    "turn_number", "response_length_chars",
]


def _build_trace_filters(
    dt_from: datetime,
    dt_to: datetime,
    agent_type: Optional[str],
    path_type: Optional[str],
    intent_id: Optional[str],
    validation_passed: Optional[bool],
    cost_bucket: Optional[str],
    latency_bucket: Optional[str],
) -> tuple[str, list]:
    """Build WHERE clause and params list for trace queries.
    Uses t. prefix for all columns to work with JOINed queries."""
    clauses = ["t.created_at BETWEEN %s AND %s"]
    params: list = [dt_from, dt_to]

    if agent_type is not None:
        clauses.append("t.agent_type = %s")
        params.append(agent_type)
    if path_type is not None:
        clauses.append("t.path_type = %s")
        params.append(path_type)
    if intent_id is not None:
        clauses.append("t.intent_id = %s")
        params.append(intent_id)
    if validation_passed is not None:
        clauses.append("t.validation_passed = %s")
        params.append(validation_passed)
    if cost_bucket is not None:
        clauses.append("t.cost_bucket = %s")
        params.append(cost_bucket)
    if latency_bucket is not None:
        clauses.append("t.latency_bucket = %s")
        params.append(latency_bucket)

    return " AND ".join(clauses), params


@router.get("/traces")
async def get_traces(
    _: None = Depends(_verify_service_key),
    from_dt: Optional[str] = Query(None, alias="from"),
    to_dt: Optional[str] = Query(None, alias="to"),
    agent_type: Optional[str] = Query(None),
    path_type: Optional[str] = Query(None),
    intent_id: Optional[str] = Query(None),
    validation_passed: Optional[bool] = Query(None),
    cost_bucket: Optional[str] = Query(None),
    latency_bucket: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    Paginated trace browser with optional filters.
    Used by the CMS AI Health trace-detail page.
    """
    pool = get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database not available")

    dt_from, dt_to = _parse_time_range(from_dt, to_dt)
    where_clause, params = _build_trace_filters(
        dt_from, dt_to, agent_type, path_type,
        intent_id, validation_passed, cost_bucket, latency_bucket,
    )

    cols_sql = ", ".join(f"t.{c}" for c in _TRACE_BROWSER_COLS)

    async with pool.connection() as conn:
        # ── Total count ─────────────────────────────────────────────
        count_result = await conn.execute(
            f"SELECT COUNT(*) FROM ai_trace_log t WHERE {where_clause}",
            params,
        )
        count_row = await count_result.fetchone()
        total_count = int(count_row[0]) if count_row else 0

        # ── Paginated rows with assistant_response backfill ─────────
        rows_result = await conn.execute(
            f"""SELECT {cols_sql},
                       backfill.content AS _backfill_response
                FROM ai_trace_log t
                LEFT JOIN LATERAL (
                    SELECT content FROM chat_messages
                    WHERE session_id = t.session_id
                      AND role = 'assistant'
                      AND created_at BETWEEN t.created_at AND t.created_at + interval '60 seconds'
                    ORDER BY created_at ASC LIMIT 1
                ) backfill ON t.assistant_response IS NULL
                WHERE {where_clause}
                ORDER BY t.created_at DESC LIMIT %s OFFSET %s""",
            params + [limit, offset],
        )
        rows = await rows_result.fetchall()

    all_cols = _TRACE_BROWSER_COLS + ["_backfill_response"]
    traces = []
    for row in rows:
        trace = dict(zip(all_cols, row))
        # Merge backfill into assistant_response
        if not trace.get("assistant_response") and trace.get("_backfill_response"):
            trace["assistant_response"] = trace["_backfill_response"]
        trace.pop("_backfill_response", None)
        # Serialize datetime
        if hasattr(trace.get("created_at"), "isoformat"):
            trace["created_at"] = trace["created_at"].isoformat()
        # Serialize uuid
        if trace.get("id") is not None:
            trace["id"] = str(trace["id"])
        # Ensure numeric types are JSON-safe
        for nf in ("routing_confidence", "total_cost_usd", "acwr"):
            if trace.get(nf) is not None:
                trace[nf] = float(trace[nf])
        for nf in ("tool_count", "total_tokens", "latency_ms"):
            if trace.get(nf) is not None:
                trace[nf] = int(trace[nf])
        # Parse JSONB arrays that might come as strings
        for jf in ("tool_names", "validation_flags"):
            if isinstance(trace.get(jf), str):
                try:
                    trace[jf] = json.loads(trace[jf])
                except (json.JSONDecodeError, TypeError):
                    trace[jf] = []
            elif trace.get(jf) is None:
                trace[jf] = []
        traces.append(trace)

    return {
        "traces": traces,
        "total_count": total_count,
        "limit": limit,
        "offset": offset,
    }


# ── Filtered Insights ───────────────────────────────────────────────────────

# All columns needed by generate_insights (matches langsmith_collector.TRACE_COLS)
_INSIGHTS_TRACE_COLS = [
    "id", "created_at", "request_id", "user_id", "session_id", "message",
    "assistant_response", "turn_number", "response_length_chars",
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


class FilteredInsightsRequest(BaseModel):
    agent_type: Optional[str] = None
    from_dt: Optional[str] = Field(None, alias="from")
    to_dt: Optional[str] = Field(None, alias="to")
    filters: Optional[dict] = None

    model_config = {"populate_by_name": True}


@router.post("/insights/filtered")
async def get_filtered_insights(
    body: FilteredInsightsRequest,
    _: None = Depends(_verify_service_key),
):
    """
    Generate domain-aware insights scoped to filtered trace data.
    Same output shape as GET /insights but over a user-defined subset.
    """
    pool = get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database not available")

    dt_from, dt_to = _parse_time_range(body.from_dt, body.to_dt)

    # ── Build dynamic WHERE clause ──────────────────────────────────
    # Start with the time range
    agent_type = body.agent_type
    path_type = (body.filters or {}).get("path_type")
    intent_id_filter = (body.filters or {}).get("intent_id")
    validation_filter = (body.filters or {}).get("validation_passed")
    cost_bucket_filter = (body.filters or {}).get("cost_bucket")
    latency_bucket_filter = (body.filters or {}).get("latency_bucket")

    # Cast validation_passed to bool if present
    vp: Optional[bool] = None
    if validation_filter is not None:
        vp = bool(validation_filter)

    where_clause, params = _build_trace_filters(
        dt_from, dt_to, agent_type, path_type,
        intent_id_filter, vp, cost_bucket_filter, latency_bucket_filter,
    )

    cols_sql = ", ".join(f"t.{c}" for c in _INSIGHTS_TRACE_COLS)

    try:
        async with pool.connection() as conn:
            # Main trace query with LEFT JOIN to backfill assistant_response
            # from chat_messages for traces recorded before the column was added.
            result = await conn.execute(
                f"""SELECT {cols_sql},
                           backfill.content AS _backfill_response
                    FROM ai_trace_log t
                    LEFT JOIN LATERAL (
                        SELECT content FROM chat_messages
                        WHERE session_id = t.session_id
                          AND role = 'assistant'
                          AND created_at BETWEEN t.created_at AND t.created_at + interval '60 seconds'
                        ORDER BY created_at ASC LIMIT 1
                    ) backfill ON t.assistant_response IS NULL
                    WHERE {where_clause}
                    ORDER BY t.created_at DESC LIMIT 500""",
                params,
            )
            rows = await result.fetchall()
    except Exception as e:
        logger.error(f"Filtered insights SQL query failed: {e}")
        raise HTTPException(status_code=500, detail=f"Trace query failed: {str(e)[:300]}")

    # Build trace dicts, merging backfill into assistant_response
    all_cols = _INSIGHTS_TRACE_COLS + ["_backfill_response"]
    traces = []
    for row in rows:
        trace = dict(zip(all_cols, row))
        # Use backfill if assistant_response is empty
        if not trace.get("assistant_response") and trace.get("_backfill_response"):
            trace["assistant_response"] = trace["_backfill_response"]
        trace.pop("_backfill_response", None)
        # Convert Decimal types to float for JSON serialization
        for key in ("total_cost_usd", "routing_confidence", "acwr",
                     "rag_cost_usd", "data_confidence_score"):
            if trace.get(key) is not None:
                try:
                    trace[key] = float(trace[key])
                except (TypeError, ValueError):
                    pass
        for key in ("tool_count", "total_tokens", "latency_ms",
                     "rag_latency_ms", "rag_entity_count", "rag_chunk_count",
                     "checkin_staleness_days", "turn_number", "response_length_chars"):
            if trace.get(key) is not None:
                try:
                    trace[key] = int(trace[key])
                except (TypeError, ValueError):
                    pass
        traces.append(trace)

    if not traces:
        return {
            "insights": [],
            "traces_analyzed": 0,
            "message": "No traces match the provided filters",
        }

    try:
        insights = await generate_insights(traces)
        return {
            "insights": insights,
            "traces_analyzed": len(traces),
        }
    except Exception as e:
        logger.error(f"Filtered insights generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Insights engine error: {str(e)[:300]}")
