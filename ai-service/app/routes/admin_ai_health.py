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
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.config import get_settings
from app.db.supabase import get_pool
from app.services.langsmith_collector import (
    run_collection_cycle,
    write_feedback_to_langsmith,
)
from app.services.issue_analyzer import analyze_open_issues
from app.services.weekly_trend_analyzer import run_weekly_trend_analysis
from app.services.monthly_digest_generator import run_monthly_digest

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
    Fetches recent LangSmith runs, detects issues, generates fixes.
    Called by APScheduler every 6h and manually via admin CMS.
    """
    result = await run_collection_cycle()
    fixes = await analyze_open_issues()
    return {**result, "fixes_generated": fixes}


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
