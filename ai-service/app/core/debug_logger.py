"""
Tomo AI Service -- Debug Logger
Persistent, cross-instance error and request logging backed by Supabase.

Replaces the in-memory error_buffer which fails silently across Railway
instances during deploys or when multiple pods are running.

Every error is:
  1. Printed to stderr immediately (Railway log capture)
  2. Written to Supabase ai_debug_errors table (persists across restarts)

Every request is:
  1. Written to Supabase ai_debug_requests table

Both are queryable via /health/errors, /health/requests, and the CMS admin panel.
"""

from __future__ import annotations

import sys
import logging
from typing import Optional

logger = logging.getLogger("tomo-ai.debug")

_MAX_TRACEBACK_LEN = 8_000   # Truncate very long tracebacks to avoid DB bloat
_MAX_MESSAGE_LEN = 500
_MAX_ERROR_LEN = 2_000


def _error_type_from_traceback(tb: str) -> str:
    """Extract the exception class name from a traceback string."""
    if not tb:
        return "UnknownError"
    for line in reversed(tb.splitlines()):
        stripped = line.strip()
        if stripped and not stripped.startswith("File") and not stripped.startswith("^") and ":" in stripped:
            return stripped.split(":")[0][:100]
    return "UnknownError"


async def log_error(
    *,
    error: str,
    node: str,
    traceback: str = "",
    user_id: str = "",
    session_id: str = "",
    request_message: str = "",
    intent_id: str = "",
    severity: str = "error",
) -> None:
    """
    Persist an error to Supabase ai_debug_errors.

    Always prints to stderr first so Railway captures it even if Supabase write fails.
    Never raises — debug logging must never block the response path.
    """
    # 1. Immediate stderr flush (Railway log capture — works regardless of instance)
    print(
        f"[TOMO-DEBUG:{severity.upper()}] node={node} "
        f"user={user_id[:8] if user_id else '-'} "
        f"session={session_id[:8] if session_id else '-'} "
        f"intent={intent_id or '-'}\n"
        f"error={error[:300]}\n"
        f"{traceback[:600] if traceback else ''}",
        file=sys.stderr,
        flush=True,
    )

    # 2. Write to Supabase (cross-instance persistent storage)
    try:
        from app.db.supabase import get_pool
        pool = get_pool()
        if pool is None:
            logger.warning("[debug_logger] DB pool not initialized — skipping Supabase write")
            return

        async with pool.connection() as conn:
            await conn.execute(
                """
                INSERT INTO ai_debug_errors
                  (user_id, session_id, node, error_type, error_message,
                   traceback, request_message, intent_id, severity)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id[:255] if user_id else None,
                    session_id[:255] if session_id else None,
                    node[:100] if node else None,
                    _error_type_from_traceback(traceback),
                    error[:_MAX_ERROR_LEN],
                    traceback[:_MAX_TRACEBACK_LEN] if traceback else None,
                    request_message[:_MAX_MESSAGE_LEN] if request_message else None,
                    intent_id[:100] if intent_id else None,
                    severity[:20],
                ),
            )
    except Exception as db_err:
        # Never let debug logging crash the app
        print(
            f"[TOMO-DEBUG] Supabase write failed: {db_err}",
            file=sys.stderr,
            flush=True,
        )


async def log_request(
    *,
    user_id: str = "",
    session_id: str = "",
    message: str = "",
    intent_id: str = "",
    agent: str = "",
    flow_pattern: str = "",
    status: str = "success",
    latency_ms: float = 0.0,
    cost_usd: float = 0.0,
    tokens_used: int = 0,
) -> None:
    """
    Persist request telemetry to Supabase ai_debug_requests.
    Used to track every chat turn through the system.
    Never raises.
    """
    try:
        from app.db.supabase import get_pool
        pool = get_pool()
        if pool is None:
            return

        async with pool.connection() as conn:
            await conn.execute(
                """
                INSERT INTO ai_debug_requests
                  (user_id, session_id, message, intent_id, agent,
                   flow_pattern, status, latency_ms, cost_usd, tokens_used)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id[:255] if user_id else None,
                    session_id[:255] if session_id else None,
                    message[:_MAX_MESSAGE_LEN] if message else None,
                    intent_id[:100] if intent_id else None,
                    agent[:100] if agent else None,
                    flow_pattern[:100] if flow_pattern else None,
                    status[:20],
                    latency_ms or None,
                    cost_usd or None,
                    tokens_used or None,
                ),
            )
    except Exception as db_err:
        print(
            f"[TOMO-DEBUG] Request write failed: {db_err}",
            file=sys.stderr,
            flush=True,
        )


async def get_recent_errors(
    limit: int = 50,
    user_id: Optional[str] = None,
    severity: Optional[str] = None,
    node: Optional[str] = None,
    hours: int = 24,
) -> list[dict]:
    """
    Fetch recent errors from Supabase. Returns [] if DB unavailable.
    Used by /health/errors and the CMS admin panel.
    """
    try:
        from app.db.supabase import get_pool
        pool = get_pool()
        if pool is None:
            return []

        # Build dynamic WHERE clauses
        where_parts = ["created_at > now() - make_interval(hours => %s)"]
        params: list = [hours]

        if user_id:
            where_parts.append("user_id = %s")
            params.append(user_id)
        if severity:
            where_parts.append("severity = %s")
            params.append(severity)
        if node:
            where_parts.append("node = %s")
            params.append(node)

        params.append(min(limit, 200))

        async with pool.connection() as conn:
            result = await conn.execute(
                f"""
                SELECT id, created_at, user_id, session_id, node,
                       error_type, error_message, traceback, request_message,
                       intent_id, severity, resolved_at
                FROM ai_debug_errors
                WHERE {" AND ".join(where_parts)}
                ORDER BY created_at DESC
                LIMIT %s
                """,
                params,
            )
            rows = await result.fetchall()

        return [
            {
                "id": str(row[0]),
                "created_at": str(row[1]),
                "user_id": row[2],
                "session_id": row[3],
                "node": row[4],
                "error_type": row[5],
                "error_message": row[6],
                "traceback": row[7],
                "request_message": row[8],
                "intent_id": row[9],
                "severity": row[10],
                "resolved": row[11] is not None,
            }
            for row in rows
        ]
    except Exception as e:
        logger.warning(f"[debug_logger] get_recent_errors failed: {e}")
        return []


async def get_recent_requests(
    limit: int = 100,
    user_id: Optional[str] = None,
    status: Optional[str] = None,
    hours: int = 24,
) -> list[dict]:
    """
    Fetch recent request telemetry from Supabase. Returns [] if DB unavailable.
    """
    try:
        from app.db.supabase import get_pool
        pool = get_pool()
        if pool is None:
            return []

        where_parts = ["created_at > now() - make_interval(hours => %s)"]
        params: list = [hours]

        if user_id:
            where_parts.append("user_id = %s")
            params.append(user_id)
        if status:
            where_parts.append("status = %s")
            params.append(status)

        params.append(min(limit, 500))

        async with pool.connection() as conn:
            result = await conn.execute(
                f"""
                SELECT id, created_at, user_id, session_id, message,
                       intent_id, agent, flow_pattern, status,
                       latency_ms, cost_usd, tokens_used
                FROM ai_debug_requests
                WHERE {" AND ".join(where_parts)}
                ORDER BY created_at DESC
                LIMIT %s
                """,
                params,
            )
            rows = await result.fetchall()

        return [
            {
                "id": str(row[0]),
                "created_at": str(row[1]),
                "user_id": row[2],
                "session_id": row[3],
                "message": row[4],
                "intent_id": row[5],
                "agent": row[6],
                "flow_pattern": row[7],
                "status": row[8],
                "latency_ms": float(row[9]) if row[9] else None,
                "cost_usd": float(row[10]) if row[10] else None,
                "tokens_used": int(row[11]) if row[11] else None,
            }
            for row in rows
        ]
    except Exception as e:
        logger.warning(f"[debug_logger] get_recent_requests failed: {e}")
        return []
